import { useEffect, useState } from 'react'
import { supabase } from '../lib.js'

export default function Settings() {
  const [s, setS] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { supabase.from('settings').select().single().then(({ data }) => setS(data)) }, [])
  if (!s) return null

  async function save(e) {
    e.preventDefault()
    const { error } = await supabase.from('settings').update({ ...s, whatsapp_number: s.whatsapp_number?.replace(/\D/g, '') }).eq('id', 1)
    setMsg(error ? error.message : 'Guardado ✓')
  }

  return (
    <form onSubmit={save}>
      <label>Nombre de la tienda<input required value={s.store_name} onChange={(e) => setS({ ...s, store_name: e.target.value })} /></label>
      <label>WhatsApp (con código de país, ej. 5491112345678)<input type="tel" value={s.whatsapp_number ?? ''} onChange={(e) => setS({ ...s, whatsapp_number: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={s.whatsapp_on} onChange={(e) => setS({ ...s, whatsapp_on: e.target.checked })} /> Mostrar botón de WhatsApp al cliente</label>
      <label className="check"><input type="checkbox" checked={s.email_on} onChange={(e) => setS({ ...s, email_on: e.target.checked })} /> Recibir email por cada pedido</label>
      {msg && <p className="muted">{msg}</p>}
      <button>Guardar</button>
    </form>
  )
}
