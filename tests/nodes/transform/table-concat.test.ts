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

describe('table-concat (transform)', () => {
  test('table-concat: basic', async () => {
    const graph = {
      nodes: [
        { id: 'table-concat', type: 'table-concat', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        { from: 'table-concat', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('table-concat: rejects multiple edges to input port', async () => {
    const graph = {
      nodes: [
        { id: 'src1', type: 'const', params: { value: '[[{a: 1}]]' } },
        { id: 'src2', type: 'const', params: { value: '[[{b: 2}]]' } },
        { id: 'table-concat', type: 'table-concat', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        { id: 'e1', from: 'src1', from_port: 'output', to: 'table-concat', to_port: 'input' },
        { id: 'e2', from: 'src2', from_port: 'output', to: 'table-concat', to_port: 'input' },
        { id: 'e3', from: 'table-concat', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBe('error');
    expect(res.validation_errors).toBeDefined();
    expect(res.validation_errors.length).toBeGreaterThan(0);
    expect(res.validation_errors[0].error_type).toBe('multiple_inputs');
    expect(res.validation_errors[0].node_id).toBe('table-concat');
  });
});
