import { test } from 'node:test'
import assert from 'node:assert/strict'
import { starAxisTicks } from '../src/star-history.js'

test('star axis uses rounded whole-star intervals across count ranges', () => {
  for (const [total, expected] of [
    [0, [0, 1]], [1, [0, 1]], [3, [0, 1, 2, 3]],
    [116, [0, 20, 40, 60, 80, 100, 120]],
    [120, [0, 20, 40, 60, 80, 100, 120]],
    [121, [0, 50, 100, 150]],
    [1160, [0, 200, 400, 600, 800, 1000, 1200]],
    [116000, [0, 20000, 40000, 60000, 80000, 100000, 120000]]
  ]) assert.deepEqual(starAxisTicks(total), expected)
})
