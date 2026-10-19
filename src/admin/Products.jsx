import { useEffect, useState } from 'react'
import { supabase, imageUrl, money } from '../lib.js'
import { useSortable } from './sortable.js'
import TrashIcon from './TrashIcon.jsx'
import { ProductCard } from '../Shop.jsx'

// Asks first; returns an error message, '' if it was deleted, or null if she cancelled.
async function deleteProduct(product, images = product.images) {
  if (!confirm(`¿Borrar "${product.name}"? Los pedidos viejos no se afectan.`)) return null
  const { error } = await supabase.from('products').delete().eq('id', product.id)
  if (error) return error.message
  if (images.length) await supabase.storage.from('products').remove(images)
  return ''
}

const EMPTY = { name: '', description: '', price: '', lead_days: 1, stock: 0, category_id: null, images: [], active: true, variants: [] }

export default function Products() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const { dragging, handle } = useSortable(products, setProducts, 'products', setError)

  const load = () => supabase.from('products').select('*, variants(*)').order('sort').order('name').order('id', { referencedTable: 'variants' }).then(({ data }) => setProducts(data ?? []))
  useEffect(() => {
    load()
    supabase.from('categories').select().order('sort').then(({ data }) => setCategories(data ?? []))
  }, [])

  if (editing) return <Editor product={editing} categories={categories} onClose={() => { setEditing(null); load() }} />

  return (
    <section>
      {error && <p className="error" role="alert">{error}</p>}
      <button onClick={() => setEditing({ ...EMPTY, sort: products.length })}>+ Nuevo producto</button>
      {products.map((p) => (
        <article key={p.id} className={`card row product${dragging === p.id ? ' dragging' : ''}`} data-sort-id={p.id} onClick={() => setEditing(p)}>
          <button {...handle(p.id, p.name)} />
          {p.images[0] && <img className="thumb" src={imageUrl(p.images[0])} alt="" />}
          <div className="info">
            <span>{p.name}</span>
            <small>
              {money(p.price)} · <span className={p.stock > 0 ? 'muted' : 'error'}>{p.stock > 0 ? `Stock ${p.stock}` : 'Agotado'}</span>
              {!p.active && <em className="muted"> · oculto</em>}
            </small>
          </div>
          <button
            type="button" className="icon delete" aria-label={`Borrar ${p.name}`}
            onClick={async (e) => {
              e.stopPropagation()
              const error = await deleteProduct(p)
              if (error !== null) { setError(error); load() }
            }}
          ><TrashIcon /></button>
        </article>
      ))}
      {products.length > 1 && <p className="muted">Arrastrá ⠿ para cambiar el orden en la tienda.</p>}
    </section>
  )
}

