import { useEffect, useState } from 'react'
import { supabase } from '../lib.js'

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const load = () => supabase.from('categories').select().order('sort').then(({ data }) => setCategories(data ?? []))
  useEffect(() => { load() }, [])

  const run = async (query) => {
    const { error } = await query
    setError(error?.message ?? '')
    load()
  }

  return (
    <section>
      {error && <p className="error">{error}</p>}
      <form className="row" onSubmit={(e) => { e.preventDefault(); run(supabase.from('categories').insert({ name, sort: categories.length })); setName('') }}>
        <input required placeholder="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} />
        <button>Agregar</button>
      </form>
      {categories.map((c) => (
        <div key={c.id} className="row">
          <input defaultValue={c.name} aria-label="Nombre" onBlur={(e) => e.target.value !== c.name && run(supabase.from('categories').update({ name: e.target.value }).eq('id', c.id))} />
          <input type="number" defaultValue={c.sort} aria-label="Orden" className="short" onBlur={(e) => run(supabase.from('categories').update({ sort: Number(e.target.value) }).eq('id', c.id))} />
          <button className="danger" onClick={() => confirm(`¿Borrar "${c.name}"? Sus productos quedan sin categoría.`) && run(supabase.from('categories').delete().eq('id', c.id))}>Borrar</button>
        </div>
      ))}
      <p className="muted">El número define el orden en la tienda. Los cambios se guardan al salir del campo.</p>
    </section>
  )
}
