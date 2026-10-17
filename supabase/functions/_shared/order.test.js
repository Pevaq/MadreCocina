import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unitPrice, addDays, minDeliveryDate } from './order.js'

test('variant price falls back to product price', () => {
  assert.equal(unitPrice({ price: 100 }, { price: null }), 100)
  assert.equal(unitPrice({ price: 100 }, undefined), 100)
  assert.equal(unitPrice({ price: 100 }, { price: 0 }), 0)
  assert.equal(unitPrice({ price: 100 }, { price: 150 }), 150)
})

test('addDays crosses month and year', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01')
  assert.equal(addDays('2026-12-30', 3), '2027-01-02')
})

test('min date uses the longest lead time', () => {
  assert.equal(minDeliveryDate('2026-10-17', [1, 3, 0]), '2026-10-20')
  assert.equal(minDeliveryDate('2026-10-17', []), '2026-10-17')
})
