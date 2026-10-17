import { useEffect, useState } from 'react'
import { supabase, imageUrl, money } from '../lib.js'

const EMPTY = { name: '', description: '', price: '', lead_days: 1, category_id: null, images: [], active: true, variants: [] }

export default function Products() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [editing, setEditing] = useState(null)

  const load = () => supabase.from('products').select('*, variants(*)').order('name').then(({ data }) => setProducts(data ?? []))
  useEffect(() => {
    load()
    supabase.from('categories').select().order('sort').then(({ data }) => setCategories(data ?? []))
  }, [])

  if (editing) return <Editor product={editing} categories={categories} onClose={() => { setEditing(null); load() }} />

  return (
    <section>
      <button onClick={() => setEditing(EMPTY)}>+ Nuevo producto</button>
      {products.map((p) => (
        <article key={p.id} className="card row" onClick={() => setEditing(p)}>
          {p.images[0] && <img className="thumb" src={imageUrl(p.images[0])} alt="" />}
          <span>{p.name}{!p.active && <em className="muted"> (oculto)</em>}</span>
          <span>{money(p.price)}</span>
        </article>
      ))}
    </section>
  )
}

// Resize in the browser so each photo is ~200 KB and the free 1 GB storage lasts.
async function compress(file) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height))
  const canvas = Object.assign(document.createElement('canvas'), { width: bmp.width * scale, height: bmp.height * scale })
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
}

function Editor({ product, categories, onClose }) {
  const [p, setP] = useState({ ...product, variants: product.variants.map((v) => ({ ...v })) })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setP({ ...p, [k]: v })
  const setVariant = (i, k, v) => set('variants', p.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  async function addImages(files) {
    setBusy(true)
    const paths = []
    for (const file of [...files].slice(0, 3 - p.images.length)) {
      // shortcut: images uploaded and then cancelled stay in storage, clean up by hand if space ever matters.
      const path = `${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from('products').upload(path, await compress(file), { contentType: 'image/jpeg' })
      if (error) setError(error.message)
      else paths.push(path)
    }
    setP((cur) => ({ ...cur, images: [...cur.images, ...paths] }))
    setBusy(false)
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const { variants, id, ...fields } = p
    const row = { ...fields, price: Number(fields.price), lead_days: Number(fields.lead_days), category_id: fields.category_id || null }
    const { data, error } = id
      ? await supabase.from('products').update(row).eq('id', id).select().single()
      : await supabase.from('products').insert(row).select().single()
    if (error) { setBusy(false); return setError(error.message) }

    const keep = variants.filter((v) => v.name.trim())
    const removed = product.variants.filter((old) => !keep.some((v) => v.id === old.id)).map((v) => v.id)
    const toRow = (v) => ({ product_id: data.id, name: v.name.trim(), price: v.price === '' || v.price == null ? null : Number(v.price), active: v.active })
    const results = await Promise.all([
      removed.length && supabase.from('variants').delete().in('id', removed),
      ...keep.filter((v) => v.id).map((v) => supabase.from('variants').update(toRow(v)).eq('id', v.id)),
      keep.some((v) => !v.id) && supabase.from('variants').insert(keep.filter((v) => !v.id).map(toRow)),
    ])
    const droppedImages = product.images.filter((path) => !p.images.includes(path))
    if (droppedImages.length) await supabase.storage.from('products').remove(droppedImages)

    setBusy(false)
    const failed = results.find((r) => r?.error)
    if (failed) return setError(failed.error.message)
    onClose()
  }

  async function remove() {
    if (!confirm(`¿Borrar "${p.name}"? Los pedidos viejos no se afectan.`)) return
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) return setError(error.message)
    if (p.images.length) await supabase.storage.from('products').remove(p.images)
    onClose()
  }

  return (
    <form onSubmit={save}>
      <div className="row"><h2>{p.id ? 'Editar' : 'Nuevo'} producto</h2><button type="button" onClick={onClose}>Volver</button></div>
      <label>Nombre<input required value={p.name} onChange={(e) => set('name', e.target.value)} /></label>
      <label>Descripción<textarea value={p.description ?? ''} onChange={(e) => set('description', e.target.value)} /></label>
      <label>Categoría
        <select value={p.category_id ?? ''} onChange={(e) => set('category_id', Number(e.target.value) || null)}>
          <option value="">Sin categoría</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="row">
        <label>Precio<input required type="number" min="0" step="any" value={p.price} onChange={(e) => set('price', e.target.value)} /></label>
        <label>Días de anticipación<input required type="number" min="0" value={p.lead_days} onChange={(e) => set('lead_days', e.target.value)} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={p.active} onChange={(e) => set('active', e.target.checked)} /> Visible en la tienda</label>

      <h3>Fotos ({p.images.length}/3)</h3>
      <div className="row">
        {p.images.map((path) => (
          <div key={path} className="photo">
            <img className="thumb" src={imageUrl(path)} alt="" />
            <button type="button" onClick={() => set('images', p.images.filter((x) => x !== path))} aria-label="Quitar foto">✕</button>
          </div>
        ))}
        {p.images.length < 3 && <input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => addImages(e.target.files)} aria-label="Agregar fotos" />}
      </div>

      <h3>Variantes</h3>
      <p className="muted">Ej.: aceitunas, tomates. Dejá el precio vacío para usar el del producto.</p>
      {p.variants.map((v, i) => (
        <div key={v.id ?? `new-${i}`} className="row">
          <input placeholder="Nombre" value={v.name} onChange={(e) => setVariant(i, 'name', e.target.value)} aria-label="Nombre de variante" />
          <input className="short" type="number" min="0" step="any" placeholder="Precio" value={v.price ?? ''} onChange={(e) => setVariant(i, 'price', e.target.value)} aria-label="Precio de variante" />
          <label className="check"><input type="checkbox" checked={v.active} onChange={(e) => setVariant(i, 'active', e.target.checked)} /> Visible</label>
          <button type="button" onClick={() => set('variants', p.variants.filter((_, j) => j !== i))} aria-label="Quitar variante">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => set('variants', [...p.variants, { name: '', price: '', active: true }])}>+ Variante</button>

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        {p.id && <button type="button" className="danger" onClick={remove}>Borrar producto</button>}
      </div>
    </form>
  )
}
