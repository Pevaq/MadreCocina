import { useEffect, useState } from 'react'
import { supabase } from '../lib.js'

export default function Settings() {
  const [s, setS] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { supabase.from('settings').select().single().then(({ data }) => setS(data)) }, [])
  if (!s) return null

  async function save(e) {
    e.preventDefault()
    const { error } = await supabase.from('settings').update({ ...s, whatsapp_number: s.whatsapp_number?.replace(/\D/g, ''), transfer_alias: s.transfer_alias?.trim() || null, transfer_holder: s.transfer_holder?.trim() || null }).eq('id', 1)
    setMsg(error ? error.message : 'Guardado ✓')
  }

  return (
    <form className="settings" onSubmit={save}>
      <section className="box">
        <h3>Tienda</h3>
        <label>Nombre de la tienda<input required value={s.store_name} onChange={(e) => setS({ ...s, store_name: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={s.email_on} onChange={(e) => setS({ ...s, email_on: e.target.checked })} /> Recibir email por cada pedido</label>
      </section>
      <section className="box">
        <h3>WhatsApp</h3>
        <label>Número (54 + 9 + código de área sin 0 + número sin 15, ej. 5492477123456)<input type="tel" value={s.whatsapp_number ?? ''} onChange={(e) => setS({ ...s, whatsapp_number: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={s.whatsapp_on} onChange={(e) => setS({ ...s, whatsapp_on: e.target.checked })} /> Mostrar WhatsApp al cliente (botón flotante y al confirmar el pedido)</label>
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
