import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unitPrice, lineName, addDays, minDeliveryDate, orderDay, nowIn, checkContact, isDate, maxDeliveryDate, blockedDates, isBlocked, firstDate, blockedError } from './order.js'

test('variant price falls back to product price', () => {
  assert.equal(unitPrice({ price: 100 }, { price: null }), 100)
  assert.equal(unitPrice({ price: 100 }, undefined), 100)
  assert.equal(unitPrice({ price: 100 }, { price: 0 }), 0)
  assert.equal(unitPrice({ price: 100 }, { price: 150 }), 150)
})

test('a size sets the price and the variant adds its extra', () => {
  assert.equal(unitPrice({ price: 100 }, null, { price: 300 }), 300)
  assert.equal(unitPrice({ price: 100 }, { price: null }, { price: 300 }), 300)
  assert.equal(unitPrice({ price: 100 }, { price: 50 }, { price: 300 }), 350)
  assert.equal(unitPrice({ price: 100 }, { price: '50' }, { price: '300' }), 350)
})

test('line names show size and variant', () => {
  assert.equal(lineName({ name: 'Focaccia', size: 'L', variant: 'Romero' }), 'Focaccia (L · Romero)')
  assert.equal(lineName({ name: 'Focaccia', size: 'L', variant: null }), 'Focaccia (L)')
  assert.equal(lineName({ name: 'Cheesecake', variant: 'Chica' }), 'Cheesecake (Chica)')
  assert.equal(lineName({ name: 'Cookies', variant: null }), 'Cookies')
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

test('cutoff: from that time on, orders count as placed tomorrow', () => {
  assert.equal(orderDay('2026-10-31', '17:59', '18:00'), '2026-10-31')
  assert.equal(orderDay('2026-10-31', '18:00', '18:00'), '2026-11-01')
  assert.equal(orderDay('2026-10-31', '23:30', '18:00:00'), '2026-11-01')  // Postgres time comes with seconds
  assert.equal(orderDay('2026-10-31', '23:30', null), '2026-10-31')
  assert.equal(orderDay('2026-10-31', '23:30', ''), '2026-10-31')
  // Same-day product after 18 h: tomorrow. 2 days of notice: one more than before the cutoff.
  assert.equal(minDeliveryDate(orderDay('2026-10-31', '19:00', '18:00'), [0]), '2026-11-01')
  assert.equal(minDeliveryDate(orderDay('2026-10-31', '19:00', '18:00'), [2]), '2026-11-04')
  assert.match(nowIn(), /^([01]\d|2[0-3]):[0-5]\d$/)
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

test('vacation blocks delivery and the preparation days after it', () => {
  const off = { off_from: '2026-11-23', off_to: '2026-11-29' }
  assert.equal(blockedDates({ off_from: null, off_to: null }, [2]), null)
  assert.equal(firstDate('2026-11-20', null), '2026-11-20')
  // Same-day products: back on Monday 30. 2 days of notice: prepared Mon 30 and Tue 1, delivered Wed 2.
  assert.deepEqual(blockedDates(off, [0]), { from: '2026-11-23', to: '2026-11-29' })
  assert.deepEqual(blockedDates(off, [0, 2]), { from: '2026-11-23', to: '2026-12-01' })
  const b = blockedDates(off, [2])
  assert.ok(isBlocked('2026-11-23', b) && isBlocked('2026-12-01', b))
  assert.ok(!isBlocked('2026-11-22', b) && !isBlocked('2026-12-02', b))
  assert.equal(firstDate('2026-11-21', b), '2026-11-21')  // before the vacation, still fine
  assert.equal(firstDate('2026-11-25', b), '2026-12-02')
  assert.equal(blockedError(b), 'No hacemos entregas del 23/11 al 1/12. Elegí otra fecha.')
})
