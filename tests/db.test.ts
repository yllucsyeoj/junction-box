import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initDb, getDb, insertPatch, upsertPatch, getPatch, listPatches, deletePatch, insertRun, updateRunStatus, getRun, listRuns, insertResponse, getResponse } from '../server/db';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DB_DIR = join(import.meta.dir, '..', '.test-db');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test.db');

describe('Database', () => {
  let db: Database;

  beforeEach(() => {
    if (!existsSync(TEST_DB_DIR)) {
      mkdirSync(TEST_DB_DIR, { recursive: true });
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = initDb(TEST_DB_PATH);
  });

  afterEach(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('patches', () => {
    test('insertPatch and getPatch', () => {
      const graph = { nodes: [{ id: 'n1', type: 'const', params: {} }], edges: [] };
      insertPatch('test-patch', 'A test patch', graph);

      const patch = getPatch('test-patch');
      expect(patch).not.toBeNull();
      expect(patch!.alias).toBe('test-patch');
      expect(patch!.description).toBe('A test patch');
      expect(patch!.graph).toEqual(graph);
    });

    test('getPatch returns null for non-existent patch', () => {
      const patch = getPatch('non-existent');
      expect(patch).toBeNull();
    });

    test('upsertPatch inserts new patch', () => {
      const graph = { nodes: [{ id: 'n1', type: 'const', params: {} }], edges: [] };
      const updated = upsertPatch('new-patch', 'New patch', graph);
      expect(updated).toBe(false);

      const patch = getPatch('new-patch');
      expect(patch).not.toBeNull();
      expect(patch!.alias).toBe('new-patch');
    });

    test('upsertPatch updates existing patch', () => {
      const graph1 = { nodes: [{ id: 'n1', type: 'const', params: {} }], edges: [] };
      const graph2 = { nodes: [{ id: 'n1', type: 'const', params: {} }, { id: 'n2', type: 'return', params: {} }], edges: [] };

      insertPatch('existing-patch', 'Original', graph1);
      const updated = upsertPatch('existing-patch', 'Updated', graph2);

      expect(updated).toBe(true);
      const patch = getPatch('existing-patch');
      expect(patch!.description).toBe('Updated');
      expect(patch!.graph).toEqual(graph2);
    });

    test('listPatches returns all patches with parsed node_types', () => {
      const graph1 = { nodes: [{ id: 'n1', type: 'const', params: {} }, { id: 'n2', type: 'return', params: {} }], edges: [] };
      const graph2 = { nodes: [{ id: 'n3', type: 'llm', params: {} }, { id: 'n4', type: 'llm', params: {} }], edges: [] };

      insertPatch('patch-1', 'First patch', graph1);
      insertPatch('patch-2', 'Second patch', graph2);

      const patches = listPatches();
      expect(patches.length).toBe(2);

      const patch1 = patches.find(p => p.alias === 'patch-1');
      expect(patch1).toBeDefined();
      expect(patch1!.node_types).toContain('const');
      expect(patch1!.node_types).toContain('return');
      expect(patch1!.node_count).toBe(2);

      const patch2 = patches.find(p => p.alias === 'patch-2');
      expect(patch2).toBeDefined();
      expect(patch2!.node_types).toEqual(['llm']);
      expect(patch2!.node_count).toBe(2);
    });

    test('deletePatch removes patch', () => {
      const graph = { nodes: [], edges: [] };
      insertPatch('to-delete', 'Will be deleted', graph);

      const deleted = deletePatch('to-delete');
      expect(deleted).toBe(true);
      expect(getPatch('to-delete')).toBeNull();
    });

    test('deletePatch returns false for non-existent patch', () => {
      const deleted = deletePatch('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('runs', () => {
    test('insertRun and getRun', () => {
      const graph = { nodes: [{ id: 'n1', type: 'const', params: {} }], edges: [] };
      const params = { timeout: 30 };

      insertRun('run-123', 'test-patch', graph, params, 'pending');

      const run = getRun('run-123');
      expect(run).not.toBeNull();
      expect(run!.run_id).toBe('run-123');
      expect(run!.patch_alias).toBe('test-patch');
      expect(run!.graph).toEqual(graph);
      expect(run!.params).toEqual(params);
      expect(run!.status).toBe('pending');
    });

    test('insertRun with null patch_alias', () => {
      const graph = { nodes: [], edges: [] };
      insertRun('run-no-patch', null, graph, null, 'pending');

      const run = getRun('run-no-patch');
      expect(run).not.toBeNull();
      expect(run!.patch_alias).toBeNull();
    });

    test('updateRunStatus', () => {
      const graph = { nodes: [], edges: [] };
      insertRun('run-456', null, graph, null, 'pending');

      updateRunStatus('run-456', 'completed');

      const run = getRun('run-456');
      expect(run!.status).toBe('completed');
    });

    test('listRuns returns all runs', () => {
      const graph = { nodes: [], edges: [] };
      insertRun('run-1', null, graph, null, 'pending');
      insertRun('run-2', null, graph, null, 'completed');

      const result = listRuns();
      expect(result.runs.length).toBe(2);
      expect(result.total).toBe(2);
    });

    test('listRuns filters by patch_alias', () => {
      const graph = { nodes: [], edges: [] };
      insertRun('run-a', 'patch-1', graph, null, 'pending');
      insertRun('run-b', 'patch-2', graph, null, 'pending');
      insertRun('run-c', 'patch-1', graph, null, 'completed');

      const result = listRuns('patch-1');
      expect(result.runs.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.runs.every(r => r.patch_alias === 'patch-1')).toBe(true);
    });

    test('listRuns respects limit and offset', () => {
      const graph = { nodes: [], edges: [] };
      for (let i = 0; i < 10; i++) {
        insertRun(`run-${i}`, null, graph, null, 'pending');
      }

      const result = listRuns(undefined, 3, 5);
      expect(result.runs.length).toBe(3);
      expect(result.total).toBe(10);
    });
  });

  describe('responses', () => {
    test('insertResponse and getResponse', () => {
      const graph = { nodes: [], edges: [] };
      insertRun('run-with-response', null, graph, null, 'completed');

      const response = { output: 'test result', duration_ms: 150 };
      insertResponse('run-with-response', response);

      const result = getResponse('run-with-response');
      expect(result).not.toBeNull();
      expect(result!.run_id).toBe('run-with-response');
      expect(result!.response).toEqual(response);
    });

    test('getResponse returns null for non-existent run', () => {
      const result = getResponse('non-existent-run');
      expect(result).toBeNull();
    });

    test('response run_id is unique constraint', () => {
      const graph = { nodes: [], edges: [] };
      insertRun('unique-run', null, graph, null, 'completed');

      insertResponse('unique-run', { first: true });
      expect(() => insertResponse('unique-run', { second: true })).toThrow();
    });
  });
});