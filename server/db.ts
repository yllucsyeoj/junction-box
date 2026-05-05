import { Database } from 'bun:sqlite';

const DATA_DIR = process.env.GONUDE_DATA_DIR || './data';
let _db: Database | null = null;

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

export function upsertPatch(alias: string, description: string, graph: unknown): boolean {
  const db = getDb();
  const graphJson = typeof graph === 'string' ? graph : JSON.stringify(graph);
  const existing = db.prepare('SELECT alias FROM patches WHERE alias = ?').get(alias);
  if (existing) {
    db.prepare('UPDATE patches SET description = ?, graph = ?, updated_at = datetime(\'now\') WHERE alias = ?').run(description, graphJson, alias);
    return true;
  } else {
    db.prepare('INSERT INTO patches (alias, description, graph) VALUES (?, ?, ?)').run(alias, description, graphJson);
    return false;
  }
}

export function getPatch(alias: string): { alias: string; description: string; graph: unknown; created_at: string } | null {
  const db = getDb();
  const row = db.prepare('SELECT alias, description, graph, created_at FROM patches WHERE alias = ?').get(alias) as { alias: string; description: string; graph: string; created_at: string } | null;
  if (!row) return null;
  return {
    alias: row.alias,
    description: row.description,
    graph: JSON.parse(row.graph),
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

export function listPatches(): Array<{ alias: string; description: string; node_types: string[]; node_count: number; required_params: string[]; created_at: string }> {
  const db = getDb();
  const rows = db.prepare('SELECT alias, description, graph, created_at FROM patches ORDER BY created_at DESC').all() as Array<{ alias: string; description: string; graph: string; created_at: string }>;
  return rows.map(row => ({
    alias: row.alias,
    description: row.description,
    node_types: extractNodeTypes(row.graph),
    node_count: countNodes(row.graph),
    required_params: extractRequiredParams(row.graph),
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