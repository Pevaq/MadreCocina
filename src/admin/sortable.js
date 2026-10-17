import { useState } from 'react'
import { supabase } from '../lib.js'

// Drag-and-drop reordering with pointer events: works with mouse and touch, no library.
// Rows carry data-sort-id; the drag handle gets handle(id). On drop, saves `sort` = position.
export function useSortable(items, setItems, table, setError) {
  const [dragging, setDragging] = useState(null)

  function start(e, id) {
    e.preventDefault()
    let list = items
    setDragging(id)
    const move = (ev) => {
      const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-sort-id]')
      if (!row) return
      const from = list.findIndex((x) => x.id === id)
      const to = list.findIndex((x) => String(x.id) === row.dataset.sortId)
      if (to < 0 || to === from) return
      list = list.toSpliced(from, 1).toSpliced(to, 0, list[from])
      setItems(list)
    }
    const end = async () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', end)
      removeEventListener('pointercancel', end)
      setDragging(null)
      const results = await Promise.all(list.map((x, i) => x.sort !== i && supabase.from(table).update({ sort: i }).eq('id', x.id)))
      setError(results.find((r) => r?.error)?.error.message ?? '')
      setItems(list.map((x, i) => ({ ...x, sort: i })))
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', end)
    addEventListener('pointercancel', end)
  }

  const handle = (id) => ({
    type: 'button',
    className: 'icon handle',
    'aria-label': 'Arrastrar para ordenar',
    onPointerDown: (e) => start(e, id),
    onClick: (e) => e.stopPropagation(),
    children: '⠿',
  })

  return { dragging, handle }
}
