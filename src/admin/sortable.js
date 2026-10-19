import { useState } from 'react'
import { supabase } from '../lib.js'

// Drag-and-drop reordering with pointer events: works with mouse and touch, no library.
// Rows carry data-sort-id; the drag handle gets handle(id, name) (or grip(id, name) on any element).
// Keyboard: arrow keys on the handle move the row one place (WCAG: dragging can't be the only way).
// On drop, saves `sort` = position in `table`; without a table the new order only stays in state.
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
    const end = () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', end)
      removeEventListener('pointercancel', end)
      setDragging(null)
      save(list)
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', end)
    addEventListener('pointercancel', end)
  }

  async function save(list) {
    if (!table) return
    const results = await Promise.all(list.map((x, i) => x.sort !== i && supabase.from(table).update({ sort: i }).eq('id', x.id)))
    setError(results.find((r) => r?.error)?.error.message ?? '')
    setItems(list.map((x, i) => ({ ...x, sort: i })))
  }

  function key(e, id) {
    const d = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key]
    const from = items.findIndex((x) => x.id === id)
    if (!d || from + d < 0 || from + d >= items.length) return
    e.preventDefault()
    const list = items.toSpliced(from, 1).toSpliced(from + d, 0, items[from])
    setItems(list)
    save(list)
  }

  const handle = (id, name) => ({
    type: 'button',
    className: 'icon handle',
    'aria-label': `Mover ${name} (arrastrar o flechas arriba y abajo)`,
    onPointerDown: (e) => start(e, id),
    onKeyDown: (e) => key(e, id),
    onClick: (e) => e.stopPropagation(),
    children: '⠿',
  })

  // For a whole element (a photo): focusable so the arrow keys work too.
  const grip = (id, name) => ({ onPointerDown: (e) => start(e, id), onKeyDown: (e) => key(e, id), draggable: false, tabIndex: 0, 'aria-label': `Mover ${name} (arrastrar o flechas)` })

  return { dragging, handle, grip }
}
