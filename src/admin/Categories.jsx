import { useEffect, useState } from 'react'
import { supabase } from '../lib.js'
import { useSortable } from './sortable.js'

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const { dragging, handle } = useSortable(categories, setCategories, 'categories', setError)

  const load = () => supabase.from('categories').select().order('sort').then(({ data }) => setCategories(data ?? []))
  useEffect(() => { load() }, [])

  const run = async (query) => {
    const { error } = await query
    setError(error?.message ?? '')
    load()
  }

  return (
    <section>
      {error && <p className="error" role="alert">{error}</p>}
      <form className="row" onSubmit={(e) => { e.preventDefault(); run(supabase.from('categories').insert({ name, sort: categories.length })); setName('') }}>
        <input required placeholder="Nueva categoría" aria-label="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} />
        <button>Agregar</button>
      </form>
      {categories.map((c) => (
        <div key={c.id} className={`row${dragging === c.id ? ' dragging' : ''}`} data-sort-id={c.id}>
          <button {...handle(c.id, c.name)} />
          <input defaultValue={c.name} aria-label={`Nombre de ${c.name}`} onBlur={(e) => e.target.value !== c.name && run(supabase.from('categories').update({ name: e.target.value }).eq('id', c.id))} />
          <button className="danger" aria-label={`Borrar ${c.name}`} onClick={() => confirm(`¿Borrar "${c.name}"? Sus productos quedan sin categoría.`) && run(supabase.from('categories').delete().eq('id', c.id))}>Borrar</button>
        </div>
      ))}
      <p className="muted">Arrastrá ⠿ (o enfocalo y usá las flechas) para cambiar el orden en la tienda. Los nombres se guardan al salir del campo.</p>
    </section>
  )
}
