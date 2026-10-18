import { useEffect, useState } from 'react'
import { supabase, money, longDate } from '../lib.js'
import { todayIn, addDays } from '../../supabase/functions/_shared/order.js'

const itemsText = (items) => items.map((l) => `${l.qty} x ${l.name}${l.variant ? ` (${l.variant})` : ''}`).join(', ')

// Order progression. Any step can be skipped (cookies don't ferment); "Entregado" moves it to Historial.
const STATUSES = { pending: 'Recibido', paid: 'Pagado', fermenting: 'Fermentando', preparing: 'En preparación', ready: 'Listo', delivered: 'Entregado' }

const dayTitle = (iso, today) =>
  iso < today ? `Atrasado · ${longDate(iso)}`
    : iso === today ? `Hoy · ${longDate(iso)}`
    : iso === addDays(today, 1) ? `Mañana · ${longDate(iso)}`
    : longDate(iso)

// Pending and delivered orders are the same table; Pendientes shows every status but delivered.
export default function Orders({ status }) {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const pending = status === 'pending'

  const load = () => {
    const q = supabase.from('orders').select()
    return (pending ? q.neq('status', 'delivered') : q.eq('status', 'delivered'))
      .order('delivery_date', { ascending: pending }).order('id')
      .then(({ data, error }) => { setOrders(data ?? []); setError(error?.message ?? '') })
  }

  useEffect(() => { load() }, [status])

  // Delivering records what was charged: the order total unless the detail view says otherwise.
  async function setStatus(order, next, amount = order.total) {
    const change = next === 'delivered'
      ? { status: next, amount_received: amount, delivered_at: new Date().toISOString() }
      : { status: next }
    setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, ...change } : o)))
    const { error } = await supabase.from('orders').update(change).eq('id', order.id)
    if (error) setError(error.message)
    load()
  }

  async function remove(order) {
    if (!confirm(`¿Borrar el pedido #${order.id}? No se puede deshacer.${order.status !== 'delivered' ? ' Su stock vuelve a la tienda.' : ''}`)) return
    const { error } = await supabase.from('orders').delete().eq('id', order.id)
    if (error) return setError(error.message)
    setOpenId(null)
    load()
  }

  function exportCsv() {
    const cell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
    const rows = [['Pedido', 'Fecha entrega', 'Cliente', 'Productos', 'Total', 'Monto recibido']]
      .concat(orders.map((o) => [o.id, o.delivery_date, o.customer_name, itemsText(o.items), o.total, o.amount_received]))
    // BOM so Excel/Sheets read accents correctly.
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'historial.csv' })
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const received = orders.reduce((s, o) => s + Number(o.amount_received ?? 0), 0)
  const open = orders.find((o) => o.id === openId)
  const today = todayIn()
  const days = pending ? [...new Set(orders.map((o) => o.delivery_date))] : []

  return (
    <section>
      {error && <p className="error">{error}</p>}
      {!pending && orders.length > 0 && (
        <div className="row"><span>Total cobrado: <strong>{money(received)}</strong></span><button onClick={exportCsv}>Exportar CSV</button></div>
      )}
      {orders.length === 0 && <p className="muted">No hay pedidos.</p>}
      {days.map((day) => (
        <div key={day} className="day">
          <h3 className={day < today ? 'late' : ''}>{dayTitle(day, today)}</h3>
          {orders.filter((o) => o.delivery_date === day).map((o) => (
            <OrderRow key={o.id} order={o} onOpen={() => setOpenId(o.id)} onStatus={setStatus} />
          ))}
        </div>
      ))}
      {!pending && orders.map((o) => (
        <article key={o.id} className="card">
          <div className="row"><strong>#{o.id} · {o.delivery_date}</strong><span>{money(o.amount_received ?? 0)}</span></div>
          <p>{itemsText(o.items)}</p>
          <p className="muted">{o.customer_name}</p>
        </article>
      ))}
      {open && <OrderDetail order={open} onClose={() => setOpenId(null)} onStatus={setStatus} onRemove={remove} />}
    </section>
  )
}

function StatusSelect({ order, onStatus }) {
  return (
    <select className={`status ${order.status}`} value={order.status} onChange={(e) => onStatus(order, e.target.value)} aria-label="Estado">
      {Object.entries(STATUSES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
    </select>
  )
}

function OrderRow({ order, onOpen, onStatus }) {
  return (
    <article className="card order" onClick={onOpen}>
      <div className="row">
        <strong>{order.customer_name}</strong>
        <strong>{money(order.total)}</strong>
      </div>
      <p className="items">{itemsText(order.items)}</p>
      {/* Changing the status must not also open the detail. */}
      <div className="row" onClick={(e) => e.stopPropagation()}>
        <StatusSelect order={order} onStatus={onStatus} />
        <span className="muted">#{order.id}</span>
      </div>
    </article>
  )
}

function OrderDetail({ order, onClose, onStatus, onRemove }) {
  const [amount, setAmount] = useState(order.total)
  const phone = order.phone.replace(/\D/g, '')

  return (
    <div className="sheet" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h2>Pedido #{order.id}</h2><button type="button" className="ghost" onClick={onClose}>Cerrar</button></div>

        <nav className="steps">
          {Object.entries(STATUSES).filter(([k]) => k !== 'delivered').map(([k, label]) => (
            <button key={k} type="button" className={order.status === k ? 'on' : ''} onClick={() => onStatus(order, k)}>{label}</button>
          ))}
        </nav>

        <p><strong>Entrega:</strong> {longDate(order.delivery_date)}</p>
        <p><strong>Cliente:</strong> {order.customer_name} · <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">{order.phone}</a></p>
        {order.notes && <p><strong>Notas:</strong> {order.notes}</p>}
        <p className="muted">Hecho el {new Date(order.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</p>

        {order.items.map((l, i) => (
          <div key={i} className="row line">
            <span>{l.qty} × {l.name}{l.variant ? ` (${l.variant})` : ''}</span>
            <span>{money(l.price * l.qty)}</span>
          </div>
        ))}
        <p className="row total"><strong>Total</strong><strong>{money(order.total)}</strong></p>

        <div className="row">
          <label>Cobrado<input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <button type="button" onClick={() => onStatus(order, 'delivered', Number(amount))}>✓ Entregado</button>
        </div>
        <button type="button" className="danger" onClick={() => onRemove(order)}>Borrar pedido</button>
      </div>
    </div>
  )
}
