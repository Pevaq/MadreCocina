import { useEffect, useState } from 'react'
import { supabase } from '../lib.js'
import { DEFAULT_READY_MESSAGE } from './whatsapp.js'

export default function Settings() {
  const [s, setS] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { supabase.from('settings').select().single().then(({ data }) => setS(data)) }, [])
  if (!s) return null
  // Empty in the DB = the suggested text, so improvements to it reach her too.
  const msgText = s.ready_message ?? DEFAULT_READY_MESSAGE

  async function save(e) {
    e.preventDefault()
    const { error } = await supabase.from('settings').update({ ...s, whatsapp_number: s.whatsapp_number?.replace(/\D/g, ''), transfer_alias: s.transfer_alias?.trim() || null, transfer_holder: s.transfer_holder?.trim() || null, ready_message: msgText.trim() && msgText.trim() !== DEFAULT_READY_MESSAGE ? msgText.trim() : null }).eq('id', 1)
    setMsg(error ? error.message : 'Guardado ✓')
  }

  return (
    <form className="settings" onSubmit={save}>
      <section className="box">
        <h3>Tienda</h3>
        <label>Nombre de la tienda<input required value={s.store_name} onChange={(e) => setS({ ...s, store_name: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={s.email_on} onChange={(e) => setS({ ...s, email_on: e.target.checked })} /> Recibir email por cada pedido</label>
        <label className="check"><input type="checkbox" checked={s.show_categories} onChange={(e) => setS({ ...s, show_categories: e.target.checked })} /> Mostrar categorías en la tienda (los botones Todo, Tortas, etc.)</label>
      </section>
      <section className="box">
        <h3>WhatsApp</h3>
        <label>Número (54 + 9 + código de área sin 0 + número sin 15, ej. 5492477123456)<input type="tel" value={s.whatsapp_number ?? ''} onChange={(e) => setS({ ...s, whatsapp_number: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={s.whatsapp_on} onChange={(e) => setS({ ...s, whatsapp_on: e.target.checked })} /> Mostrar WhatsApp al cliente (botón flotante y al confirmar el pedido)</label>
        <label>Mensaje de pedido listo
          <textarea rows={7} value={msgText} onChange={(e) => setS({ ...s, ready_message: e.target.value })} />
        </label>
        <p className="muted">Se ofrece mandarlo cuando pasás un pedido a Listo. Se reemplazan solos: <code>{'{nombre}'}</code> (el nombre del cliente), <code>{'{tienda}'}</code> y <code>{'{productos}'}</code> (la lista del pedido).</p>
        {s.ready_message != null && s.ready_message !== DEFAULT_READY_MESSAGE && (
          <button type="button" className="ghost" onClick={() => setS({ ...s, ready_message: null })}>Volver al mensaje sugerido</button>
        )}
      </section>
      <section className="box">
        <h3>Pago por transferencia</h3>
        <p className="muted">Se le muestra al cliente después de hacer el pedido. Si lo dejás vacío, solo le decimos que lo vamos a contactar.</p>
        <label>Alias<input value={s.transfer_alias ?? ''} onChange={(e) => setS({ ...s, transfer_alias: e.target.value })} /></label>
        <label>Titular de la cuenta (y banco)<input placeholder="Ej.: Juana Pérez · Banco Nación" value={s.transfer_holder ?? ''} onChange={(e) => setS({ ...s, transfer_holder: e.target.value })} /></label>
      </section>
      <div className="row">
        <button>Guardar</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </form>
  )
}
