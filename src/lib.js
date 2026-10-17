import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

export const imageUrl = (path) => supabase.storage.from('products').getPublicUrl(path).data.publicUrl

// shortcut: currency fixed to ARS, move to settings if she ever sells in another currency.
const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
export const money = (n) => fmt.format(n)
