import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

export const imageUrl = (path) => supabase.storage.from('products').getPublicUrl(path).data.publicUrl

// Always ARS: the store only sells in pesos.
const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
export const money = (n) => fmt.format(n)

// "sábado, 25 de octubre"; noon so no timezone moves it to the day before.
export const longDate = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

// Fades out the loading screen from index.html once there is something to show.
export function hideSplash() {
  const el = document.getElementById('splash')
  if (!el) return
  el.classList.add('out')
  setTimeout(() => el.remove(), 400)
}
