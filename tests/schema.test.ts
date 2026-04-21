import { test, expect, describe } from 'bun:test';

const BASE_URL = process.env.JUNCTION_BOX_URL || 'http://localhost:3001';

async function exec(graph: object) {
  const res = await fetch(`${BASE_URL}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(graph),
  });
  return res.json();
}

async function getDefs() {
  const res = await fetch(`${BASE_URL}/defs`);
  return res.json();
}

describe('Node Schema Validation', () => {
  test('server is running', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.ok).toBe(true);
  });

  test('all nodes have required fields', async () => {
    const defs = await getDefs();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBeGreaterThan(0);

    for (const node of defs) {
      expect(node.name).toBeDefined();
      expect(typeof node.name).toBe('string');
      expect(node.category).toBeDefined();
      expect(typeof node.category).toBe('string');
      expect(node.ports).toBeDefined();
      expect(node.ports.inputs).toBeDefined();
      expect(node.ports.outputs).toBeDefined();
    }
  });

  test('all nodes have valid ports structure', async () => {
    const defs = await getDefs();
    for (const node of defs) {
      for (const input of node.ports.inputs) {
        expect(input.name).toBeDefined();
        expect(input.type).toBeDefined();
      }
      for (const output of node.ports.outputs) {
        expect(output.name).toBeDefined();
        expect(output.type).toBeDefined();
      }
    }
  });

  test('all nodes have valid params structure', async () => {
    const defs = await getDefs();
    for (const node of defs) {
      if (node.params) {
        for (const param of node.params) {
          expect(param.name).toBeDefined();
          expect(param.type).toBeDefined();
        }
      }
    }
  });

  test('no duplicate node names', async () => {
    const defs = await getDefs();
    const names = defs.map((n: any) => n.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});