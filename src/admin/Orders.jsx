import { useEffect, useState } from 'react'
import { supabase, money, longDate } from '../lib.js'
import { todayIn, addDays } from '../../supabase/functions/_shared/order.js'
import TrashIcon from './TrashIcon.jsx'

const itemsText = (items) => items.map((l) => `${l.qty} x ${l.name}${l.variant ? ` (${l.variant})` : ''}`).join(', ')

// Order progression. Any step can be skipped; "Entregado" moves it to Finalizados.
const STATUSES = { pending: 'Recibido', paid: 'Pagado', preparing: 'En preparación', ready: 'Listo', delivered: 'Entregado' }

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
  const pending = status === 'pending'

  const load = () => {
    const q = supabase.from('orders').select()
    return (pending ? q.neq('status', 'delivered') : q.eq('status', 'delivered'))
      .order('delivery_date', { ascending: pending }).order('id')
      .then(({ data, error }) => { setOrders(data ?? []); setError(error?.message ?? '') })
  }

  useEffect(() => { load() }, [status])

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
    const rows = [['Pedido', 'Fecha entrega', 'Cliente', 'Productos', 'Total', 'Mayorista', 'Monto cobrado']]
      .concat(orders.map((o) => [o.id, o.delivery_date, o.customer_name, itemsText(o.items), o.total, o.wholesale ? 'Sí' : 'No', o.amount_received]))
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

  return (
    <section>
      {error && <p className="error">{error}</p>}
      {!pending && orders.length > 0 && (
        <div className="row"><span>Total cobrado: <strong>{money(received)}</strong></span><button onClick={exportCsv}>Exportar CSV</button></div>
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
    </section>
  )
}

function StatusSelect({ order, onUpdate }) {
  return (
    <select className={`status ${order.status}`} value={order.status} onChange={(e) => onUpdate(order, { status: e.target.value })} aria-label="Estado">
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
        <span className="muted">{order.wholesale && 'Mayorista · '}#{order.id}</span>
        <button type="button" className="icon delete" onClick={() => onRemove(order)} aria-label={`Borrar pedido #${order.id}`}><TrashIcon /></button>
      </div>
    </article>
  )
}

function OrderDetail({ order, onClose, onUpdate, onRemove }) {
  const [amount, setAmount] = useState(order.amount_received ?? order.total)
  const phone = order.phone.replace(/\D/g, '')
  const saveAmount = () => Number(amount) !== Number(order.amount_received) && onUpdate(order, { amount_received: Number(amount) })

  return (
    <div className="sheet" onClick={onClose}>
      <div className="panel order-detail" onClick={(e) => e.stopPropagation()}>
        <header className="row">
          <h2>Pedido #{order.id}</h2>
          <button type="button" className="ghost" onClick={onClose}>Cerrar</button>
        </header>

        <dl className="facts">
          <dt>Estado</dt><dd><StatusSelect order={order} onUpdate={onUpdate} /></dd>
          <dt>Entrega</dt><dd>{longDate(order.delivery_date)}</dd>
          <dt>Cliente</dt><dd>{order.customer_name}</dd>
          <dt>Teléfono</dt><dd><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">{order.phone}</a></dd>
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
