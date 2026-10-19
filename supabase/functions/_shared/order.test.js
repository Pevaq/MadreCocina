import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unitPrice, addDays, minDeliveryDate, checkContact, isDate, maxDeliveryDate } from './order.js'

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

test('min date uses the longest lead time, not counting today', () => {
  assert.equal(minDeliveryDate('2026-10-18', [2]), '2026-10-21')
  assert.equal(minDeliveryDate('2026-10-17', [1, 3, 0]), '2026-10-21')
  assert.equal(minDeliveryDate('2026-10-17', [1]), '2026-10-19')
  assert.equal(minDeliveryDate('2026-10-17', [0]), '2026-10-17')
  assert.equal(minDeliveryDate('2026-10-17', []), '2026-10-17')
})

test('contact: valid input is tidied', () => {
  const { contact } = checkContact({ customer_name: '  María  José\nD’Alessandro ', phone: '+54 9 (11) 2345-6789', notes: 'Timbre B\r\n\n\n\nDespués de las 18\u0007' })
  assert.deepEqual(contact, { customer_name: 'María José D’Alessandro', phone: '+54 9 (11) 2345-6789', notes: 'Timbre B\n\nDespués de las 18' })
})

test('contact: bad names, phones and notes are rejected', () => {
  const ok = { customer_name: 'Ana', phone: '1123456789', notes: '' }
  for (const customer_name of ['', 'A', '123', '=HYPERLINK("x")', 'Ana <b>', 'x'.repeat(61), '-- '])
    assert.ok(checkContact({ ...ok, customer_name }).error, customer_name)
  for (const phone of ['', '1234567', '1'.repeat(16), 'abc12345678', '11 2345 6789 int 2'])
    assert.ok(checkContact({ ...ok, phone }).error, phone)
  assert.ok(checkContact({ ...ok, notes: 'x'.repeat(501) }).error)
  assert.ok(checkContact({ ...ok, customer_name: 'Jo' }).contact)
  assert.ok(checkContact({ ...ok, customer_name: null, phone: 5 }).error)
})

test('dates: real calendar days, up to 90 days ahead', () => {
  assert.ok(isDate('2026-02-28'))
  assert.ok(!isDate('2026-02-30'))
  assert.ok(!isDate('2026-2-3'))
  assert.equal(maxDeliveryDate('2026-10-19'), '2027-01-17')
})
