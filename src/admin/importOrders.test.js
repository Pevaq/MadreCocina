import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowsFromPdf, rowsFromCsv, parseItems, parseDate, sourceOf, matchProduct, planImport } from './importOrders.js'

// pdf.js text items as the owner's export lays them out: headers centered, cells left-aligned further left.
const item = (str, x, y, w = str.length * 4) => ({ str, x, y, w })
const header = (y) => [item('Pedido', 66, y, 20), item('Nombre', 190, y, 23), item('Contacto', 282, y, 26), item('Pago', 343, y, 14), item('Estado', 416, y, 19), item('Entrega', 476, y, 22), item('Entregado', 525, y, 29)]
const line = (y, pedido, nombre, contacto, pago, estado, fecha) =>
  [item(pedido, 54, y), item(nombre, 190, y), item(contacto, 268, y, 28), item(pago, 328, y - 0.1, 36), item('✅', 366, y, 8), item(estado, 401, y, 13), item(fecha, 466, y, 30)]

test('pdf: rows by line, cells by nearest header, every page', () => {
  const pages = [
    [...header(727), ...line(708, 'Pan de masa madre (x2), Focaccia', 'Ana Pérez', 'WhatsApp', 'Transferencia', 'Listo', '1/08/2026'), ...line(689, 'Cookies', 'Juan Gómez', 'Instagram', 'Efectivo', 'En proceso', '20/10/2026')],
    [...header(727), ...line(708, 'Focaccia', 'Luz Díaz', 'Web', 'Transferencia', 'Listo', '18/10/2026')],
    header(727),  // empty pages only repeat the header
  ]
  assert.deepEqual(rowsFromPdf(pages), [
    { items: 'Pan de masa madre (x2), Focaccia', name: 'Ana Pérez', contact: 'WhatsApp', pay: 'Transferencia ✅', status: 'Listo', date: '1/08/2026' },
    { items: 'Cookies', name: 'Juan Gómez', contact: 'Instagram', pay: 'Efectivo ✅', status: 'En proceso', date: '20/10/2026' },
    { items: 'Focaccia', name: 'Luz Díaz', contact: 'Web', pay: 'Transferencia ✅', status: 'Listo', date: '18/10/2026' },
  ])
})

test('pdf: a wrapped cell joins its row; a far footer is ignored', () => {
  const pages = [[...header(727), ...line(708, 'Pan de masa madre (x2),', 'Ana', 'Web', 'Transferencia', 'Listo', '1/08/2026'), item('Focaccia', 54, 698), item('3', 300, 40)]]
  assert.equal(rowsFromPdf(pages)[0].items, 'Pan de masa madre (x2), Focaccia')
  assert.equal(rowsFromPdf(pages).length, 1)
})

test('pdf without the table headers gives nothing', () => {
  assert.deepEqual(rowsFromPdf([[item('Hola', 50, 700)]]), [])
})

test('csv: comma or semicolon, quotes, BOM, unknown columns dropped', () => {
  const csv = '﻿Pedido,Nombre,Contacto,Pago,Estado,Entrega,Entregado\r\n"Pan de masa madre, Cookies",Ana,WhatsApp,Efectivo,Listo,5/10/2026,\r\n"Dice ""hola""",Juan,Web,,Listo,2026-10-06,\r\n'
  assert.deepEqual(rowsFromCsv(csv), [
    { items: 'Pan de masa madre, Cookies', name: 'Ana', contact: 'WhatsApp', pay: 'Efectivo', status: 'Listo', date: '5/10/2026' },
    { items: 'Dice "hola"', name: 'Juan', contact: 'Web', pay: '', status: 'Listo', date: '2026-10-06' },
  ])
  assert.equal(rowsFromCsv('Producto;Cliente;Estado;Fecha\nFocaccia;Ana;Listo;1/10/2026')[0].items, 'Focaccia')
  assert.deepEqual(rowsFromCsv('a,b\n1,2'), [])
})

