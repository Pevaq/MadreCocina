# MadreCocina

Tienda online de pastelería. Los clientes arman un pedido (sin pago online); la dueña lo recibe por email y lo gestiona desde un backoffice. Una sola administradora. Prioridad: costo de mantenimiento cero.

Setup desde cero: ver `README.md`. Este archivo es el contexto vivo del proyecto: actualizarlo en cada iteración (decisiones, estado, pendientes).

## Arquitectura

- **Frontend**: SPA Vite + React, sin router (hash `#/admin` en `src/main.jsx`). Publicada en GitHub Pages vía `.github/workflows/deploy.yml` en cada push a `main`.
  - `src/Shop.jsx`: catálogo, carrito, checkout, pantalla de confirmación (datos de transferencia + botón de WhatsApp) y botón flotante de WhatsApp.
  - `src/admin/`: login + módulos Pedidos (Pendientes / Finalizados con CSV), Gestión (Productos / Categorías) y Ajustes.
- **Supabase** (proyecto `ulazrwdhhxzimszjhpoz`): Postgres + Auth + Storage (bucket `products`). Esquema en `supabase/schema.sql`.
- **Función `place-order`** (`supabase/functions/place-order`): único punto de entrada de pedidos. Recalcula precios desde la DB, valida fecha mínima, inserta con service role y manda email por Resend.
- **Lógica compartida** browser/Deno: `supabase/functions/_shared/order.js` (tests en `order.test.js`, `npm test`).
- **Keep-alive**: `.github/workflows/keep-alive.yml` consulta la DB 2 veces por semana para que Supabase free no pause el proyecto.
- **Limpieza de fotos** (2026-10-18): el mismo workflow llama a la función `clean-images` (`supabase/functions/clean-images`), que borra del bucket `products` las fotos que ningún producto usa y tienen más de 24 h (margen para un editor abierto sin guardar). Si falla la lectura de productos no borra nada. Llamarla es inofensivo (solo borra huérfanas), por eso alcanza con la anon key. Se puede correr a mano desde GitHub → Actions → Keep Supabase awake → Run workflow.

## Decisiones (y por qué)

