import { useEffect, useState } from 'react'
import { supabase, imageUrl, money, longDate } from './lib.js'
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
    supabase.from('products').select('*, variants(*)').eq('active', true).order('sort').order('name').order('id', { referencedTable: 'variants' }).then(({ data }) => setProducts(data ?? []))
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
  const wa = whatsapp(settings)

  return (
    <div className="page">
      <header className="brand"><h1><img src="logo.svg" alt={settings?.store_name ?? 'Madre'} width="820" height="444" /></h1></header>
      <nav className="chips">
        <button className={!category ? 'on' : ''} onClick={() => setCategory(null)}>Todo</button>
        {categories.map((c) => (
          <button key={c.id} className={category === c.id ? 'on' : ''} onClick={() => setCategory(c.id)}>{c.name}</button>
        ))}
      </nav>
      <div className="grid">
        {shown.map((p) => (
          <ProductCard key={p.id} product={p} onAdd={add} inCart={cart.reduce((n, l) => n + (l.product.id === p.id ? l.qty : 0), 0)} />
        ))}
      </div>
      <footer className="label">
        <img src="panadero.svg" alt="" width="458" height="523" />
        SIN CONSERVANTES · PRODUCTO LOCAL
      </footer>
      {count > 0 && !checkout && (
        <button className="cart-bar" onClick={() => setCheckout(true)}>Ver pedido ({count})</button>
      )}
      {wa && !checkout && (
        <a className={`wa-float${count > 0 ? ' up' : ''}`} href={wa} target="_blank" rel="noreferrer">
          <img src="galleta.svg" alt="" width="472" height="476" />
          WhatsApp
        </a>
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

// Stock is per product: all its variants and cart lines share it.
function ProductCard({ product, onAdd, inCart }) {
  const variants = product.variants.filter((v) => v.active)
  const [variantId, setVariantId] = useState(variants[0]?.id)
  const [img, setImg] = useState(0)
  const [qty, setQty] = useState(1)
  const variant = variants.find((v) => v.id === variantId)
  const n = product.images.length
  const step = (d) => setImg((img + d + n) % n)
  const left = Math.min(99, product.stock - inCart)
  const q = Math.min(qty, left)

  return (
    <article className="card item">
      <div className="gallery">
        {n > 0 && <img src={imageUrl(product.images[img])} alt={product.name} onClick={() => step(1)} />}
        {product.stock <= 0 && <span className="badge">Agotado</span>}
        {n > 1 && (
          <>
            <button type="button" className="prev" onClick={() => step(-1)} aria-label="Foto anterior">‹</button>
            <button type="button" className="next" onClick={() => step(1)} aria-label="Foto siguiente">›</button>
            <div className="dots">{product.images.map((_, i) => <span key={i} className={i === img ? 'on' : ''} />)}</div>
          </>
        )}
      </div>
      <div className="body">
        <h3>{product.name}</h3>
        {product.description && <p>{product.description}</p>}
        {product.lead_days > 0 && <p className="lead">Pedir con {product.lead_days === 1 ? "1 día" : `${product.lead_days} días`} de anticipación</p>}
        {variants.length > 0 && (
          <select value={variantId} onChange={(e) => setVariantId(Number(e.target.value))} aria-label="Variante">
            {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
      </div>
      <div className="buy">
        <strong>{money(unitPrice(product, variant))}</strong>
        {left > 0 ? (
          <>
            <div className="qty">
              <button type="button" onClick={() => setQty(Math.max(1, q - 1))} disabled={q <= 1} aria-label="Uno menos">−</button>
              <span aria-label="Cantidad">{q}</span>
              <button type="button" onClick={() => setQty(Math.min(left, q + 1))} disabled={q >= left} aria-label="Uno más">+</button>
            </div>
            <button className="add" onClick={() => { onAdd(product, variant, q); setQty(1) }}>Agregar</button>
          </>
        ) : (
          <button className="add" disabled>{product.stock > 0 ? 'Ya en tu pedido' : 'Agotado'}</button>
        )}
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

// wa.me link to the store, or null when WhatsApp is off or has no number.
const whatsapp = (settings, text) =>
  settings?.whatsapp_on && settings.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number}${text ? `?text=${encodeURIComponent(text)}` : ''}`
    : null

// The order number is not shown: it would tell customers how many orders the store gets.
function Done({ order, settings, onBack }) {
  const [copied, setCopied] = useState(false)
  const date = longDate(order.delivery_date)
  const alias = settings?.transfer_alias
  const lines = order.items.map((l) => `• ${l.qty} x ${l.name}${l.variant ? ` (${l.variant})` : ''}`).join('\n')
  const msg = `Hola! Soy ${order.customer_name}, hice un pedido para el ${date}:\n${lines}\nTotal: ${money(order.total)}${alias ? '\nTe mando el comprobante de la transferencia.' : ''}`
  const wa = whatsapp(settings, msg)
  const copy = () => navigator.clipboard.writeText(alias).then(() => setCopied(true), () => {})

  return (
    <div className="page done">
      <img src="chef.svg" alt="" width="358" height="601" />
      <h1>¡Recibimos tu pedido!</h1>
      <p>Es para el <strong>{date}</strong>. Total: <strong>{money(order.total)}</strong>.</p>
      {alias && (
        <>
          <p>Para confirmarlo, transferí el total a este alias:</p>
          <div className="card pay">
            <strong>{alias}</strong>
            {settings.transfer_holder && <span className="muted">{settings.transfer_holder}</span>}
            <button type="button" className="ghost" onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar alias'}</button>
          </div>
        </>
      )}
      {alias && wa
        ? <p>Después mandanos el comprobante por WhatsApp y empezamos a preparar tu pedido.</p>
        : <p>Te vamos a escribir al {order.phone} para coordinar.</p>}
      {wa && <a className="button" href={wa} target="_blank" rel="noreferrer">{alias ? 'Enviar comprobante por WhatsApp' : 'Avisar por WhatsApp'}</a>}
      <button className="ghost" onClick={onBack}>Volver a la tienda</button>
    </div>
  )
}
