import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readyMessage, waNumber, waLink, DEFAULT_READY_MESSAGE } from './whatsapp.js'

const order = { customer_name: '  Ana María Pérez ', items: [{ qty: 2, name: 'Cookies', variant: null }, { qty: 1, name: 'Cheesecake', variant: 'Chica' }] }

test('ready message: first name, store and one line per product', () => {
  assert.equal(
    readyMessage(null, order, 'MADRE'),
    '¡Hola Ana! 😊 Te escribimos de MADRE para contarte que tu pedido ya está listo:\n\n• 2 x Cookies\n• 1 x Cheesecake (Chica)\n\n¡Gracias por elegirnos! 🧡',
  )
})

test('ready message: her own text, every placeholder replaced, empty falls back to the default', () => {
  assert.equal(readyMessage('{nombre}, ya está 👌 {nombre} · {tienda}', order, 'MADRE'), 'Ana, ya está 👌 Ana · MADRE')
  assert.equal(readyMessage('   ', order, 'MADRE'), readyMessage(DEFAULT_READY_MESSAGE, order, 'MADRE'))
  assert.doesNotMatch(DEFAULT_READY_MESSAGE, /entreg|retir|envío|buscar/i)
})

test('whatsapp number: Argentine numbers as people type them', () => {
  for (const [typed, wa] of [
    ['2477 123456', '5492477123456'],
    ['02477 15-123456', '5492477123456'],
    ['2477 15 123456', '5492477123456'],
    ['11 1234-5678', '5491112345678'],
    ['011 15 1234 5678', '5491112345678'],
    ['341 15 123 4567', '5493411234567'],
    ['+54 9 11 1234-5678', '5491112345678'],
    ['5491112345678', '5491112345678'],
    ['+54 11 1234 5678', '5491112345678'],
    ['+598 99 123 456', '59899123456'],  // another country: as typed
  ]) assert.equal(waNumber(typed), wa, typed)
})

test('whatsapp link: text encoded', () => {
  assert.equal(waLink('11 1234-5678', 'Hola & chau'), 'https://wa.me/5491112345678?text=Hola%20%26%20chau')
})
