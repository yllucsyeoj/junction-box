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

describe('Schema Validation', () => {
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
      expect(Array.isArray(node.ports.inputs)).toBe(true);
      expect(Array.isArray(node.ports.outputs)).toBe(true);
    }
  });

  test('no duplicate node names', async () => {
    const defs = await getDefs();
    const names = defs.map((n: any) => n.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
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
});

describe('Core Nodes - Verified Working', () => {
  test('const: number', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '42' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [{ from: 'a', from_port: 'output', to: 'out', to_port: 'input' }],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe(42);
  });

  test('const: string', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '"hello"' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [{ from: 'a', from_port: 'output', to: 'out', to_port: 'input' }],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe('hello');
  });

  test('const: list', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '[1, 2, 3]' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [{ from: 'a', from_port: 'output', to: 'out', to_port: 'input' }],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toEqual([1, 2, 3]);
  });

  test('math: addition', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '10' } },
        { id: 'op', type: 'math', params: { op: '+', operand: '5' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe(15);
  });

  test('math: subtraction', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '10' } },
        { id: 'op', type: 'math', params: { op: '-', operand: '3' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe(7);
  });

  test('math: multiplication', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '10' } },
        { id: 'op', type: 'math', params: { op: '*', operand: '2' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe(20);
  });

  test('math: division', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '10' } },
        { id: 'op', type: 'math', params: { op: '/', operand: '2' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe(5);
  });

  test('hash: md5', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '"hello world"' } },
        { id: 'op', type: 'hash', params: { algo: 'md5' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3');
  });

  test('hash: sha256', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '"hello"' } },
        { id: 'op', type: 'hash', params: { algo: 'sha256' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  test('encode-base64', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '"hello"' } },
        { id: 'op', type: 'encode-base64', params: {} },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe('aGVsbG8=');
  });

  test('decode-base64', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '"aGVsbG8="' } },
        { id: 'op', type: 'decode-base64', params: {} },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe('hello');
  });

  test('url-encode', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '"hello world"' } },
        { id: 'op', type: 'url-encode', params: {} },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe('hello%20world');
  });

  test('url-decode', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '"hello%20world"' } },
        { id: 'op', type: 'url-decode', params: {} },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe('hello world');
  });

  test('filter with table', async () => {
    const res = await exec({
      nodes: [
        { id: 'src', type: 'const', params: { value: '[[name age]; [Alice 30] [Bob 25] [Charlie 35]]' } },
        { id: 'op', type: 'filter', params: { column: 'age', op: '>', value: '25' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toHaveLength(2);
    expect(res.result[0].name).toBe('Alice');
    expect(res.result[1].name).toBe('Charlie');
  });

  test('each with expression', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '[1, 2, 3, 4]' } },
        { id: 'op', type: 'each', params: { expr: '$in * $in' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toEqual([1, 4, 9, 16]);
  });

  test('batch splits list', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '[1, 2, 3, 4, 5, 6]' } },
        { id: 'op', type: 'batch', params: { size: '2' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toEqual([[1, 2], [3, 4], [5, 6]]);
  });
});

describe('Integration - Multi-Node Chains', () => {
  test('math chain: (10 + 5) * 2 = 30', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '10' } },
        { id: 'add', type: 'math', params: { op: '+', operand: '5' } },
        { id: 'mul', type: 'math', params: { op: '*', operand: '2' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'add', to_port: 'input' },
        { from: 'add', from_port: 'output', to: 'mul', to_port: 'input' },
        { from: 'mul', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe(30);
  });

  test('string pipeline: encode then hash', async () => {
    const res = await exec({
      nodes: [
        { id: 'a', type: 'const', params: { value: '"hello"' } },
        { id: 'enc', type: 'encode-base64', params: {} },
        { id: 'h', type: 'hash', params: { algo: 'md5' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'a', from_port: 'output', to: 'enc', to_port: 'input' },
        { from: 'enc', from_port: 'output', to: 'h', to_port: 'input' },
        { from: 'h', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result.length).toBe(32); // md5 hex length
  });

  test.skip('table: filter then sort - needs sort node', async () => {
    // sort node may not be implemented yet
  });
});

describe('Table Nodes - count, rename, first, last, enumerate, get', () => {
  test('count: table row count', async () => {
    const res = await exec({
      nodes: [
        { id: 'src', type: 'const', params: { value: '[[name age]; [Alice 30] [Bob 25] [Charlie 35]]' } },
        { id: 'op', type: 'count', params: {} },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe(3);
  });

  test('rename: column name change', async () => {
    const res = await exec({
      nodes: [
        { id: 'src', type: 'const', params: { value: '[[name age]; [Alice 30] [Bob 25]]' } },
        { id: 'op', type: 'rename', params: { from: 'age', to: 'years' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result[0].years).toBe(30);
    expect(res.result[1].years).toBe(25);
    expect(res.result[0].name).toBe('Alice');
  });

  test('first: first N rows of table', async () => {
    const res = await exec({
      nodes: [
        { id: 'src', type: 'const', params: { value: '[[name age]; [Alice 30] [Bob 25] [Charlie 35]]' } },
        { id: 'op', type: 'first', params: { n: '2' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toHaveLength(2);
    expect(res.result[0].name).toBe('Alice');
    expect(res.result[1].name).toBe('Bob');
  });

  test('last: last N rows of table', async () => {
    const res = await exec({
      nodes: [
        { id: 'src', type: 'const', params: { value: '[[name age]; [Alice 30] [Bob 25] [Charlie 35]]' } },
        { id: 'op', type: 'last', params: { n: '2' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toHaveLength(2);
    expect(res.result[0].name).toBe('Bob');
    expect(res.result[1].name).toBe('Charlie');
  });

  test('enumerate: list to indexed table', async () => {
    const res = await exec({
      nodes: [
        { id: 'src', type: 'const', params: { value: '["a" "b" "c"]' } },
        { id: 'op', type: 'enumerate', params: {} },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toHaveLength(3);
    expect(res.result[0].index).toBe(0);
    expect(res.result[0].value).toBe('a');
    expect(res.result[1].index).toBe(1);
    expect(res.result[1].value).toBe('b');
    expect(res.result[2].index).toBe(2);
    expect(res.result[2].value).toBe('c');
  });

  test('get: record field access', async () => {
    const res = await exec({
      nodes: [
        { id: 'src', type: 'const', params: { value: '{name: "Alice" age: 30}' } },
        { id: 'op', type: 'get', params: { key: 'name' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe('Alice');
  });

  test('get: list index access', async () => {
    const res = await exec({
      nodes: [
        { id: 'src', type: 'const', params: { value: '["first" "second" "third"]' } },
        { id: 'op', type: 'get', params: { key: '1' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
        { from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toBe('second');
  });
});