// Pure order logic shared by the shop (browser) and the place-order function (Deno).

// A variant without its own price uses the product's price.
export const unitPrice = (product, variant) => variant?.price ?? product.price

// "YYYY-MM-DD" for today in the given time zone (undefined = the runtime's own).
export const todayIn = (timeZone) =>
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
