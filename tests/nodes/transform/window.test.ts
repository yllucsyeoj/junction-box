import { test, expect, describe } from 'bun:test';

const BASE_URL = process.env.JUNCTION_BOX_URL || 'http://localhost:3001';

async function exec(graph) {
  const res = await fetch(`${BASE_URL}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(graph),
  });
  return res.json();
}

describe('window (transform)', () => {
  test('window: basic', async () => {
    const graph = {
      nodes: [
        { id: 'window', type: 'window', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        { from: 'window', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });
});
