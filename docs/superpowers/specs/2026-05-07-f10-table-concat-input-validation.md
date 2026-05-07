# F-10: table-concat silently drops multiple input edges

## Problem
Wiring two source tables both to `table-concat.input` (instead of one to `input` and one to `more`) returns only the first table. The second table is silently lost with no validation error or warning.

## Design

### Validation
Add a per-node check in `server/validate.ts` that counts incoming edges where `to_port === 'input'`. If the count exceeds 1, emit a validation error with `error_type: 'multiple_inputs'`.

The error message names the node and explains that only one input edge is supported, suggesting param ports for multi-input scenarios.

### Execution
No execution changes required. `execute.ts` already uses `.find()` for the single input edge; validation now guarantees uniqueness.

### Test coverage
Add a test in `tests/nodes/transform/table-concat.test.ts` that wires two tables to `table-concat.input` and asserts a 422 response containing `multiple_inputs`.

## Scope
- `server/validate.ts`: add `multiple_inputs` validation
- `tests/nodes/transform/table-concat.test.ts`: add multi-input rejection test

## Out of scope
- Changing execution engine to support array-of-inputs
- Refactoring nodes to use named input ports (A, B) — this is a separate, broader design decision
