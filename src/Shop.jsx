import { useEffect, useState } from 'react'
import { supabase, imageUrl, money } from './lib.js'
import { unitPrice, todayIn, minDeliveryDate } from '../supabase/functions/_shared/order.js'

export default function Shop() {
  const [settings, setSettings] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [category, setCategory] = useState(null)
  const [cart, setCart] = useState([])
  const [checkout, setCheckout] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    supabase.from('settings').select().single().then(({ data }) => setSettings(data))
    supabase.from('categories').select().order('sort').then(({ data }) => setCategories(data ?? []))
    supabase.from('products').select('*, variants(*)').eq('active', true).order('name').then(({ data }) => setProducts(data ?? []))
  }, [])

  useEffect(() => { if (settings) document.title = settings.store_name }, [settings])

  const add = (product, variant, qty) => setCart((c) => {
    const key = `${product.id}-${variant?.id ?? ''}`
    const found = c.find((l) => l.key === key)
    return found
      ? c.map((l) => (l === found ? { ...l, qty: l.qty + qty } : l))
      : [...c, { key, product, variant, qty }]
  })

  if (done) return <Done order={done} settings={settings} onBack={() => setDone(null)} />

  const shown = products.filter((p) => !category || p.category_id === category)
  const count = cart.reduce((n, l) => n + l.qty, 0)

  return (
    <div className="page">
      <h1>{settings?.store_name}</h1>
      <nav className="chips">
        <button className={!category ? 'on' : ''} onClick={() => setCategory(null)}>Todo</button>
        {categories.map((c) => (
          <button key={c.id} className={category === c.id ? 'on' : ''} onClick={() => setCategory(c.id)}>{c.name}</button>
        ))}
      </nav>
      <div className="grid">
        {shown.map((p) => <ProductCard key={p.id} product={p} onAdd={add} />)}
      </div>
      {count > 0 && !checkout && (
        <button className="cart-bar" onClick={() => setCheckout(true)}>Ver pedido ({count})</button>
      )}
      {checkout && (
        <Checkout
          cart={cart}
          setCart={setCart}
          onClose={() => setCheckout(false)}
          onDone={(order) => { setCart([]); setCheckout(false); setDone(order) }}
        />
      )}
    </div>
  )
}

function ProductCard({ product, onAdd }) {
  const variants = product.variants.filter((v) => v.active)
  const [variantId, setVariantId] = useState(variants[0]?.id)
  const [img, setImg] = useState(0)
  const [qty, setQty] = useState(1)
  const variant = variants.find((v) => v.id === variantId)

  return (
    <article className="card">
      {product.images.length > 0 && (
        <img src={imageUrl(product.images[img])} alt={product.name} onClick={() => setImg((img + 1) % product.images.length)} />
      )}
      {product.images.length > 1 && (
        <div className="dots">{product.images.map((_, i) => <span key={i} className={i === img ? 'on' : ''} />)}</div>
      )}
      <h3>{product.name}</h3>
      {product.description && <p className="muted">{product.description}</p>}
      <p className="muted">Pedir con {product.lead_days} día(s) de anticipación</p>
      {variants.length > 0 && (
        <select value={variantId} onChange={(e) => setVariantId(Number(e.target.value))} aria-label="Variante">
          {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      )}
      <div className="row">
        <strong>{money(unitPrice(product, variant))}</strong>
        <input type="number" min="1" max="99" value={qty} onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} aria-label="Cantidad" />
        <button onClick={() => { onAdd(product, variant, qty); setQty(1) }}>Agregar</button>
      </div>
    </article>
  )
}

function Checkout({ cart, setCart, onClose, onDone }) {
  const min = minDeliveryDate(todayIn(), cart.map((l) => l.product.lead_days))
  const [form, setForm] = useState({ customer_name: '', phone: '', delivery_date: min, notes: '' })
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const total = cart.reduce((s, l) => s + unitPrice(l.product, l.variant) * l.qty, 0)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  // Removing an item can lower the minimum; adding one can raise it past the chosen date.
  const date = form.delivery_date < min ? min : form.delivery_date

  async function submit(e) {
    e.preventDefault()
    setSending(true)
    setError('')
    const items = cart.map((l) => ({ product_id: l.product.id, variant_id: l.variant?.id ?? null, qty: l.qty }))
    const { data, error } = await supabase.functions.invoke('place-order', { body: { ...form, delivery_date: date, items } })
    setSending(false)
    if (error) {
      // The function returns a readable message in the body on 4xx.
      const body = await error.context?.json?.().catch(() => null)
      return setError(body?.error ?? 'No se pudo enviar el pedido. Probá de nuevo.')
    }
    onDone({ ...data, ...form, delivery_date: date })
  }

  return (
    <div className="sheet">
      <form onSubmit={submit}>
        <div className="row"><h2>Tu pedido</h2><button type="button" className="ghost" onClick={onClose}>Cerrar</button></div>
        {cart.map((l) => (
          <div key={l.key} className="row line">
            <span>{l.qty} × {l.product.name}{l.variant ? ` (${l.variant.name})` : ''}</span>
            <span>{money(unitPrice(l.product, l.variant) * l.qty)}</span>
            <button type="button" className="icon" onClick={() => setCart(cart.filter((x) => x !== l))} aria-label="Quitar">✕</button>
          </div>
        ))}
        <p className="row total"><strong>Total</strong><strong>{money(total)}</strong></p>
        <label>Nombre<input required value={form.customer_name} onChange={set('customer_name')} /></label>
        <label>Teléfono<input required type="tel" value={form.phone} onChange={set('phone')} /></label>
        <label>Fecha de entrega<input required type="date" min={min} value={date} onChange={set('delivery_date')} /></label>
        <label>Notas (dirección, horario, etc.)<textarea value={form.notes} onChange={set('notes')} /></label>
        {error && <p className="error">{error}</p>}
        <button disabled={sending || cart.length === 0}>{sending ? 'Enviando…' : 'Confirmar pedido'}</button>
      </form>
    </div>
  )
}

function Done({ order, settings, onBack }) {
  const lines = order.items.map((l) => `• ${l.qty} x ${l.name}${l.variant ? ` (${l.variant})` : ''}`).join('\n')
  const msg = `Hola! Soy ${order.customer_name}, hice el pedido #${order.id} para el ${order.delivery_date}:\n${lines}\nTotal: ${money(order.total)}`
  const wa = settings?.whatsapp_on && settings.whatsapp_number

  return (
    <div className="page done">
      <h1>¡Pedido recibido!</h1>
      <p>Tu pedido <strong>#{order.id}</strong> para el <strong>{order.delivery_date}</strong> quedó registrado.</p>
      <p>Total: <strong>{money(order.total)}</strong>. Te vamos a contactar al {order.phone} para coordinar.</p>
      {wa && (
        <a className="button" href={`https://wa.me/${settings.whatsapp_number}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
          Avisar por WhatsApp
        </a>
      )}
      <button onClick={onBack}>Volver a la tienda</button>
    </div>
  )
}
