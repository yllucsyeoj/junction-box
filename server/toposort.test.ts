import { expect, test } from 'bun:test'
import { toposort } from './toposort'

test('single node with no edges', () => {
  expect(toposort(['a'], [])).toEqual(['a'])
})

test('linear chain a->b->c', () => {
  const result = toposort(
    ['a', 'b', 'c'],
    [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]
  )
  expect(result.indexOf('a')).toBeLessThan(result.indexOf('b'))
  expect(result.indexOf('b')).toBeLessThan(result.indexOf('c'))
})

test('two independent source nodes', () => {
  const result = toposort(
    ['a', 'b', 'c'],
    [{ from: 'a', to: 'c' }, { from: 'b', to: 'c' }]
  )
  expect(result.indexOf('a')).toBeLessThan(result.indexOf('c'))
  expect(result.indexOf('b')).toBeLessThan(result.indexOf('c'))
})

test('detects cycle', () => {
  expect(() =>
    toposort(['a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }])
  ).toThrow('Cycle detected')
})

test('returns all nodes', () => {
  const result = toposort(['x', 'y'], [{ from: 'x', to: 'y' }])
  expect(result).toHaveLength(2)
})
