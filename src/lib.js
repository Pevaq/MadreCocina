import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

// Cloudflare Turnstile (anti-bot). Without a site key the checkout skips it, like place-order without its secret.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
let turnstile
export const loadTurnstile = () => turnstile ??= new Promise((resolve, reject) => {
  const s = Object.assign(document.createElement('script'), { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: true })
  s.onload = () => resolve(window.turnstile)
  s.onerror = () => { turnstile = null; reject(new Error('turnstile')) }
  document.head.append(s)
})

export const imageUrl =(path) => supabase.storage.from('products').getPublicUrl(path).data.publicUrl

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

// Closes a sheet/modal with the Escape key (desktop).
export function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])
}

// Modal behavior for a sheet/dialog: Escape closes, focus goes to its h2 (tabIndex -1), everything else
// on the page is inert (no Tab or screen reader behind it) and focus returns where it was on close.
// Off (`on` false) for the desktop sidebar, which isn't modal.
export function useDialog(onClose, on = true) {
  const ref = useRef(null)
  useEscape(on ? onClose : noop)
  useEffect(() => {
    if (!on) return
    const back = document.activeElement
    const off = []
    for (let el = ref.current; el && el !== document.body; el = el.parentElement)
      for (const s of el.parentElement.children) if (s !== el && !s.inert) { s.inert = true; off.push(s) }
    ref.current.querySelector('h2')?.focus()
    return () => {
      off.forEach((s) => { s.inert = false })
      if (back?.isConnected) back.focus()
    }
  }, [on])
  return ref
}
const noop = () => {}

// True while the media query matches; follows window resizes.
export function useMedia(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}