test('items: quantities and repeated products add up', () => {
  assert.deepEqual(parseItems('Pan de masa madre (x2), Focaccia'), [{ name: 'Pan de masa madre', qty: 2 }, { name: 'Focaccia', qty: 1 }])
  assert.deepEqual(parseItems('Focaccia, Focaccia (x2)'), [{ name: 'Focaccia', qty: 3 }])
  assert.deepEqual(parseItems('2 x Cookies, Pan x3'), [{ name: 'Cookies', qty: 2 }, { name: 'Pan', qty: 3 }])
  assert.deepEqual(parseItems(''), [])
})

test('dates: day first, ISO, real days only', () => {
  assert.equal(parseDate('1/08/2026'), '2026-08-01')
  assert.equal(parseDate('21/10/2026'), '2026-10-21')
  assert.equal(parseDate('2026-10-05'), '2026-10-05')
  assert.equal(parseDate('31/02/2026'), null)
  assert.equal(parseDate('October 5, 2026'), null)
})

test('channel names → orders.source', () => {
  assert.equal(sourceOf('WhatsApp'), 'whatsapp')
  assert.equal(sourceOf('Instagram'), 'instagram')
  assert.equal(sourceOf('Web'), 'web')
  assert.equal(sourceOf('En persona'), 'presencial')
  assert.equal(sourceOf('Mail'), 'otro')
})

test('products match by name, ignoring accents, case and plurals', () => {
  const products = [{ id: 1, name: 'Pan de masa madre' }, { id: 2, name: 'Cookie' }, { id: 3, name: 'Focaccia de romero' }, { id: 4, name: 'Focaccia de olivas' }]
  assert.equal(matchProduct('pan de masa madre', products).id, 1)
  assert.equal(matchProduct('Cookies', products).id, 2)
  assert.equal(matchProduct('Focaccia', products), null)  // two candidates: the admin picks
  assert.equal(matchProduct('Alfajores', products), null)
})

test('plan: only finished, past orders with known products, at today prices, flagged if already saved', () => {
  const pan = { id: 1, name: 'Pan de masa madre', price: 9000 }
  const rows = [
    { items: 'Pan de masa madre (x2)', name: 'Ana  Pérez', contact: 'WhatsApp', pay: 'Transferencia ⏰', status: 'Listo', date: '19/10/2026' },
    { items: 'Pan de masa madre', name: 'Juan', contact: 'Web', pay: 'Efectivo 💰', status: 'En proceso', date: '20/10/2026' },
    { items: 'Pan de masa madre', name: 'Luz', contact: 'Web', pay: '', status: 'Listo', date: '25/10/2026' },
    { items: 'Alfajores', name: 'Sol', contact: 'Web', pay: '', status: 'Entregado', date: '1/10/2026' },
    { items: 'Pan de masa madre', name: 'Sol', contact: 'Web', pay: '', status: 'Listo', date: '' },
    { items: 'Pan de masa madre', name: 'Ana Perez', contact: 'Instagram', pay: 'Efectivo', status: 'listo', date: '18/10/2026' },
  ]
  const plan = planImport(rows, {
    mapping: { 'pan de masa madre': pan }, existing: [{ id: 7, customer_name: 'ana pérez', delivery_date: '2026-10-18' }],
    today: '2026-10-20', price: (p) => p.price,
  })
  assert.deepEqual(plan[0].order, {
    customer_name: 'Ana Pérez', phone: '', delivery_date: '2026-10-19', notes: 'Importado · Pago: Transferencia (pendiente)',
    items: [{ product_id: 1, name: 'Pan de masa madre', variant: null, qty: 2, price: 9000 }], total: 18000, source: 'whatsapp',
    status: 'delivered', amount_received: 18000, delivered_at: '2026-10-19T12:00:00-03:00', created_at: '2026-10-19T12:00:00-03:00',
  })
  assert.equal(plan[0].duplicate, undefined)
  assert.match(plan[1].reason, /En curso/)
  assert.equal(plan[2].reason, 'Entrega futura')
  assert.match(plan[3].reason, /Alfajores/)
  assert.match(plan[4].reason, /Fecha/)
  assert.equal(plan[5].duplicate.id, 7)
  assert.equal(plan[5].order.notes, 'Importado · Pago: Efectivo')
})
