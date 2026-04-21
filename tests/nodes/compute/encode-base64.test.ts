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

describe('encode-base64 (compute)', () => {
  test('encode-base64: basic', async () => {
    const graph = {
      nodes: [
        { id: 'encode-base64', type: 'encode-base64', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        { from: 'encode-base64', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });
});
