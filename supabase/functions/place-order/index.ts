// Receives an order from the shop, recomputes prices from the database (never trusts the client),
// checks the delivery date, saves it and emails the owner if email notifications are on.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { unitPrice, todayIn, minDeliveryDate } from '../_shared/order.js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TZ = Deno.env.get('STORE_TZ') ?? 'America/Argentina/Buenos_Aires'
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const body = await req.json().catch(() => null)
  const customer_name = text(body?.customer_name, 100)
  const phone = text(body?.phone, 30)
  const notes = text(body?.notes, 1000)
  const delivery_date = text(body?.delivery_date, 10)
  const items = Array.isArray(body?.items) ? body.items : []
  if (!customer_name || !phone) return json({ error: 'Nombre y teléfono son obligatorios.' }, 400)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(delivery_date)) return json({ error: 'Fecha inválida.' }, 400)
  if (items.length < 1 || items.length > 50) return json({ error: 'El pedido está vacío.' }, 400)
  if (!items.every((i: any) => Number.isInteger(i?.qty) && i.qty >= 1 && i.qty <= 99))
    return json({ error: 'Cantidad inválida.' }, 400)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: products, error } = await db
    .from('products')
    .select('id, name, price, lead_days, variants(id, name, price, active)')
    .eq('active', true)
    .in('id', items.map((i: any) => i.product_id))
  if (error) return json({ error: error.message }, 500)

  const lines = []
  for (const i of items) {
    const product = products.find((p) => p.id === i.product_id)
    const variant = i.variant_id == null ? null : product?.variants.find((v) => v.id === i.variant_id && v.active)
    if (!product || (i.variant_id != null && !variant)) return json({ error: 'Un producto ya no está disponible.' }, 409)
    lines.push({ name: product.name, variant: variant?.name ?? null, qty: i.qty, price: unitPrice(product, variant), lead: product.lead_days })
  }

  const min = minDeliveryDate(todayIn(TZ), lines.map((l) => l.lead))
  if (delivery_date < min) return json({ error: `La fecha mínima de entrega es ${min}.` }, 400)

  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0)
  const orderItems = lines.map(({ lead, ...l }) => l)
  const { data: order, error: insertError } = await db
    .from('orders')
    .insert({ customer_name, phone, notes, delivery_date, items: orderItems, total })
    .select('id')
    .single()
  if (insertError) return json({ error: insertError.message }, 500)

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

  return json({ id: order.id, total, items: orderItems })
})
