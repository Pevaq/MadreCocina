// Pure order logic shared by the shop (browser) and the place-order function (Deno).

// A variant without its own price uses the product's price.
export const unitPrice = (product, variant) => variant?.price ?? product.price

// The store's time zone: dates follow Buenos Aires, not the customer's device.
export const STORE_TZ = 'America/Argentina/Buenos_Aires'

// "YYYY-MM-DD" for today in the given time zone.
export const todayIn = (timeZone = STORE_TZ) =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())

export function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// The earliest date allowed is set by the product that needs the most notice.
// Today doesn't count: 2 days ordered on Sunday 18 → Wednesday 21. 0 days = today.
export function minDeliveryDate(today, leadDays) {
  const lead = Math.max(0, ...leadDays)
  return lead === 0 ? today : addDays(today, lead + 1)
}

// Furthest delivery date the shop accepts: further out is a typo or a bot.
export const maxDeliveryDate = (today) => addDays(today, 90)

// "YYYY-MM-DD" that exists on the calendar (rejects 2026-02-30).
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s

// Checks and tidies the customer's contact fields. Returns { contact } or { error } (shown to the customer).
// Same rules in the shop (before sending) and in place-order (the one that counts).
export function checkContact({ customer_name, phone, notes }) {
  const str = (v) => (typeof v === 'string' ? v : '')
  // One line, single spaces: the name also goes in the email subject.
  const name = str(customer_name).replace(/\s+/g, ' ').trim()
  const tel = str(phone).replace(/\s+/g, ' ').trim()
  // Control characters out, at most one blank line in a row.
  const note = str(notes).replace(/\r\n?/g, '\n').replace(/[^\P{C}\n]/gu, '').replace(/\n{3,}/g, '\n\n').trim()

  if (name.length < 2 || name.length > 60 || !/^\p{L}[\p{L}\p{M} .'’-]*$/u.test(name) || (name.match(/\p{L}/gu) ?? []).length < 2)
    return { error: 'Revisá tu nombre: solo letras y espacios, entre 2 y 60.' }
  const digits = tel.replace(/\D/g, '')
  if (!/^\+?[\d ()-]+$/.test(tel) || digits.length < 8 || digits.length > 15)
    return { error: 'Revisá el teléfono: solo números, entre 8 y 15 (con código de área).' }
  if (note.length > 500) return { error: 'Las notas pueden tener hasta 500 caracteres.' }
  return { contact: { customer_name: name, phone: tel, notes: note } }
}
