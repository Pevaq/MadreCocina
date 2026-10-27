import { useEffect, useState } from 'react'
import { supabase, money, longDate, useDialog } from '../lib.js'
import { todayIn, addDays } from '../../supabase/functions/_shared/order.js'
import TrashIcon from './TrashIcon.jsx'
import NewOrder from './NewOrder.jsx'
import ImportOrders from './ImportOrders.jsx'
import { readyMessage, waNumber, waLink } from './whatsapp.js'

const itemsText = (items) => items.map((l) => `${l.qty} x ${l.name}${l.variant ? ` (${l.variant})` : ''}`).join(', ')

// Order progression. Any step can be skipped; "Entregado" moves it to Finalizados.
const STATUSES = { pending: 'Recibido', paid: 'Pagado', preparing: 'En preparación', ready: 'Listo', delivered: 'Entregado' }

// orders.source: the shop, or loaded by hand from the backoffice ("Nuevo pedido").
const SOURCES = { web: 'Web', whatsapp: 'WhatsApp', instagram: 'Instagram', presencial: 'En persona', otro: 'Otro' }

const dayTitle = (iso, today, pending) =>
  pending && iso < today ? `Atrasado · ${longDate(iso)}`
    : iso === today ? `Hoy · ${longDate(iso)}`
    : iso === addDays(today, pending ? 1 : -1) ? `${pending ? 'Mañana' : 'Ayer'} · ${longDate(iso)}`
    : longDate(iso)

