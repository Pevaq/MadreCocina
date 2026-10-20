// Past orders from the table the owner kept before the shop (Notion-style export, PDF or CSV):
// Pedido | Nombre | Contacto | Pago | Estado | Entrega. Pure functions (no DOM, no Supabase) so `npm test` covers them.

// Lowercase, no accents, no emoji/punctuation: "Mía ✅" → "mia".
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim()

// Header text → field. Unknown columns (like "Entregado") are ignored.
const FIELDS = { pedido: 'items', productos: 'items', producto: 'items', nombre: 'name', cliente: 'name', contacto: 'contact', canal: 'contact', pago: 'pay', estado: 'status', entrega: 'date', fecha: 'date', 'fecha entrega': 'date', 'fecha de entrega': 'date' }
const fieldOf = (header) => FIELDS[norm(header)]

// A data row needs these; anything else in the table is optional.
const REQUIRED = ['items', 'name', 'status', 'date']

// PDF: pages = [[{ str, x, y, w }]] (pdf.js text items, y grows upwards). Cells are centered or left-aligned
// under headers that aren't, so each piece of text goes to the column whose header center is nearest.
// A line without a date right under a row continues its cells (a long "Pedido" that wrapped); far below
// (a footer, a page number) it's ignored.
export function rowsFromPdf(pages) {
  const rows = []
  for (const items of pages) {
    let last = null  // the row the previous line went to, and that line's y
    let lastY = 0
    const lines = []
    for (const it of items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
      const line = lines.find((l) => Math.abs(l.y - it.y) <= 3)
      if (line) line.items.push(it)
      else lines.push({ y: it.y, items: [it] })
    }
    const head = lines.findIndex((l) => REQUIRED.every((f) => l.items.some((i) => fieldOf(i.str) === f)))
    if (head < 0) continue
    const columns = lines[head].items.map((i) => ({ field: fieldOf(i.str), center: i.x + i.w / 2 }))
    for (const line of lines.slice(head + 1)) {
      const cells = {}
      for (const it of line.items.sort((a, b) => a.x - b.x)) {
        const center = it.x + it.w / 2
        const col = columns.reduce((best, c) => (Math.abs(c.center - center) < Math.abs(best.center - center) ? c : best))
        if (col.field) cells[col.field] = cells[col.field] ? `${cells[col.field]} ${it.str.trim()}` : it.str.trim()
      }
      if (cells.date) rows.push(last = cells)
      else if (last && lastY - line.y < 16) {
        for (const [k, v] of Object.entries(cells)) last[k] = last[k] ? `${last[k]} ${v}` : v
      } else continue
      lastY = line.y
    }
  }
  return rows
}

// CSV (comma or semicolon, quotes with "" inside), first row = headers.
export function rowsFromCsv(text) {
  text = text.replace(/^﻿/, '')
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const table = [[]]
  let cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) { table.at(-1).push(cell); cell = '' }
    else if (c === '\n') { table.at(-1).push(cell.replace(/\r$/, '')); cell = ''; table.push([]) }
    else cell += c
  }
  table.at(-1).push(cell)
  const [headers = [], ...data] = table
  const fields = headers.map(fieldOf)
  if (!REQUIRED.every((f) => fields.includes(f))) return []
  return data.filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(fields.flatMap((f, i) => (f ? [[f, (r[i] ?? '').trim()]] : []))))
}

// "Pan de masa madre (x2), Focaccia, Focaccia (x2)" → [{ name: 'Pan de masa madre', qty: 2 }, { name: 'Focaccia', qty: 3 }]
export function parseItems(text) {
  const out = []
  for (const part of String(text ?? '').split(/,(?![^(]*\))/)) {
    const m = part.trim().match(/^(?:(\d+)\s*x\s+)?(.+?)(?:\s*\(?\s*x\s*(\d+)\s*\)?)?$/i)
    if (!m) continue
    const name = m[2].trim()
    const qty = Number(m[1] ?? 1) * Number(m[3] ?? 1)
    const same = out.find((l) => norm(l.name) === norm(name))
    if (same) same.qty += qty
    else out.push({ name, qty })
  }
  return out
}

// "1/08/2026" (day first, as in Argentina) or "2026-08-01" → "2026-08-01"; anything else → null.
export function parseDate(text) {
  const s = String(text ?? '').trim()
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  const [y, mo, d] = m ? [m[3], m[2], m[1]] : (m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)) ? [m[1], m[2], m[3]] : []
  if (!y) return null
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  return new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null
}

// "WhatsApp" → orders.source. Unknown channels are kept as "otro".
export function sourceOf(contact) {
  const c = norm(contact)
  if (/whats|wsp|wpp/.test(c)) return 'whatsapp'
  if (/insta/.test(c)) return 'instagram'
  if (/web|tienda|pagina/.test(c)) return 'web'
  if (/persona|presencial|local/.test(c)) return 'presencial'
  return 'otro'
}

// Only finished orders come in: those in progress are loaded with "+ Nuevo pedido", which takes the stock.
const DONE = ['listo', 'entregado', 'finalizado', 'terminado', 'completado']
export const isDone = (status) => DONE.includes(norm(status))

// The best product for a name in the file: same name, then a unique one containing it (or contained), ignoring plurals.
export function matchProduct(name, products) {
  const n = norm(name).replace(/s\b/g, '')
  const key = (p) => norm(p.name).replace(/s\b/g, '')
  const exact = products.filter((p) => key(p) === n)
  if (exact.length) return exact[0]
  const near = products.filter((p) => key(p).includes(n) || n.includes(key(p)))
  return near.length === 1 ? near[0] : null
}

// Rows → what the import screen shows. `mapping` = { normalized file name: product }, `existing` = orders already
// in the DB ({ id, customer_name, delivery_date }). Each entry: { row, order } ready to insert, or { row, reason }.
// `duplicate` flags a same name + same day order already saved (unticked by default, still importable).
export function planImport(rows, { mapping, existing, today, price }) {
  return rows.map((row) => {
    const date = parseDate(row.date)
    const items = parseItems(row.items)
    const name = String(row.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!name || !items.length) return { row, reason: 'Le falta el cliente o el pedido' }
    if (!date) return { row, reason: `Fecha no reconocida: ${row.date || '(vacía)'}` }
    if (!isDone(row.status)) return { row, reason: `En curso (${row.status || 'sin estado'})` }
    if (date > today) return { row, reason: 'Entrega futura' }
    const missing = items.filter((l) => !mapping[norm(l.name)])
    if (missing.length) return { row, reason: `Sin producto elegido para ${missing.map((l) => l.name).join(', ')}` }
    const lines = items.map((l) => {
      const p = mapping[norm(l.name)]
      return { product_id: p.id, name: p.name, variant: null, qty: l.qty, price: price(p) }
    })
    const total = lines.reduce((s, l) => s + l.price * l.qty, 0)
    const pay = String(row.pay ?? '').replace(/[^\p{L}\p{N} ]/gu, '').trim()
    const notes = ['Importado', pay && `Pago: ${pay}${/⏰|⌛|⏳/.test(row.pay) ? ' (pendiente)' : ''}`].filter(Boolean).join(' · ')
    const when = `${date}T12:00:00-03:00`
    const order = {
      customer_name: name, phone: '', delivery_date: date, notes, items: lines, total, source: sourceOf(row.contact),
      status: 'delivered', amount_received: total, delivered_at: when, created_at: when,
    }
    const duplicate = existing.find((o) => o.delivery_date === date && norm(o.customer_name) === norm(name))
    return { row, order, duplicate }
  })
}
