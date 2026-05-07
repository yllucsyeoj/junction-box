import { Database } from 'bun:sqlite';

const DATA_DIR = process.env.GONUDE_DATA_DIR || './data';
let _db: Database | null = null;

function addColumnIfNotExists(db: Database, table: string, column: string, def: string): void {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!info.some(row => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}

export function initDb(path?: string): Database {
  const dbPath = path || `${DATA_DIR}/junction-box.db`;
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS patches (
      alias TEXT PRIMARY KEY,
      description TEXT,
      graph TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      patch_alias TEXT,
      graph TEXT NOT NULL,
      params TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (patch_alias) REFERENCES patches(alias)
    );

    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT UNIQUE NOT NULL,
      response TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES runs(run_id)
    );
  `);

  // Schema migrations for patch metadata (Phase 5.1)
  addColumnIfNotExists(db, 'patches', 'input_schema', 'TEXT');
  addColumnIfNotExists(db, 'patches', 'output_description', 'TEXT');
  addColumnIfNotExists(db, 'patches', 'tags', 'TEXT');

  // Pre-built view for querying historical runs with responses
  db.exec(`
    CREATE VIEW IF NOT EXISTS runs_v AS
    SELECT
      r.run_id,
      r.patch_alias,
      r.status,
      r.created_at AS run_at,
      json_extract(resp.response, '$.result') AS result
    FROM runs r
    LEFT JOIN responses resp ON r.run_id = resp.run_id
    ORDER BY r.created_at DESC
  `);

  // Schedules table for cron-based patch execution
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias TEXT UNIQUE NOT NULL,
      webhook TEXT,
      cron_expr TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      next_run_at TEXT,
      last_run_at TEXT,
      last_run_id TEXT,
      last_status TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (alias) REFERENCES patches(alias) ON DELETE CASCADE
    )
  `);

  // Migration: add next_run_at column if missing (added in schedule support)
  addColumnIfNotExists(db, 'schedules', 'next_run_at', 'TEXT');

  // KV store for inter-pipeline state (kv-get / kv-set nodes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER
    )
  `);

  _db = db;
  return db;
}

export function getDb(): Database {
  if (!_db) {
    _db = initDb();
  }
  return _db;
}

interface GraphNode { id: string; type: string; params: Record<string, unknown> }
interface GraphEdge { id: string; from: string; from_port: string; to: string; to_port: string }
interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

function parseGraph(graph: unknown): Graph {
  if (typeof graph === 'string') {
    return JSON.parse(graph) as Graph;
  }
  return graph as Graph;
}

function extractNodeTypes(graph: unknown): string[] {
  const g = parseGraph(graph);
  const types = new Set<string>();
  for (const node of g.nodes) {
    types.add(node.type);
  }
  return Array.from(types);
}

function countNodes(graph: unknown): number {
  const g = parseGraph(graph);
  return g.nodes.length;
}

export function insertPatch(alias: string, description: string, graph: unknown): void {
  const db = getDb();
  const graphJson = typeof graph === 'string' ? graph : JSON.stringify(graph);
  db.prepare('INSERT INTO patches (alias, description, graph) VALUES (?, ?, ?)').run(alias, description, graphJson);
}

export function upsertPatch(
  alias: string,
  description: string,
  graph: unknown,
  inputSchema?: unknown,
  outputDescription?: string,
  tags?: string[]
): boolean {
  const db = getDb();
  const graphJson = typeof graph === 'string' ? graph : JSON.stringify(graph);
  const inputSchemaJson = inputSchema !== undefined ? JSON.stringify(inputSchema) : null;
  const tagsJson = tags !== undefined ? JSON.stringify(tags) : null;
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT alias FROM patches WHERE alias = ?').get(alias);
    if (existing) {
      db.prepare("UPDATE patches SET description = ?, graph = ?, input_schema = ?, output_description = ?, tags = ?, updated_at = datetime('now') WHERE alias = ?")
        .run(description, graphJson, inputSchemaJson, outputDescription ?? null, tagsJson, alias);
      return true;
    } else {
      db.prepare('INSERT INTO patches (alias, description, graph, input_schema, output_description, tags) VALUES (?, ?, ?, ?, ?, ?)')
        .run(alias, description, graphJson, inputSchemaJson, outputDescription ?? null, tagsJson);
      return false;
    }
  });
  return tx() as boolean;
}

export function getPatch(alias: string): { alias: string; description: string; graph: unknown; input_schema: unknown; output_description: string | null; tags: string[]; created_at: string } | null {
  const db = getDb();
  const row = db.prepare('SELECT alias, description, graph, input_schema, output_description, tags, created_at FROM patches WHERE alias = ?').get(alias) as { alias: string; description: string; graph: string; input_schema: string | null; output_description: string | null; tags: string | null; created_at: string } | null;
  if (!row) return null;
  return {
    alias: row.alias,
    description: row.description,
    graph: JSON.parse(row.graph),
    input_schema: row.input_schema !== null ? JSON.parse(row.input_schema) : null,
    output_description: row.output_description,
    tags: row.tags !== null ? JSON.parse(row.tags) : [],
    created_at: row.created_at,
  };
}

export function extractRequiredParams(graph: unknown): string[] {
  const g = parseGraph(graph);
  const params: string[] = [];
  for (const node of g.nodes) {
    if (node.type !== 'const') continue;
    const val = (node.params as any)?.value;
    if (typeof val === 'string') {
      const m = val.match(/^__param__:(.+)$/);
      if (m) params.push(m[1]);
    }
  }
  return params;
}

export function listPatches(): Array<{ alias: string; description: string; node_types: string[]; node_count: number; required_params: string[]; input_schema: unknown; output_description: string | null; tags: string[]; created_at: string }> {
  const db = getDb();
  const rows = db.prepare('SELECT alias, description, graph, input_schema, output_description, tags, created_at FROM patches ORDER BY created_at DESC').all() as Array<{ alias: string; description: string; graph: string; input_schema: string | null; output_description: string | null; tags: string | null; created_at: string }>;
  return rows.map(row => ({
    alias: row.alias,
    description: row.description,
    node_types: extractNodeTypes(row.graph),
    node_count: countNodes(row.graph),
    required_params: extractRequiredParams(row.graph),
    input_schema: row.input_schema !== null ? JSON.parse(row.input_schema) : null,
    output_description: row.output_description,
    tags: row.tags !== null ? JSON.parse(row.tags) : [],
    created_at: row.created_at,
  }));
}

export function deletePatch(alias: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM patches WHERE alias = ?').run(alias);
  return result.changes > 0;
}

export function insertRun(runId: string, patchAlias: string | null, graph: unknown, params: unknown | null, status: string): void {
  const db = getDb();
  const graphJson = typeof graph === 'string' ? graph : JSON.stringify(graph);
  const paramsJson = params !== null ? (typeof params === 'string' ? params : JSON.stringify(params)) : null;
  db.prepare('INSERT INTO runs (run_id, patch_alias, graph, params, status) VALUES (?, ?, ?, ?, ?)').run(runId, patchAlias, graphJson, paramsJson, status);
}

export function updateRunStatus(runId: string, status: string): void {
  const db = getDb();
  db.prepare('UPDATE runs SET status = ? WHERE run_id = ?').run(status, runId);
}

export function getRun(runId: string): { run_id: string; patch_alias: string | null; graph: unknown; params: unknown | null; status: string; created_at: string } | null {
  const db = getDb();
  const row = db.prepare('SELECT run_id, patch_alias, graph, params, status, created_at FROM runs WHERE run_id = ?').get(runId) as { run_id: string; patch_alias: string | null; graph: string; params: string | null; status: string; created_at: string } | null;
  if (!row) return null;
  return {
    run_id: row.run_id,
    patch_alias: row.patch_alias,
    graph: JSON.parse(row.graph),
    params: row.params !== null ? JSON.parse(row.params) : null,
    status: row.status,
    created_at: row.created_at,
  };
}

export function listRuns(patchAlias?: string, limit?: number, offset?: number): { runs: Array<{ run_id: string; patch_alias: string | null; status: string; created_at: string }>; total: number } {
  const db = getDb();
  let countSql = 'SELECT COUNT(*) as total FROM runs';
  let rowsSql = 'SELECT run_id, patch_alias, status, created_at FROM runs';

  const countParams: unknown[] = [];
  const rowsParams: unknown[] = [];

  if (patchAlias !== undefined) {
    countSql += ' WHERE patch_alias = ?';
    rowsSql += ' WHERE patch_alias = ?';
    countParams.push(patchAlias);
    rowsParams.push(patchAlias);
  }

  rowsSql += ' ORDER BY created_at DESC';

  if (limit !== undefined) {
    rowsSql += ' LIMIT ?';
    rowsParams.push(limit);
  }
  if (offset !== undefined) {
    rowsSql += ' OFFSET ?';
    rowsParams.push(offset);
  }

  const totalRow = db.prepare(countSql).get(...countParams) as { total: number };
  const rows = db.prepare(rowsSql).all(...rowsParams) as Array<{ run_id: string; patch_alias: string | null; status: string; created_at: string }>;

  return {
    runs: rows.map(row => ({
      run_id: row.run_id,
      patch_alias: row.patch_alias,
      status: row.status,
      created_at: row.created_at,
    })),
    total: totalRow.total,
  };
}

export function insertResponse(runId: string, response: unknown): void {
  const db = getDb();
  const responseJson = typeof response === 'string' ? response : JSON.stringify(response);
  db.prepare('INSERT INTO responses (run_id, response) VALUES (?, ?)').run(runId, responseJson);
}

export function getResponse(runId: string): { run_id: string; response: unknown; created_at: string } | null {
  const db = getDb();
  const row = db.prepare('SELECT run_id, response, created_at FROM responses WHERE run_id = ?').get(runId) as { run_id: string; response: string; created_at: string } | null;
  if (!row) return null;
  return {
    run_id: row.run_id,
    response: JSON.parse(row.response),
    created_at: row.created_at,
  };
}

export function listRunResults(
  patchAlias: string,
  limit?: number,
  offset?: number
): Array<{ run_id: string; run_at: string; data: unknown | null }> {
  const db = getDb();
  let sql = `
    SELECT r.run_id, r.created_at, resp.response as response_json
    FROM runs r
    LEFT JOIN responses resp ON r.run_id = resp.run_id
    WHERE r.patch_alias = ?
    ORDER BY r.created_at DESC
  `;
  const params: unknown[] = [patchAlias];
  if (limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(limit);
  }
  if (offset !== undefined) {
    sql += ' OFFSET ?';
    params.push(offset);
  }
  const rows = db.prepare(sql).all(...params) as Array<{
    run_id: string;
    created_at: string;
    response_json: string | null;
  }>;
  return rows.map(row => {
    const response = row.response_json !== null ? JSON.parse(row.response_json) : null;
    return {
      run_id: row.run_id,
      run_at: row.created_at,
      data: response?.result ?? null,
    };
  });
}

export interface ScheduleRow {
  id: number;
  alias: string;
  webhook: string | null;
  cron_expr: string;
  active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_id: string | null;
  last_status: string | null;
  created_at: string;
}

export function insertSchedule(alias: string, cronExpr: string, webhook?: string, nextRunAt?: string): void {
  const db = getDb();
  db.prepare('INSERT INTO schedules (alias, cron_expr, webhook, next_run_at) VALUES (?, ?, ?, ?)')
    .run(alias, cronExpr, webhook ?? null, nextRunAt ?? null);
}

export function getSchedule(alias: string): ScheduleRow | null {
  const db = getDb();
  const row = db.prepare('SELECT id, alias, webhook, cron_expr, active, next_run_at, last_run_at, last_run_id, last_status, created_at FROM schedules WHERE alias = ?')
    .get(alias) as any;
  if (!row) return null;
  return { ...row, active: Boolean(row.active) };
}

export function listSchedules(): ScheduleRow[] {
  const db = getDb();
  const rows = db.prepare('SELECT id, alias, webhook, cron_expr, active, next_run_at, last_run_at, last_run_id, last_status, created_at FROM schedules ORDER BY created_at DESC')
    .all() as any[];
  return rows.map(row => ({ ...row, active: Boolean(row.active) }));
}

export function updateSchedule(alias: string, fields: { cron_expr?: string; webhook?: string; active?: boolean; next_run_at?: string; last_run_at?: string; last_run_id?: string; last_status?: string }): boolean {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.cron_expr !== undefined) { sets.push('cron_expr = ?'); values.push(fields.cron_expr); }
  if (fields.webhook !== undefined) { sets.push('webhook = ?'); values.push(fields.webhook); }
  if (fields.active !== undefined) { sets.push('active = ?'); values.push(fields.active ? 1 : 0); }
  if (fields.next_run_at !== undefined) { sets.push('next_run_at = ?'); values.push(fields.next_run_at); }
  if (fields.last_run_at !== undefined) { sets.push('last_run_at = ?'); values.push(fields.last_run_at); }
  if (fields.last_run_id !== undefined) { sets.push('last_run_id = ?'); values.push(fields.last_run_id); }
  if (fields.last_status !== undefined) { sets.push('last_status = ?'); values.push(fields.last_status); }
  if (sets.length === 0) return false;
  values.push(alias);
  const result = db.prepare(`UPDATE schedules SET ${sets.join(', ')} WHERE alias = ?`).run(...values);
  return result.changes > 0;
}

export function deleteSchedule(alias: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM schedules WHERE alias = ?').run(alias);
  return result.changes > 0;
}

export function deleteScheduleByPatch(alias: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM schedules WHERE alias = ?').run(alias);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// KV store — inter-pipeline persistent state (kv-get / kv-set nodes)
// ---------------------------------------------------------------------------

export function kvGet(key: string): string | null {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare('SELECT value, expires_at FROM kv WHERE key = ?').get(key) as { value: string; expires_at: number | null } | null;
  if (!row) return null;
  if (row.expires_at !== null && row.expires_at < now) {
    db.prepare('DELETE FROM kv WHERE key = ?').run(key);
    return null;
  }
  return row.value;
}

export function kvSet(key: string, value: string, ttlSeconds?: number): void {
  const db = getDb();
  const expiresAt = ttlSeconds !== undefined ? Math.floor(Date.now() / 1000) + ttlSeconds : null;
  db.prepare('INSERT INTO kv (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at')
    .run(key, value, expiresAt);
}

export function kvDelete(key: string): void {
  const db = getDb();
  db.prepare('DELETE FROM kv WHERE key = ?').run(key);
}