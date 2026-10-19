import { useEffect, useRef, useState } from 'react'
import { supabase, imageUrl, money, longDate, hideSplash, useDialog, useMedia, TURNSTILE_SITE_KEY, loadTurnstile } from './lib.js'
import { unitPrice, todayIn, minDeliveryDate, maxDeliveryDate, checkContact } from '../supabase/functions/_shared/order.js'

export default function Shop() {
  const [settings, setSettings] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [category, setCategory] = useState(null)
  const [cart, setCart] = useState([])
  const [checkout, setCheckout] = useState(false)
  const [done, setDone] = useState(null)
  const [said, setSaid] = useState('') // screen readers hear what "Agregar" did

  // Also reloaded after an order or a stock error, so the cards show what's left.
  const loadProducts = () =>
    supabase.from('products').select('*, variants(*)').eq('active', true).order('sort').order('name').order('id', { referencedTable: 'variants' }).then(({ data }) => {
      if (!data) return
      setProducts(data)
      // Drop cart lines whose product was hidden or deleted meanwhile, or the order keeps failing.
      setCart((c) => c.filter((l) => data.some((p) => p.id === l.product.id)))
    })

  useEffect(() => {
    // The splash stays until the catalog is in, even if a request fails, so it never hangs.
    Promise.allSettled([
      supabase.from('settings').select().single().then(({ data }) => setSettings(data)),
      supabase.from('categories').select().order('sort').then(({ data }) => setCategories(data ?? [])),
      loadProducts(),
    ]).then(hideSplash)
  }, [])

  useEffect(() => { if (settings) document.title = settings.store_name }, [settings])

  const add = (product, variant, qty) => {
    setSaid(`Agregaste ${qty} × ${product.name}${variant ? ` (${variant.name})` : ''} a tu pedido.`)
    setCart((c) => {
      const key = `${product.id}-${variant?.id ?? ''}`
      const found = c.find((l) => l.key === key)
      return found
        ? c.map((l) => (l === found ? { ...l, qty: l.qty + qty } : l))
        : [...c, { key, product, variant, qty }]
    })
  }

  // Hooks before the early return: a hook after it crashes React when the order is done.
  const wide = useMedia('(min-width: 1100px)')
  if (done) return <Done order={done} settings={settings} onBack={() => setDone(null)} />

  const shown = products.filter((p) => !category || p.category_id === category)
  const count = cart.reduce((n, l) => n + l.qty, 0)
  const wa = whatsapp(settings)
  // Desktop: the order lives in a sidebar next to the catalog instead of a dialog.
  const side = wide && count > 0
  const checkoutProps = { cart, setCart, onStale: loadProducts, onClose: () => setCheckout(false), onDone: (order) => { setCart([]); setCheckout(false); setDone(order); loadProducts() } }

  return (
    <div className={`shop${side ? ' with-side' : ''}`}>
      <main className="page">
        <header className="brand"><h1><img src="logo.svg" alt={settings?.store_name ?? 'Madre'} width="820" height="444" /></h1></header>
        {settings?.show_categories && (
          <nav className="chips">
            <button className={!category ? 'on' : ''} aria-pressed={!category} onClick={() => setCategory(null)}>Todo</button>
            {categories.map((c) => (
              <button key={c.id} className={category === c.id ? 'on' : ''} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.name}</button>
            ))}
          </nav>
        )}
        <div className="grid">
          {shown.map((p) => (
            <ProductCard key={p.id} product={p} onAdd={add} inCart={cart.reduce((n, l) => n + (l.product.id === p.id ? l.qty : 0), 0)} />
          ))}
        </div>
        <footer className="label">
          <img src="panadero.svg" alt="" width="458" height="523" />
          SIN CONSERVANTES · PRODUCTO LOCAL
        </footer>
        <p className="sr-only" aria-live="polite">{said}</p>
      </main>
      {/* Stays while the dialog is open (behind it, inert) so focus can return to it on close. */}
      {count > 0 && !side && (
        <button className="cart-bar" onClick={() => setCheckout(true)}>Ver pedido ({count})</button>
      )}
      {wa && !checkout && (
        <a className={`wa-float${count > 0 && !side ? ' up' : ''}`} href={wa} target="_blank" rel="noreferrer">
          <img src="galleta.svg" alt="" width="472" height="476" />
          WhatsApp
        </a>
      )}
      {checkout && !side && <Checkout {...checkoutProps} />}
      {side && <Checkout {...checkoutProps} inline />}
    </div>
  )
}

