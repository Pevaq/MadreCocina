// "Pedido listo" message to the customer by WhatsApp (wa.me link: she sends it from her own WhatsApp).

// Used while settings.ready_message is empty. Says the order is ready and nothing about delivery: she arranges that.
export const DEFAULT_READY_MESSAGE =
  '¡Hola {nombre}! 😊 Te escribimos de {tienda} para contarte que tu pedido ya está listo:\n\n{productos}\n\n¡Gracias por elegirnos! 🧡'

// {nombre} = first name only ("¡Hola Ana!"), {tienda}, {productos} = one "• 2 x Cookies" per line.
export function readyMessage(template, order, storeName) {
  const items = order.items.map((l) => `• ${l.qty} x ${l.name}${l.variant ? ` (${l.variant})` : ''}`).join('\n')
  return (template?.trim() || DEFAULT_READY_MESSAGE)
    .replaceAll('{nombre}', order.customer_name.trim().split(/\s+/)[0])
    .replaceAll('{tienda}', storeName ?? '')
    .replaceAll('{productos}', items)
}

// Customers type their number however they like ("2477 15-123456", "011 1512345678", "+54 9 11 ...").
// wa.me needs 549 + area code without 0 + number without 15. Anything else (another country) goes as typed.
export function waNumber(phone) {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('549') && d.length === 13) return d
  let rest = d.startsWith('54') && d.length >= 12 ? d.slice(2) : d
  rest = rest.replace(/^0/, '')
  // Area code (2 to 4 digits) + 15 + number = 12 digits: drop the 15.
  if (rest.length === 12) {
    const k = [2, 3, 4].find((i) => rest.slice(i, i + 2) === '15')
    if (k) rest = rest.slice(0, k) + rest.slice(k + 2)
  }
  return rest.length === 10 ? `549${rest}` : d
}

export const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`
