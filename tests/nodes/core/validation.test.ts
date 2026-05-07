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

describe('Graph validation', () => {
  test('cycle detection: rejects cyclic graph with cycle_detected error', async () => {
    const graph = {
      nodes: [
        { id: 'a', type: 'const', params: { value: '1' } },
        { id: 'b', type: 'add', params: { value: '1' } },
      ],
      edges: [
        { id: 'e1', from: 'a', from_port: 'output', to: 'b', to_port: 'input' },
        { id: 'e2', from: 'b', from_port: 'output', to: 'a', to_port: 'input' },
      ],
    };
    const res = await exec(graph);
    expect(res.status).toBe('error');
    expect(res.validation_errors).toBeDefined();
    const cycleErr = res.validation_errors.find((e: any) => e.error_type === 'cycle_detected');
    expect(cycleErr).toBeDefined();
    expect(cycleErr.suggestion).toBeDefined();
  });

  test('unknown node type: returns unknown_type error with suggestion', async () => {
    const graph = {
      nodes: [{ id: 'n1', type: 'constt', params: { value: '1' } }],
      edges: [],
    };
    const res = await exec(graph);
    expect(res.status).toBe('error');
    expect(res.validation_errors[0].error_type).toBe('unknown_type');
    expect(res.validation_errors[0].suggestion).toContain('const');
  });

  test('missing_param: returns missing_param error for required param', async () => {
    const graph = {
      nodes: [
        { id: 'n1', type: 'hn-search', params: {} },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'n1', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    };
    const res = await exec(graph);
    expect(res.status).toBe('error');
    const missingErr = res.validation_errors.find((e: any) => e.error_type === 'missing_param');
    expect(missingErr).toBeDefined();
    expect(missingErr.node_id).toBe('n1');
  });

  test('multiple_inputs: rejects multiple edges to same input port', async () => {
    const graph = {
      nodes: [
        { id: 'src1', type: 'const', params: { value: '1' } },
        { id: 'src2', type: 'const', params: { value: '2' } },
        { id: 'add', type: 'add', params: { value: '0' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src1', from_port: 'output', to: 'add', to_port: 'input' },
        { id: 'e2', from: 'src2', from_port: 'output', to: 'add', to_port: 'input' },
        { id: 'e3', from: 'add', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    };
    const res = await exec(graph);
    expect(res.status).toBe('error');
    const err = res.validation_errors.find((e: any) => e.error_type === 'multiple_inputs');
    expect(err).toBeDefined();
    expect(err.node_id).toBe('add');
  });
});
