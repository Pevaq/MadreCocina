// Receives an order from the shop, recomputes prices from the database (never trusts the client),
// checks the delivery date, takes the stock and saves it (create_order, one transaction) and emails the owner if email notifications are on.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { unitPrice, todayIn, minDeliveryDate, maxDeliveryDate, isDate, checkContact, STORE_TZ } from '../_shared/order.js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TZ = Deno.env.get('STORE_TZ') ?? STORE_TZ
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

const fail = (e: unknown) => (console.error(e), json({ error: 'No se pudo enviar el pedido. Probá de nuevo.' }, 500))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const body = await req.json().catch(() => null)
  const { contact, error: invalid } = checkContact(body ?? {})
  if (invalid) return json({ error: invalid }, 400)
  const { customer_name, phone, notes } = contact
  const delivery_date = text(body?.delivery_date, 10)
  const items = Array.isArray(body?.items) ? body.items : []
  if (!isDate(delivery_date)) return json({ error: 'Fecha inválida.' }, 400)
  if (items.length < 1 || items.length > 50) return json({ error: 'El pedido está vacío.' }, 400)
  if (!items.every((i: any) => Number.isInteger(i?.qty) && i.qty >= 1 && i.qty <= 99))
    return json({ error: 'Cantidad inválida.' }, 400)

  // Anti-bot. Honeypot: a field people never see. Turnstile: only enforced once TURNSTILE_SECRET is set.
  if (text(body?.website, 200)) return json({ error: 'No se pudo enviar el pedido.' }, 400)
  const secret = Deno.env.get('TURNSTILE_SECRET')
  if (secret) {
    const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: text(body?.captcha, 2048), remoteip: req.headers.get('cf-connecting-ip') ?? '' }),
    }).then((r) => r.json()).catch(() => null)
    if (!check?.success) return json({ error: 'No pudimos verificar que no seas un robot. Probá de nuevo.' }, 403)
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: products, error } = await db
    .from('products')
    .select('id, name, price, lead_days, stock, variants(id, name, price, active)')
    .eq('active', true)
    .in('id', items.map((i: any) => i.product_id))
  // DB errors go to the logs, not to the customer.
  if (error) return fail(error)

  const lines = []
  for (const i of items) {
    const product = products.find((p) => p.id === i.product_id)
    const variant = i.variant_id == null ? null : product?.variants.find((v) => v.id === i.variant_id && v.active)
    if (!product || (i.variant_id != null && !variant)) return json({ error: 'Un producto ya no está disponible.' }, 409)
    lines.push({ product_id: product.id, name: product.name, variant: variant?.name ?? null, qty: i.qty, price: unitPrice(product, variant), lead: product.lead_days })
  }

  const min = minDeliveryDate(todayIn(TZ), lines.map((l) => l.lead))
  if (delivery_date < min) return json({ error: `La fecha mínima de entrega es ${min}.` }, 400)
  if (delivery_date > maxDeliveryDate(todayIn(TZ))) return json({ error: 'Se puede pedir hasta con 3 meses de anticipación.' }, 400)

  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0)
  const orderItems = lines.map(({ lead, ...l }) => l)
  const ip = req.headers.get('cf-connecting-ip') // set by Supabase's Cloudflare, the client can't fake it
  const { data: id, error: insertError } = await db.rpc('create_order', {
    o: { customer_name, phone, notes, delivery_date, items: orderItems, total, ip },
  })
  if (insertError?.message.includes('too_many_orders'))
    return json({ error: 'Recibimos muchos pedidos desde tu conexión en la última hora. Escribinos por WhatsApp.' }, 429)
  const outOfStock = insertError?.message.match(/out_of_stock:(\d+)/)
  if (outOfStock) {
    const product = products.find((p) => p.id === Number(outOfStock[1]))
    return json({ error: `No hay stock suficiente de ${product?.name ?? 'un producto'}. Probá con menos unidades.` }, 409)
  }
  if (insertError) return fail(insertError)
  const order = { id }

  // The order is already saved: an email failure is logged, not shown to the customer.
  const { data: settings } = await db.from('settings').select('store_name, email_on').single()
  if (settings?.email_on) {
    const detail = orderItems.map((l) => `- ${l.qty} x ${l.name}${l.variant ? ` (${l.variant})` : ''}: $${l.price * l.qty}`).join('\n')
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${settings.store_name} <onboarding@resend.dev>`,
        to: Deno.env.get('NOTIFY_EMAIL'),
        subject: `Nuevo pedido #${order.id} - ${customer_name}`,
        text: `Cliente: ${customer_name}\nTeléfono: ${phone}\nEntrega: ${delivery_date}\n\n${detail}\n\nTotal: $${total}\n\nNotas: ${notes || '-'}`,
      }),
    }).catch((e) => e)
    if (!(res instanceof Response) || !res.ok) console.error('email failed', res instanceof Response ? await res.text() : res)
  }

  // No id: a sequential order number would tell anyone how many orders the store gets.
  return json({ total, items: orderItems })
})