// Pendientes = every status but delivered; Finalizados = delivered. Same table.
export default function Orders({ status }) {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [settings, setSettings] = useState(null)
  const [notify, setNotify] = useState(null)  // order just marked Listo: offer to tell the customer
  const pending = status === 'pending'

  const load = () => {
    const q = supabase.from('orders').select()
    return (pending ? q.neq('status', 'delivered') : q.eq('status', 'delivered'))
      .order('delivery_date', { ascending: pending }).order('id')
      .then(({ data, error }) => { setOrders(data ?? []); setError(error?.message ?? '') })
  }

  useEffect(() => { load() }, [status])
  useEffect(() => { supabase.from('settings').select('store_name, ready_message').single().then(({ data }) => setSettings(data)) }, [])

  // Delivered orders record what was charged: the total, or the typed amount for wholesale.
  // Optimistic: the card updates at once, then the list reloads (an order changing tab disappears).
  async function update(order, change) {
    const next = { ...order, ...change }
    if (next.status === 'delivered') {
      change = { ...change, delivered_at: order.delivered_at ?? new Date().toISOString() }
      if (!next.wholesale) change.amount_received = order.total
      else if (next.amount_received == null) change.amount_received = order.total
    }
    setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, ...change } : o)))
    const { error } = await supabase.from('orders').update(change).eq('id', order.id)
    if (error) setError(error.message)
    else if (next.status === 'ready' && order.status !== 'ready') {
      // Only one dialog at a time: the detail closes and the WhatsApp offer takes its place.
      setOpenId(null)
      setNotify(next)
    }
    load()
  }

  async function remove(order) {
    if (!confirm(`¿Borrar el pedido #${order.id}? No se puede deshacer.${order.status !== 'delivered' ? ' Su stock vuelve a la tienda.' : ''} Los pedidos siguientes bajan un número.`)) return
    const { error } = await supabase.from('orders').delete().eq('id', order.id)
    if (error) return setError(error.message)
    setOpenId(null)
    load()
  }

  function exportCsv() {
    // A leading ' stops Excel/Sheets from running a customer-typed name like =HYPERLINK(...) as a formula.
    const cell = (v) => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`
    const rows = [['Pedido', 'Fecha entrega', 'Canal', 'Cliente', 'Productos', 'Total', 'Mayorista', 'Monto cobrado']]
      .concat(orders.map((o) => [o.id, o.delivery_date, SOURCES[o.source], o.customer_name, itemsText(o.items), o.total, o.wholesale ? 'Sí' : 'No', o.amount_received]))
    // BOM so Excel/Sheets read accents correctly.
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'pedidos-finalizados.csv' })
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const received = orders.reduce((s, o) => s + Number(o.amount_received ?? 0), 0)
  const open = orders.find((o) => o.id === openId)
  const today = todayIn()
  const days = [...new Set(orders.map((o) => o.delivery_date))]

  if (creating) return <NewOrder sources={SOURCES} onClose={() => { setCreating(false); load() }} />
  if (importing) return <ImportOrders sources={SOURCES} onClose={() => { setImporting(false); load() }} />

  return (
    <section>
      {error && <p className="error" role="alert">{error}</p>}
      {pending && <button onClick={() => setCreating(true)}>+ Nuevo pedido</button>}
      {!pending && (
        <div className="row">
          <span>{orders.length > 0 && <>Total cobrado: <strong>{money(received)}</strong></>}</span>
          <div className="row">
            <button className="ghost" onClick={() => setImporting(true)}>Importar pedidos</button>
            {orders.length > 0 && <button onClick={exportCsv}>Exportar CSV</button>}
          </div>
        </div>
      )}
      {orders.length === 0 && <p className="muted">No hay pedidos.</p>}
      {days.map((day) => (
        <div key={day} className="day">
          <h3 className={pending && day < today ? 'late' : ''}>{dayTitle(day, today, pending)}</h3>
          {orders.filter((o) => o.delivery_date === day).map((o) => (
            <OrderRow key={o.id} order={o} onOpen={() => setOpenId(o.id)} onUpdate={update} onRemove={remove} />
          ))}
        </div>
      ))}
      {open && <OrderDetail key={open.id} order={open} onClose={() => setOpenId(null)} onUpdate={update} onRemove={remove} />}
      {notify && <ReadyNotice key={notify.id} order={notify} settings={settings} onClose={() => setNotify(null)} />}
    </section>
  )
}

function StatusSelect({ order, onUpdate }) {
  return (
    <select className={`status ${order.status}`} value={order.status} onChange={(e) => onUpdate(order, { status: e.target.value })} aria-label={`Estado del pedido #${order.id}`}>
      {Object.entries(STATUSES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
    </select>
  )
}

function OrderRow({ order, onOpen, onUpdate, onRemove }) {
  return (
    <article className="card order" onClick={onOpen}>
      <div className="row">
        <strong>{order.customer_name}</strong>
        <strong>{money(order.wholesale && order.amount_received != null ? order.amount_received : order.total)}</strong>
      </div>
      <p className="items">{itemsText(order.items)}</p>
      {/* Changing the status must not also open the detail. */}
      <div className="row" onClick={(e) => e.stopPropagation()}>
        <StatusSelect order={order} onUpdate={onUpdate} />
        <span className="muted">{order.source !== 'web' && `${SOURCES[order.source]} · `}{order.wholesale && 'Mayorista · '}#{order.id}</span>
        <button type="button" className="icon delete" onClick={() => onRemove(order)} aria-label={`Borrar pedido #${order.id}`}><TrashIcon /></button>
      </div>
    </article>
  )
}

function OrderDetail({ order, onClose, onUpdate, onRemove }) {
  const [amount, setAmount] = useState(order.amount_received ?? order.total)
  const phone = order.phone.replace(/\D/g, '') && waNumber(order.phone)
  const saveAmount = () => amount !== '' && Number(amount) !== Number(order.amount_received) && onUpdate(order, { amount_received: Number(amount) })
  // Escape closes without a blur: save the typed amount first.
  const dialog = useDialog(() => { if (order.wholesale) saveAmount(); onClose() })

  return (
    <div className="sheet" onClick={onClose}>
      <div ref={dialog} className="panel order-detail" role="dialog" aria-modal="true" aria-labelledby="order-title" onClick={(e) => e.stopPropagation()}>
        <header className="row">
          <h2 id="order-title" tabIndex={-1}>Pedido #{order.id}</h2>
          <button type="button" className="ghost" onClick={onClose}>Cerrar</button>
        </header>

        <dl className="facts">
          <dt>Estado</dt><dd><StatusSelect order={order} onUpdate={onUpdate} /></dd>
          <dt>Entrega</dt><dd>{longDate(order.delivery_date)}</dd>
          <dt>Cliente</dt><dd>{order.customer_name}</dd>
          <dt>Teléfono</dt><dd>{phone ? <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">{order.phone}</a> : '—'}</dd>
          <dt>Canal</dt><dd>{SOURCES[order.source]}</dd>
          {order.notes && <><dt>Notas</dt><dd>{order.notes}</dd></>}
          <dt>Pedido el</dt><dd>{new Date(order.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</dd>
        </dl>

        <div className="lines">
          {order.items.map((l, i) => (
            <div key={i} className="line">
              <span>{l.qty} × {l.name}{l.variant ? ` (${l.variant})` : ''}</span>
              <span>{money(l.price * l.qty)}</span>
            </div>
          ))}
          <div className="line total"><strong>Total</strong><strong>{money(order.total)}</strong></div>
        </div>

        <div className="wholesale">
          <label className="check">
            <input type="checkbox" checked={order.wholesale} onChange={(e) => onUpdate(order, e.target.checked
              ? { wholesale: true, amount_received: Number(amount) }
              : { wholesale: false, amount_received: order.status === 'delivered' ? order.total : null })} />
            Precio mayorista
          </label>
          {order.wholesale && (
            <label className="amount">Cobrado
              <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={saveAmount} />
            </label>
          )}
        </div>

        <button type="button" className="ghost danger" onClick={() => onRemove(order)}>Borrar pedido</button>
      </div>
    </div>
  )
}

// After "Listo": a ready-made WhatsApp message to the customer, editable just for this time.
// The default text lives in Ajustes; it opens her WhatsApp, she presses send there.
function ReadyNotice({ order, settings, onClose }) {
  const [text, setText] = useState(() => readyMessage(settings?.ready_message, order, settings?.store_name))
  const hasPhone = order.phone.replace(/\D/g, '').length >= 8
  const dialog = useDialog(onClose)

  return (
    <div className="sheet" onClick={onClose}>
      <div ref={dialog} className="panel ready-notice" role="dialog" aria-modal="true" aria-labelledby="ready-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="ready-title" tabIndex={-1}>¡Pedido listo!</h2>
        {hasPhone ? (
          <>
            <p>¿Le avisás a {order.customer_name} por WhatsApp? Podés cambiar el mensaje antes de mandarlo.</p>
            <label>Mensaje<textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} /></label>
            <div className="row">
              <button type="button" className="ghost" onClick={onClose}>Ahora no</button>
              <a className="button" href={waLink(order.phone, text)} target="_blank" rel="noreferrer" onClick={onClose}>Avisar por WhatsApp</a>
            </div>
          </>
        ) : (
          <>
            <p>Este pedido no tiene un teléfono para avisarle por WhatsApp.</p>
            <div className="row"><button type="button" onClick={onClose}>Entendido</button></div>
          </>
        )}
      </div>
    </div>
  )
}
