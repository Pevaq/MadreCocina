// Deletes product photos no product uses (uploaded in the editor and then cancelled, or left by deleted test data).
// Called weekly by .github/workflows/keep-alive.yml, which sends the CLEAN_TOKEN secret: nobody else can trigger it.
import { createClient } from 'npm:@supabase/supabase-js@2'

// A photo is an orphan until its product is saved: give an open editor a day before touching it.
const GRACE_MS = 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  const token = Deno.env.get('CLEAN_TOKEN')
  if (!token || req.headers.get('x-clean-token') !== token) return Response.json({ error: 'forbidden' }, { status: 403 })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const bucket = db.storage.from('products')

  const { data: products, error: e1 } = await db.from('products').select('images')
  // Without the product list every photo would look orphaned: never delete on a failed read.
  if (e1 || !products) return Response.json({ error: e1?.message ?? 'no products' }, { status: 500 })
  // One page of 1000 files is plenty: the catalog stays far below ~330 products.
  const { data: files, error: e2 } = await bucket.list('', { limit: 1000 })
  if (e2 || !files) return Response.json({ error: e2?.message ?? 'no files' }, { status: 500 })

  const used = new Set(products.flatMap((p) => p.images))
  const cutoff = Date.now() - GRACE_MS
  const orphans = files
    .filter((f) => f.id && !used.has(f.name) && Date.parse(f.created_at) < cutoff)
    .map((f) => f.name)
  if (orphans.length) {
    const { error } = await bucket.remove(orphans)
    if (error) return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ deleted: orphans })
})