- **Sin pagos online**: se coordina por WhatsApp/transferencia; evita backend de pagos y comisiones.
- **WhatsApp = botón `wa.me` del cliente**, no envío automático (la API de WhatsApp Business es paga). Número y on/off en Ajustes; también controla el botón flotante de la tienda (píldora roja con la galleta de las ilustraciones, sube cuando aparece la barra del carrito).
- **Pago por transferencia** (2026-10-18): alias y titular (+ banco) en Ajustes (`settings.transfer_alias`, `transfer_holder`; lectura pública, son para el cliente). La confirmación dice "¡Recibimos tu pedido!", fecha en palabras y total, el alias con botón Copiar, y pide mandar el comprobante por WhatsApp para empezar a prepararlo; el mensaje de WhatsApp ya viene armado con nombre, fecha, productos y total. Sin alias, solo "te vamos a escribir para coordinar".
- **El cliente no ve el número de pedido** (2026-10-18): delataría cuántos pedidos recibe la tienda. La dueña identifica el pedido por nombre/fecha; el número sigue en el email y el backoffice.
- **Email solo a la dueña** vía Resend sin dominio (`onboarding@resend.dev`): Resend sin dominio verificado solo envía al email de la propia cuenta. El feedback al cliente es la pantalla de confirmación.
- **Pendientes e historial = misma tabla `orders`**. Sin Google Sheets: exportación CSV en Finalizados.
- **Estados del pedido** (2026-10-18): Recibido (`pending`) → Pagado (`paid`) → En preparación (`preparing`) → Listo (`ready`) → Entregado (`delivered`, pasa a Finalizados). Se puede saltar o volver a cualquier estado, con un selector en la tarjeta y en el detalle. Etiquetas en `STATUSES` de `src/admin/Orders.jsx`; los valores están en el check de `orders.status`. Pendientes = todo lo no entregado, agrupado por día de entrega (Atrasado / Hoy / Mañana / fecha); Finalizados igual, del más reciente al más viejo. Tocando la tarjeta se abre el detalle (estado, datos, líneas con precio, mayorista, Borrar); la tarjeta también tiene un tacho para borrar sin abrirlo (pide confirmación). Borrar un pedido no entregado devuelve el stock.
- **Precio mayorista** (2026-10-18): check en el detalle del pedido (`orders.wholesale`) que habilita "Cobrado" para escribir lo que se cobró de verdad (el cliente vio el precio normal en la tienda). `amount_received` = total al entregar, o el monto escrito si es mayorista. El CSV de Finalizados trae Total, Mayorista (Sí/No) y Monto cobrado, para analizar ganancias.
- **Navegación del backoffice** (2026-10-18): tres módulos (Pedidos, Gestión, Ajustes); Pedidos tiene pestañas Pendientes / Finalizados y Gestión, Productos / Categorías (`SubTabs` en `src/admin/Admin.jsx`).
- **Precio de variante opcional** (`variants.price` null = precio del producto).
- **Fecha mínima de entrega** (regla cambiada 2026-10-18): el día de hoy no cuenta. Con el mayor `lead_days` del pedido = N > 0, mínimo = hoy + N + 1 (2 días pedido el domingo 18 → miércoles 21); con N = 0, hoy. Misma función (`minDeliveryDate`) en la tienda y en `place-order`: si cambia, redeployar la función. Servidor usa `STORE_TZ` (default Buenos Aires).
- **El público nunca escribe en la DB**: RLS solo lectura del catálogo activo; `orders` solo vía la función o el admin logueado. El registro de usuarios está desactivado en Supabase (requisito de seguridad: cualquier usuario autenticado es admin).
- Moneda fija ARS (`src/lib.js`).
- **Orden manual por arrastre** (2026-10-17): `categories.sort` y `products.sort` = posición; se reordena en el backoffice arrastrando ⠿ (`src/admin/sortable.js`, pointer events sin librería, anda con mouse y touch). El mismo hook ordena las fotos en el editor de productos (sin tabla: el orden se guarda con el producto, la primera es la portada). La tienda ordena por `sort` y luego por nombre. El orden de productos es uno solo (global); el filtro por categoría respeta ese orden.
- **Stock por producto** (2026-10-18): `products.stock` obligatorio (0 = Agotado, se ve en la tienda con el botón deshabilitado; la cantidad disponible no se muestra al cliente desde 2026-10-18, solo limita cuánto puede pedir). Compartido por todas las variantes. El pedido lo descuenta en la misma transacción que lo guarda (función SQL `create_order`, solo service role, la llama `place-order`); borrar un pedido **no entregado** lo devuelve (trigger `restock`). Por eso `orders.items` guarda `product_id` (los pedidos anteriores no lo tienen y no devuelven stock). El editor de productos no reenvía el stock si no se tocó, para no pisar descuentos hechos mientras se editaba.
- **Desktop** (2026-10-19): desde 720 px los paneles (Tu pedido, detalle del pedido) son diálogos centrados y la barra del carrito una píldora centrada; desde 900 px los pedidos van de a dos por fila. Escape cierra los paneles (`useEscape` en `src/lib.js`), hover en botones y tarjetas, foco visible con teclado. Ajustes en bloques (Tienda, WhatsApp, Pago por transferencia), ancho máximo 640 px como el editor.
- **Pedido en barra lateral (desktop)** (2026-10-19): desde 1100 px, en cuanto hay algo en el pedido, "Tu pedido" (líneas, total y formulario) queda fijo a la derecha del catálogo y la página se ensancha a 1320 px; no hay barra "Ver pedido" ni diálogo, y WhatsApp pasa abajo a la izquierda. Es el mismo componente `Checkout` con `inline`. Por debajo de 1100 px, barra + diálogo/hoja como antes.
- **Pantalla de carga** (2026-10-19): `#splash` en `index.html` (HTML + CSS inline, pinta antes que el JS): fondo rojo con el logo que se mece y tres puntos. La tienda la saca (`hideSplash` en `src/lib.js`) cuando terminan las 3 consultas del catálogo, aunque alguna falle; el backoffice, al montar.
- **Editor de productos** (2026-10-18): bloques en tarjetas (datos, precio y stock, fotos con "+ Foto" y portada marcada, variantes) y Guardar/Borrar fijos abajo. Vista previa en vivo con la misma card de la tienda (`ProductCard` exportada de `src/Shop.jsx`): al final del formulario en el celular, columna fija a la derecha desde 960 px.
- **Todo producto lleva al menos una foto** (2026-10-18): el editor no deja guardar sin foto (validación solo en el backoffice; la DB no lo exige porque solo escribe la admin).
- **Borrar productos desde la lista** (2026-10-18): ícono de tacho en cada fila de Productos (pide confirmación; borra el producto y sus fotos). El botón dentro del editor sigue existiendo.
- **Fotos HEIC** (2026-10-18): Chrome/Firefox no leen HEIC (fotos de iPhone/Mac) y la subida quedaba colgada en "Guardando…". Si el navegador no puede leer la foto, se convierte con `heic-to` (~3 MB, import dinámico: solo se descarga al subir una HEIC). Toda foto se sube como JPG ≤1200 px. Si igual no se puede leer, se muestra un error y el botón se libera.
- **Identidad MADRE** (2026-10-18, reemplaza la paleta pastel provisoria): sale del Figma "Panadería" (`figma.com/design/4f02ud6U3xpTORvpJ1rUs4`). Logo = frame "Final" (284:236): "MADRE" crema `#EFE9D6` sobre el perro en patineta rojo oscuro `#860004`, fondo rojo `#a40005` con grano al 20% en overlay. Títulos en Kirang Haerang (Google Fonts, mayúsculas, como las etiquetas), texto en Onest (Google Fonts, la del diseño de la card), tinta `#2c2c2d`. Card de producto de la tienda = Figma nodo 383:89: foto cuadrada de borde a borde (badge Agotado encima), título, descripción, "Pedir con N días" solo si N > 0, y pie con línea: precio, cantidad − n + y Agregar. Del diseño se mantiene el rojo de la marca (`#a40005`) y el texto crema de los botones, no el `#b40000`/blanco del frame. Claro fijo (`color-scheme: light`). Ilustraciones de la marca: dibujos a mano de la página Packaging, frame "Illust" (175:94). En la web: `public/logo.svg` (armado con las 2 capas del logo), `favicon.svg`, `panadero.svg` (pie de la tienda junto a "SIN CONSERVANTES · PRODUCTO LOCAL", como las etiquetas), `chef.svg` (confirmación del pedido), `src/grano.png`. Los SVG originales de Figma quedan en `brand/` (ignorado por git).

