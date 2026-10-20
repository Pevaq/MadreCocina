import { useEffect, useState } from 'react'
import { supabase, money } from '../lib.js'
import { unitPrice, todayIn } from '../../supabase/functions/_shared/order.js'

// Orders taken outside the shop (WhatsApp, Instagram, in person). Same table and stock as web orders,
// so they follow the same statuses and land in the CSV. No lead-time or contact rules: the admin knows the customer.
export default function NewOrder({ sources, onClose }) {
  const [products, setProducts] = useState([])
  const [o, setO] = useState({ source: 'whatsapp', customer_name: '', phone: '', delivery_date: todayIn(), notes: '' })
  const [lines, setLines] = useState([{ product_id: '', variant_id: null, qty: 1 }])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setO({ ...o, [k]: e.target.value })

  // Hidden products too: friends may order something that isn't on the shop right now.
  useEffect(() => {
    supabase.from('products').select('id, name, price, stock, active, variants(id, name, price, active)').order('sort').order('name').order('id', { referencedTable: 'variants' })
      .then(({ data }) => setProducts(data ?? []))
  }, [])

  const full = lines.map((l) => {
    const product = products.find((p) => p.id === l.product_id)
    const variant = product?.variants.find((v) => v.id === l.variant_id)
    return { ...l, product, variant, price: product ? unitPrice(product, variant) : 0 }
  })
  const total = full.reduce((s, l) => s + l.price * l.qty, 0)
  const setLine = (i, change) => setLines(lines.map((l, j) => (j === i ? { ...l, ...change } : l)))
  const pick = (i, id) => {
    const product = products.find((p) => p.id === id)
    setLine(i, { product_id: id, variant_id: product?.variants.find((v) => v.active)?.id ?? null })
  }

  async function save(e) {
    e.preventDefault()
    const chosen = full.filter((l) => l.product)
    if (!chosen.length) return setError('Agregá al menos un producto.')
    setBusy(true)
    const items = chosen.map((l) => ({ product_id: l.product.id, name: l.product.name, variant: l.variant?.name ?? null, qty: l.qty, price: l.price }))
    const trimmed = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.trim()]))
    const { error } = await supabase.rpc('create_order', { o: { ...trimmed, items, total: items.reduce((s, l) => s + l.price * l.qty, 0) } })
    setBusy(false)
    if (!error) return onClose()
    const out = error.message.match(/out_of_stock:(\d+)/)
    setError(out ? `No hay stock suficiente de ${products.find((p) => p.id === Number(out[1]))?.name}. Ajustalo en Gestión → Productos.` : error.message)
  }

  return (
    <form className="editor solo" onSubmit={save}>
      <div className="row"><h2>Nuevo pedido</h2><button type="button" className="ghost" onClick={onClose}>Volver</button></div>

      <section className="box">
        <div className="fields">
          <label>Canal
            <select value={o.source} onChange={set('source')}>
              {Object.entries(sources).filter(([k]) => k !== 'web').map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <label>Fecha de entrega<input required type="date" value={o.delivery_date} onChange={set('delivery_date')} /></label>
        </div>
        <div className="fields">
          <label>Cliente<input required maxLength={60} value={o.customer_name} onChange={set('customer_name')} /></label>
          <label>Teléfono (opcional)<input type="tel" inputMode="tel" maxLength={25} value={o.phone} onChange={set('phone')} /></label>
        </div>
        <label>Notas<textarea maxLength={500} value={o.notes} onChange={set('notes')} /></label>
      </section>

      <section className="box">
        <h3>Productos</h3>
        {full.map((l, i) => {
          const variants = l.product?.variants.filter((v) => v.active) ?? []
          return (
            <div key={i} className="order-line">
              <select required value={l.product_id} onChange={(e) => pick(i, Number(e.target.value))} aria-label={`Producto ${i + 1}`}>
                <option value="">Elegí un producto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (oculto)'}{p.stock > 0 ? '' : ' (agotado)'}</option>
                ))}
              </select>
              {variants.length > 0 && (
                <select value={l.variant_id ?? ''} onChange={(e) => setLine(i, { variant_id: Number(e.target.value) })} aria-label={`Variante del producto ${i + 1}`}>
                  {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
              <input type="number" min="1" max="999" required value={l.qty} onChange={(e) => setLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })} aria-label={`Cantidad del producto ${i + 1}`} />
              <span>{money(l.price * l.qty)}</span>
              <button type="button" className="icon" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={`Quitar producto ${i + 1}`}>✕</button>
            </div>
          )
        })}
        <button type="button" className="ghost" onClick={() => setLines([...lines, { product_id: '', variant_id: null, qty: 1 }])}>+ Producto</button>
        <p className="row total"><strong>Total</strong><strong>{money(total)}</strong></p>
        <p className="muted">Precios de la tienda; descuenta stock como un pedido web. Si cobraste otro precio, marcalo como mayorista en el detalle del pedido.</p>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button disabled={busy}>{busy ? 'Guardando…' : 'Crear pedido'}</button>
      </div>
    </form>
  )
}
