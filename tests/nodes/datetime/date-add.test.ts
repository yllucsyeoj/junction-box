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

describe('date-add (datetime)', () => {
  test('date-add: basic', async () => {
    const graph = {
      nodes: [
        { id: 'date-add', type: 'date-add', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        { from: 'date-add', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });
});