## Operación

- Deploy web: `git push` a `main`.
- Deploy funciones (si cambia `supabase/functions/`): `npx supabase functions deploy place-order --no-verify-jwt` y `npx supabase functions deploy clean-images` (esta con verificación de JWT: la llama el workflow con la anon key).
- Consultas a la DB desde la terminal: `npx supabase db query --linked "<sql>"` (una sentencia por llamada: con varias solo devuelve la última). SQL largo o con acentos: guardarlo en un archivo dentro de `supabase/.temp/` y usar `-f <ruta>` (pasado como argumento falla en Windows sin mostrar error). Storage: `npx supabase storage rm ss:///products/<archivo> --experimental --linked --yes` y `storage cp ./<ruta-relativa> ss:///products/<archivo> --experimental --linked` (con ruta absoluta `C:/...` falla: toma `C:` como protocolo).
- Cambios de esquema: escribir el SQL nuevo y aplicarlo en Supabase (SQL Editor o MCP); mantener `supabase/schema.sql` como fuente de verdad.
- Secretos de la función (`RESEND_API_KEY`, `NOTIFY_EMAIL`): en Supabase → Edge Functions → Secrets. Nunca en el repo ni en el chat.
- Variables del repo (`SUPABASE_URL`, `SUPABASE_ANON_KEY`): GitHub → Settings → Secrets and variables → Actions → Variables.
- En esta máquina `gh` no está en el PATH: `"/c/Program Files/GitHub CLI/gh.exe"`.

## Estado y pendientes

- [x] Supabase, función de pedidos y email funcionando (2026-10-17).
- [x] Web publicada en https://madrecocina.com.ar/ con HTTPS obligatorio (2026-10-17). `www` y `pevaq.github.io/MadreCocina/` redirigen ahí.
  - Dominio registrado en NIC Argentina, DNS en Cloudflare (plan Free): A `@` → 185.199.108–111.153, CNAME `www` → `pevaq.github.io`, **sin proxy** (nube gris: si se activa el proxy, GitHub no puede renovar el certificado).
  - El dominio está configurado en Settings → Pages (no hay archivo CNAME: el deploy es por Actions).
- [x] Datos de prueba borrados y numeración de pedidos reiniciada en 1 (2026-10-17).
- [x] Catálogo de prueba borrado (productos y categorías a mano; las 14 imágenes `test-*` con `clean-images`, 2026-10-18).
- [ ] Rediseño de UI con la marca MADRE (2026-10-18): aplicado a la tienda (banda roja con logo, títulos Kirang Haerang, ilustraciones) y, por los tokens compartidos, al backoffice. Falta revisarlo con la dueña.
- [x] Actions del deploy actualizadas a versiones con Node 24 (2026-10-18): checkout v7, setup-node v7, upload-pages-artifact v5, deploy-pages v5.
- [x] Pedidos de prueba borrados y numeración de pedidos reiniciada en 1 (2026-10-19, `alter sequence orders_id_seq restart with 1`; solo con la tabla `orders` vacía).

## Ideas / deuda conocida

- **Subida de fotos HEIC** (deuda aceptada 2026-10-18): la dueña reporta que no le funciona desde su Mac. Verificado que producción tiene el conversor y que una HEIC real de iPhone (3992×2992) se convierte en ~4 s en Edge; no se pudo reproducir. Para retomarlo: averiguar navegador, mensaje que ve y conseguir la foto que falla. Mientras tanto, exportar las fotos como JPG antes de subirlas. Pista: el 2026-10-18 entre 21:29 y 21:32 UTC (después del deploy del arreglo) se subieron 4 JPG que nunca se guardaron en un producto; la subida en sí funcionó.
- Sin protección anti-spam en el formulario de pedidos.
- Sin opción retiro/envío (se usa el campo Notas).