// Stock is per product: all its variants and cart lines share it. Also used as the backoffice preview.
export function ProductCard({ product, onAdd, inCart }) {
  const variants = product.variants.filter((v) => v.active)
  const [variantId, setVariantId] = useState(variants[0]?.id)
  const [img, setImg] = useState(0)
  const [qty, setQty] = useState(1)
  const variant = variants.find((v) => v.id === variantId)
  const n = product.images.length
  // All photos sit side by side in a scroll-snap strip: swiping is native and switching never waits on a download.
  const track = useRef(null)
  const step = (d) => {
    const t = track.current
    t.scrollTo({ left: ((img + d + n) % n) * t.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  const left = Math.min(99, product.stock - inCart)
  const q = Math.min(qty, left)

  return (
    <article className="card item">
      <div className="gallery">
        <div className="track" ref={track} onScroll={(e) => setImg(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {product.images.map((path, i) => (
            <img key={path} src={imageUrl(path)} alt={n > 1 ? `${product.name} (foto ${i + 1} de ${n})` : product.name} loading="lazy" onClick={() => step(1)} />
          ))}
        </div>
        {product.stock <= 0 && <span className="badge">Agotado</span>}
        {n > 1 && (
          <>
            <button type="button" className="prev" onClick={() => step(-1)} aria-label="Foto anterior"><Chevron left /></button>
            <button type="button" className="next" onClick={() => step(1)} aria-label="Foto siguiente"><Chevron /></button>
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
        {/* aria-disabled, not disabled: a disabled button drops keyboard focus when it hits the limit. */}
        {left > 0 && (
          <div className="qty">
            <button type="button" onClick={() => setQty(Math.max(1, q - 1))} aria-disabled={q <= 1} aria-label={`Uno menos de ${product.name}`}>−</button>
            <output aria-label={`Cantidad de ${product.name}`}>{q}</output>
            <button type="button" onClick={() => setQty(Math.min(left, q + 1))} aria-disabled={q >= left} aria-label={`Uno más de ${product.name}`}>+</button>
          </div>
        )}
        <button type="button" className="add" aria-disabled={left <= 0} onClick={() => { if (left > 0) { onAdd(product, variant, q); setQty(1) } }}>
          {left > 0 ? 'Agregar' : product.stock > 0 ? 'Ya en tu pedido' : 'Agotado'}
        </button>
      </div>
    </article>
  )
}

// Rounded chevron for the photo arrows (the ‹ › glyphs looked thin and sat off-center).
const Chevron = ({ left }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={left ? 'M14.5 6 8.5 12l6 6' : 'M9.5 6l6 6-6 6'} />
  </svg>
)

// A bottom sheet / dialog, or with `inline` the desktop sidebar (always open while there's an order).
// Two steps so it fits without scrolling: the order and its date, then the contact details.
function Checkout({ cart, setCart, onStale, onClose, onDone, inline }) {
  const min = minDeliveryDate(todayIn(), cart.map((l) => l.product.lead_days))
  // website = honeypot: hidden from people, bots fill it and place-order rejects the order.
  const [form, setForm] = useState({ customer_name: '', phone: '', delivery_date: min, notes: '', website: '' })
  const [step, setStep] = useState('order')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const total = cart.reduce((s, l) => s + unitPrice(l.product, l.variant) * l.qty, 0)
  const count = cart.reduce((n, l) => n + l.qty, 0)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const dialog = useDialog(onClose, !inline)
  // After "Editar" its button is gone: put focus back at the top of the order step.
  const edited = useRef(false)
  useEffect(() => { if (edited.current) dialog.current.querySelector('h2').focus() }, [step])
  // Removing an item can lower the minimum; adding one can raise it past the chosen date.
  const date = form.delivery_date < min ? min : form.delivery_date
  // Turnstile token for place-order. Rendered on the contact step; each token works once.
  const captchaBox = useRef(null)
  const captchaId = useRef(null)
  const [captcha, setCaptcha] = useState('')
  const [ask, setAsk] = useState(false) // Cloudflare wants a click: only then the widget shows
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || step !== 'contact') return
    let gone = false
    loadTurnstile().then((t) => {
      if (gone) return
      captchaId.current = t.render(captchaBox.current, {
        sitekey: TURNSTILE_SITE_KEY, language: 'es', size: 'flexible', appearance: 'interaction-only',
        callback: setCaptcha, 'expired-callback': () => setCaptcha(''), 'error-callback': () => setCaptcha(''),
        'before-interactive-callback': () => setAsk(true), 'after-interactive-callback': () => setAsk(false),
      })
    }, () => setError('No se pudo cargar la verificación anti-robots. Revisá tu conexión y probá de nuevo.'))
    return () => {
      gone = true
      if (captchaId.current != null) window.turnstile.remove(captchaId.current)
      captchaId.current = null
      setCaptcha('')
      setAsk(false)
    }
  }, [step])

  async function submit(e) {
    e.preventDefault()
    if (step === 'order') return setStep('contact')
    // Same check as place-order: catch typos here instead of spending the captcha token.
    const { contact, error: invalid } = checkContact(form)
    if (invalid) return setError(invalid)
    setSending(true)
    setError('')
    const items = cart.map((l) => ({ product_id: l.product.id, variant_id: l.variant?.id ?? null, qty: l.qty }))
    const { data, error } = await supabase.functions.invoke('place-order', { body: { ...form, ...contact, delivery_date: date, items, captcha } })
    setSending(false)
    if (error) {
      if (captchaId.current != null) { window.turnstile.reset(captchaId.current); setCaptcha('') }
      if (error.context?.status === 409) onStale() // out of stock or gone: refresh the catalog and the cart
      // The function returns a readable message in the body on 4xx.
      const body = await error.context?.json?.().catch(() => null)
      return setError(body?.error ?? 'No se pudo enviar el pedido. Probá de nuevo.')
    }
    onDone({ ...data, ...form, ...contact, delivery_date: date })
  }

  const body = (
    <form onSubmit={submit}>
      <div className="row">
        <h2 id="checkout-title" tabIndex={-1}>{step === 'order' ? 'Tu pedido' : 'Tus datos'}</h2>
        {!inline && <button type="button" className="ghost" onClick={onClose}>Cerrar</button>}
      </div>
      {step === 'order' ? (
        <>
          {cart.map((l) => (
            <div key={l.key} className="row line">
              <span>{l.qty} × {l.product.name}{l.variant ? ` (${l.variant.name})` : ''}</span>
              <span>{money(unitPrice(l.product, l.variant) * l.qty)}</span>
              <button type="button" className="icon" onClick={() => setCart(cart.filter((x) => x !== l))} aria-label={`Quitar ${l.product.name}${l.variant ? ` (${l.variant.name})` : ''}`}>✕</button>
            </div>
          ))}
          <p className="row total"><strong>Total</strong><strong>{money(total)}</strong></p>
          <label>Fecha de entrega<input required type="date" min={min} max={maxDeliveryDate(todayIn())} value={date} onChange={set('delivery_date')} /></label>
          <button disabled={cart.length === 0}>Continuar</button>
        </>
      ) : (
        <>
          <div className="summary">
            <span>{count === 1 ? '1 producto' : `${count} productos`} · <strong>{money(total)}</strong><br />Entrega el {longDate(date)}</span>
            <button type="button" className="ghost" onClick={() => { edited.current = true; setStep('order') }}>Editar</button>
          </div>
          <label>Nombre<input required autoFocus autoComplete="name" minLength={2} maxLength={60} value={form.customer_name} onChange={set('customer_name')} /></label>
          <label>Teléfono<input required type="tel" autoComplete="tel" inputMode="tel" maxLength={25} placeholder="Ej.: 11 2345 6789" value={form.phone} onChange={set('phone')} /></label>
          <label>Notas (dirección, horario, etc.)<textarea maxLength={500} value={form.notes} onChange={set('notes')} /></label>
          <div className="trap" aria-hidden="true">
            <label>Sitio web<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
          </div>
          {TURNSTILE_SITE_KEY && <div ref={captchaBox} className={`captcha${ask ? ' ask' : ''}`} />}
          {error && <p className="error" role="alert">{error}</p>}
          <button disabled={sending || cart.length === 0 || (TURNSTILE_SITE_KEY && !captcha)}>{sending ? 'Enviando…' : TURNSTILE_SITE_KEY && !captcha ? 'Verificando…' : 'Confirmar pedido'}</button>
        </>
      )}
    </form>
  )
  return inline
    ? <aside ref={dialog} className="side" aria-labelledby="checkout-title">{body}</aside>
    : <div ref={dialog} className="sheet" role="dialog" aria-modal="true" aria-labelledby="checkout-title">{body}</div>
}

// wa.me link to the store, or null when WhatsApp is off or has no number.
const whatsapp = (settings, text) =>
  settings?.whatsapp_on && settings.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number}${text ? `?text=${encodeURIComponent(text)}` : ''}`
    : null

// The order number is not shown: it would tell customers how many orders the store gets.
function Done({ order, settings, onBack }) {
  const [copied, setCopied] = useState(false)
  // A new screen: start keyboard and screen reader users at its title.
  const title = useRef(null)
  useEffect(() => { scrollTo(0, 0); title.current.focus() }, [])
  const date = longDate(order.delivery_date)
  const alias = settings?.transfer_alias
  const lines = order.items.map((l) => `• ${l.qty} x ${l.name}${l.variant ? ` (${l.variant})` : ''}`).join('\n')
  const msg = `Hola! Soy ${order.customer_name}, hice un pedido para el ${date}:\n${lines}\nTotal: ${money(order.total)}${alias ? '\nTe mando el comprobante de la transferencia.' : ''}`
  const wa = whatsapp(settings, msg)
  const copy = () => navigator.clipboard.writeText(alias).then(() => setCopied(true), () => {})

  return (
    <main className="page done">
      <img src="chef.svg" alt="" width="358" height="601" />
      <h1 ref={title} tabIndex={-1}>¡Recibimos tu pedido!</h1>
      <p>Es para el <strong>{date}</strong>. Total: <strong>{money(order.total)}</strong>.</p>
      {alias && (
        <>
          <p>Para confirmarlo, transferí el total a este alias:</p>
          <div className="card pay">
            <strong>{alias}</strong>
            {settings.transfer_holder && <span className="muted">{settings.transfer_holder}</span>}
            <button type="button" className="ghost" onClick={copy}><span aria-live="polite">{copied ? 'Copiado ✓' : 'Copiar alias'}</span></button>
          </div>
        </>
      )}
      {alias && wa
        ? <p>Después mandanos el comprobante por WhatsApp y empezamos a preparar tu pedido.</p>
        : <p>Te vamos a escribir al {order.phone} para coordinar.</p>}
      {wa && <a className="button" href={wa} target="_blank" rel="noreferrer">{alias ? 'Enviar comprobante por WhatsApp' : 'Avisar por WhatsApp'}</a>}
      <button className="ghost" onClick={onBack}>Volver a la tienda</button>
    </main>
  )
}
