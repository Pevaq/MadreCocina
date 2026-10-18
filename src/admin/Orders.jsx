import { useEffect, useState } from 'react'
import { supabase, money } from '../lib.js'

const itemsText = (items) => items.map((l) => `${l.qty} x ${l.name}${l.variant ? ` (${l.variant})` : ''}`).join(', ')

// Pending and delivered orders are the same table; "Entregado" just flips the status.
export default function Orders({ status }) {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')

  const load = () =>
    supabase.from('orders').select().eq('status', status)
      .order('delivery_date', { ascending: status === 'pending' })
      .then(({ data, error }) => { setOrders(data ?? []); setError(error?.message ?? '') })

  useEffect(() => { load() }, [status])

  async function deliver(order, amount) {
    const { error } = await supabase.from('orders')
      .update({ status: 'delivered', amount_received: amount, delivered_at: new Date().toISOString() })
      .eq('id', order.id)
    if (error) return setError(error.message)
    load()
  }

  async function remove(order) {
    if (!confirm(`¿Borrar el pedido #${order.id}? No se puede deshacer.${order.status === 'pending' ? ' Su stock vuelve a la tienda.' : ''}`)) return
    const { error } = await supabase.from('orders').delete().eq('id', order.id)
    if (error) return setError(error.message)
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

  return (
    <section>
      {error && <p className="error">{error}</p>}
      {status === 'delivered' && orders.length > 0 && (
        <div className="row"><span>Total cobrado: <strong>{money(received)}</strong></span><button onClick={exportCsv}>Exportar CSV</button></div>
      )}
      {orders.length === 0 && <p className="muted">No hay pedidos.</p>}
      {orders.map((o) => status === 'pending'
        ? <PendingOrder key={o.id} order={o} onDeliver={deliver} onRemove={remove} />
        : (
          <article key={o.id} className="card">
            <div className="row"><strong>#{o.id} · {o.delivery_date}</strong><span>{money(o.amount_received ?? 0)}</span></div>
            <p>{itemsText(o.items)}</p>
            <p className="muted">{o.customer_name}</p>
          </article>
        ))}
    </section>
  )
}

function PendingOrder({ order, onDeliver, onRemove }) {
  const [amount, setAmount] = useState(order.total)
  return (
    <article className="card">
      <div className="row"><strong>#{order.id} · Entrega {order.delivery_date}</strong><span>{money(order.total)}</span></div>
      <p>{itemsText(order.items)}</p>
      <p className="muted">
        {order.customer_name} · <a href={`https://wa.me/${order.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{order.phone}</a>
      </p>
      {order.notes && <p className="muted">{order.notes}</p>}
      <div className="row">
        <label>Recibido<input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <button onClick={() => onDeliver(order, Number(amount))}>✓ Entregado</button>
        <button className="danger" onClick={() => onRemove(order)}>Borrar</button>
      </div>
    </article>
  )
}
