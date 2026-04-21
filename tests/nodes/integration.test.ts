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

  test('filter table: keep score > 80', async () => {
    const res = await exec({
      nodes: [
        { id: 'src', type: 'const', params: { value: '[[name score]; [Bob 85] [Alice 92] [Charlie 78]]' } },
        { id: 'f', type: 'filter', params: { column: 'score', op: '>', value: '80' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { from: 'src', from_port: 'output', to: 'f', to_port: 'input' },
        { from: 'f', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    });
    expect(res.status).toBe('complete');
    expect(res.result).toHaveLength(2);
  });
});