// Resize in the browser so each photo is ~200 KB and the free 1 GB storage lasts.
async function compress(file) {
  const bmp = await createImageBitmap(file).catch(async () => {
    // Chrome/Firefox can't read HEIC (iPhone/Mac photos): convert it, loading the ~3 MB converter only then.
    const { heicTo, isHeic } = await import('heic-to')
    if (!(await isHeic(file))) throw new Error('unreadable image')
    return heicTo({ blob: file, type: 'bitmap' })
  })
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
  // The shop card with what's typed so far: numbers parsed, variants given temporary ids.
  const preview = {
    ...p, name: p.name || 'Nombre del producto', price: Number(p.price) || 0, lead_days: Number(p.lead_days) || 0, stock: Number(p.stock) || 0,
    variants: p.variants.map((v, i) => ({ ...v, id: v.id ?? -1 - i, name: v.name || 'Variante', price: v.price === '' || v.price == null ? null : Number(v.price) })),
  }
  // Photos reorder by dragging; the first one is the cover in the shop.
  const photos = useSortable(p.images.map((id) => ({ id })), (list) => setP((cur) => ({ ...cur, images: list.map((x) => x.id) })))

  async function addImages(files) {
    setBusy(true)
    setError('')
    const paths = []
    for (const file of [...files].slice(0, 3 - p.images.length)) {
      const blob = await compress(file).catch(() => null)
      if (!blob) { setError(`No se pudo leer "${file.name}". Probá con una foto JPG o PNG.`); continue }
      // Images uploaded and then cancelled stay in storage until the weekly clean-images run removes them.
      const path = `${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from('products').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) setError(error.message)
      else paths.push(path)
    }
    setP((cur) => ({ ...cur, images: [...cur.images, ...paths] }))
    setBusy(false)
  }

  async function save(e) {
    e.preventDefault()
    if (!p.images.length) return setError('Agregá al menos una foto.')
    setBusy(true)
    const { variants, id, ...fields } = p
    const row = { ...fields, price: Number(fields.price), lead_days: Number(fields.lead_days), stock: Number(fields.stock), category_id: fields.category_id || null }
    // An edit sends the change, not the value: orders that came in while editing keep their units (add_stock).
    const delta = id ? row.stock - product.stock : 0
    if (id) delete row.stock
    const { data, error } = id
      ? await supabase.from('products').update(row).eq('id', id).select().single()
      : await supabase.from('products').insert(row).select().single()
    if (error) { setBusy(false); return setError(error.message) }
    if (delta) {
      const { error } = await supabase.rpc('add_stock', { product_id: id, delta })
      if (error) { setBusy(false); return setError(error.message) }
    }

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
    // Saved photos plus any uploaded in this edit, so none are left behind in storage.
    const error = await deleteProduct(product, [...new Set([...product.images, ...p.images])])
    if (error) setError(error)
    else if (error === '') onClose()
  }

  return (
    <form className="editor" onSubmit={save}>
      <div className="row"><h2>{p.id ? 'Editar' : 'Nuevo'} producto</h2><button type="button" className="ghost" onClick={onClose}>Volver</button></div>

      <section className="box">
        <label>Nombre<input required value={p.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label>Descripción<textarea value={p.description ?? ''} onChange={(e) => set('description', e.target.value)} /></label>
        <label>Categoría
          <select value={p.category_id ?? ''} onChange={(e) => set('category_id', Number(e.target.value) || null)}>
            <option value="">Sin categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={p.active} onChange={(e) => set('active', e.target.checked)} /> Visible en la tienda</label>
      </section>

      <section className="box">
        <h3>Precio y stock</h3>
        <div className="fields">
          <label>Precio<input required type="number" min="0" step="any" value={p.price} onChange={(e) => set('price', e.target.value)} /></label>
          <label>Stock<input required type="number" min="0" step="1" value={p.stock} onChange={(e) => set('stock', e.target.value)} /></label>
          <label>Días de anticipación<input required type="number" min="0" value={p.lead_days} onChange={(e) => set('lead_days', e.target.value)} /></label>
        </div>
        <p className="muted">Stock: los pedidos lo descuentan solos y vuelve si borrás un pedido sin entregar; en 0 figura Agotado.</p>
        <p className="muted">Anticipación: sin contar hoy. Con 2, si hoy es domingo se puede pedir desde el miércoles; con 0, para hoy.</p>
      </section>

      <section className="box">
        <h3>Fotos ({p.images.length}/3)</h3>
        <p className="muted">Al menos una. La primera es la portada en la tienda; arrastrá las fotos (o usá las flechas) para cambiar el orden.</p>
        <div className="photos">
          {p.images.map((path, i) => (
            <div key={path} className={`photo${photos.dragging === path ? ' dragging' : ''}`} data-sort-id={path}>
              <img src={imageUrl(path)} alt="" {...photos.grip(path, `foto ${i + 1}`)} />
              {i === 0 && <span className="badge">Portada</span>}
              <button type="button" onClick={() => set('images', p.images.filter((x) => x !== path))} aria-label={`Quitar foto ${i + 1}`}>✕</button>
            </div>
          ))}
          {p.images.length < 3 && (
            <label className={`add-photo${busy ? ' busy' : ''}`}>
              <input type="file" accept="image/*,.heic,.heif" multiple disabled={busy} onChange={(e) => addImages(e.target.files)} />
              {busy ? 'Subiendo…' : '+ Foto'}
            </label>
          )}
        </div>
      </section>

      <section className="box">
        <h3>Variantes</h3>
        <p className="muted">Ej.: aceitunas, tomates. Dejá el precio vacío para usar el del producto.</p>
        {p.variants.map((v, i) => (
          <div key={v.id ?? `new-${i}`} className="variant">
            <input placeholder="Nombre" value={v.name} onChange={(e) => setVariant(i, 'name', e.target.value)} aria-label="Nombre de variante" />
            <input type="number" min="0" step="any" placeholder="Precio" value={v.price ?? ''} onChange={(e) => setVariant(i, 'price', e.target.value)} aria-label="Precio de variante" />
            <label className="check"><input type="checkbox" checked={v.active} onChange={(e) => setVariant(i, 'active', e.target.checked)} /> Visible</label>
            <button type="button" className="icon" onClick={() => set('variants', p.variants.filter((_, j) => j !== i))} aria-label="Quitar variante">✕</button>
          </div>
        ))}
        <button type="button" className="ghost" onClick={() => set('variants', [...p.variants, { name: '', price: '', active: true }])}>+ Variante</button>
      </section>

      <section className="box preview">
        <h3>Vista previa</h3>
        <p className="muted">Así se ve en la tienda.</p>
        {/* Remounted when photos change so the card's photo index never points past the end. */}
        <div className="grid" inert><ProductCard key={p.images.join()} product={preview} onAdd={() => {}} inCart={0} /></div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        {p.id && <button type="button" className="ghost danger" onClick={remove}>Borrar producto</button>}
      </div>
    </form>
  )
}
