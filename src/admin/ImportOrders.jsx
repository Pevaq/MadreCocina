import { useEffect, useState } from 'react'
import { supabase, money } from '../lib.js'
import { unitPrice, todayIn } from '../../supabase/functions/_shared/order.js'
import { rowsFromPdf, rowsFromCsv, parseItems, parseDate, isDone, matchProduct, norm, planImport } from './importOrders.js'

// pdf.js from the CDN, pinned, only when a PDF is chosen (~1.5 MB the shop never needs). Legacy build: older Safari too.
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/'

async function readPdf(file) {
  const pdfjs = await import(/* @vite-ignore */ `${PDFJS}legacy/build/pdf.min.mjs`)
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}legacy/build/pdf.worker.min.mjs`
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: `${PDFJS}cmaps/`, standardFontDataUrl: `${PDFJS}standard_fonts/` }).promise
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent()
    pages.push(items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })))
  }
  return rowsFromPdf(pages)
}

const shortDate = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })

// Past orders from the owner's old table (PDF or CSV). They go straight to Finalizados as delivered, without
// touching the stock (it was sold long ago), at today's shop prices. Orders still in progress are left out:
// those are loaded with "+ Nuevo pedido", which does take the stock.
export default function ImportOrders({ sources, onClose }) {
  const [products, setProducts] = useState([])
  const [existing, setExisting] = useState([])
  const [file, setFile] = useState('')
  const [rows, setRows] = useState(null)
  const [mapping, setMapping] = useState({})  // normalized name in the file → product id
  const [picked, setPicked] = useState({})    // row index → ticked, when the admin changed the default
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const today = todayIn()

  useEffect(() => {
    supabase.from('products').select('id, name, price, active').order('sort').order('name').then(({ data }) => setProducts(data ?? []))
    supabase.from('orders').select('id, customer_name, delivery_date').then(({ data }) => setExisting(data ?? []))
  }, [])

  // Product names of the orders that can come in, each with its best guess from the catalog.
  const names = rows ? [...new Map(rows.filter((r) => isDone(r.status) && parseDate(r.date) <= today)
    .flatMap((r) => parseItems(r.items)).map((l) => [norm(l.name), l.name])).entries()] : []

  async function choose(e) {
    const f = e.target.files[0]
    e.target.value = ''
    if (!f) return
    setError(''); setRows(null); setPicked({}); setBusy(true)
    try {
      const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
      const found = pdf ? await readPdf(f) : rowsFromCsv(await f.text())
      if (!found.length) throw new Error('empty')
      setFile(f.name)
      setRows(found)
      const guess = {}
      for (const r of found) for (const l of parseItems(r.items)) guess[norm(l.name)] ??= matchProduct(l.name, products)?.id ?? ''
      setMapping(guess)
    } catch (err) {
      setError(err.message === 'empty'
        ? 'No encontré pedidos en ese archivo. Tiene que ser la tabla con las columnas Pedido, Nombre, Estado y Entrega.'
        : 'No se pudo leer el archivo. Si es un PDF, probá exportar la tabla como CSV.')
    }
    setBusy(false)
  }

  const byId = Object.fromEntries(products.map((p) => [p.id, p]))
  const plan = rows ? planImport(rows, {
    mapping: Object.fromEntries(Object.entries(mapping).map(([k, id]) => [k, byId[id]])),
    existing, today, price: (p) => unitPrice(p),
  }) : []
  const ticked = (e, i) => !!e.order && (picked[i] ?? !e.duplicate)
  const chosen = plan.filter(ticked).map((e) => e.order)

  async function save() {
    setBusy(true)
    // Oldest first, so order numbers follow the dates. One request: all of them or none.
    const { error } = await supabase.from('orders').insert(chosen.toSorted((a, b) => a.delivery_date.localeCompare(b.delivery_date)))
    setBusy(false)
    if (error) return setError(error.message)
    alert(`Listo: se importaron ${chosen.length} pedidos a Finalizados.`)
    onClose()
  }

  const skipped = plan.filter((e) => !e.order).length
  const dups = plan.filter((e) => e.duplicate).length

  return (
    <div className="editor solo">
      <div className="row"><h2>Importar pedidos</h2><button type="button" className="ghost" onClick={onClose}>Volver</button></div>

      <section className="box">
        <h3>Archivo</h3>
        <p className="muted">PDF o CSV de tu tabla de pedidos, con las columnas Pedido, Nombre, Contacto, Pago, Estado y Entrega. Entran solo los pedidos <strong>Listo</strong> o <strong>Entregado</strong> con fecha de hoy o anterior: van a Finalizados y no tocan el stock. Los que están en proceso cargalos con “+ Nuevo pedido”.</p>
        <div className="row">
          <label className="button file">{busy && !rows ? 'Leyendo…' : file ? 'Elegir otro' : 'Elegir archivo'}
            <input type="file" accept=".pdf,.csv,application/pdf,text/csv" onChange={choose} disabled={busy} />
          </label>
          {file && <span className="muted">{file}</span>}
        </div>
      </section>

      {rows && names.length > 0 && (
        <section className="box">
          <h3>Productos</h3>
          <p className="muted">Qué producto de la tienda es cada uno. Se usa el precio de hoy; si cobraste otro, cambialo después con “Precio mayorista” en el pedido.</p>
          {names.map(([key, name]) => (
            <label key={key}>{name}
              <select value={mapping[key] ?? ''} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value ? Number(e.target.value) : '' })}>
                <option value="">Elegí un producto</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)}{p.active ? '' : ' (oculto)'}</option>)}
              </select>
            </label>
          ))}
        </section>
      )}

      {rows && (
        <section className="box">
          <h3>Pedidos</h3>
          <p className="muted">
            {plan.length - skipped} para importar{dups > 0 && `, ${dups} parece${dups > 1 ? 'n' : ''} ya cargado${dups > 1 ? 's' : ''} (destildado${dups > 1 ? 's' : ''})`}
            {skipped > 0 && ` · ${skipped} no entra${skipped > 1 ? 'n' : ''}`}
          </p>
          <ul className="import-list">
            {plan.map((e, i) => (
              <li key={i} className={e.order ? '' : 'off'}>
                <label className="check">
                  <input type="checkbox" checked={ticked(e, i)} disabled={!e.order} onChange={(ev) => setPicked({ ...picked, [i]: ev.target.checked })} />
                  <span>
                    <span className="row"><strong>{e.row.name || '—'}</strong>{e.order && <strong>{money(e.order.total)}</strong>}</span>
                    <span className="muted">{parseDate(e.row.date) ? shortDate(parseDate(e.row.date)) : e.row.date} · {e.order ? sources[e.order.source] : e.row.contact} · {e.row.items}</span>
                    {e.reason && <span className="muted">No entra: {e.reason}</span>}
                    {e.duplicate && <span className="muted">Ya hay un pedido de {e.duplicate.customer_name} ese día (#{e.duplicate.id})</span>}
                    {e.order?.notes.includes('pendiente') && <span className="muted">Pago pendiente en la tabla</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {rows && (
        <div className="actions">
          <span className="muted">Total: <strong>{money(chosen.reduce((s, o) => s + o.total, 0))}</strong></span>
          <button type="button" onClick={save} disabled={busy || !chosen.length}>
            {busy ? 'Importando…' : `Importar ${chosen.length} pedido${chosen.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  )
}
