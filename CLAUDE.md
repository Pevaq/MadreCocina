# MadreCocina

Tienda online de pastelería. Los clientes arman un pedido (sin pago online); la dueña lo recibe por email y lo gestiona desde un backoffice. Una sola administradora. Prioridad: costo de mantenimiento cero.

Setup desde cero: ver `README.md`. Este archivo es el contexto vivo del proyecto: actualizarlo en cada iteración (decisiones, estado, pendientes).

## Arquitectura

- **Frontend**: SPA Vite + React, sin router (hash `#/admin` en `src/main.jsx`). Publicada en GitHub Pages vía `.github/workflows/deploy.yml` en cada push a `main`.
  - `src/Shop.jsx`: catálogo, carrito, checkout, pantalla de confirmación con botón de WhatsApp.
  - `src/admin/`: login + pestañas Pendientes, Historial (CSV), Productos, Categorías, Ajustes.
- **Supabase** (proyecto `ulazrwdhhxzimszjhpoz`): Postgres + Auth + Storage (bucket `products`). Esquema en `supabase/schema.sql`.
- **Función `place-order`** (`supabase/functions/place-order`): único punto de entrada de pedidos. Recalcula precios desde la DB, valida fecha mínima, inserta con service role y manda email por Resend.
- **Lógica compartida** browser/Deno: `supabase/functions/_shared/order.js` (tests en `order.test.js`, `npm test`).
- **Keep-alive**: `.github/workflows/keep-alive.yml` consulta la DB 2 veces por semana para que Supabase free no pause el proyecto.

## Decisiones (y por qué)

- **Sin pagos online**: se coordina por WhatsApp/transferencia; evita backend de pagos y comisiones.
- **WhatsApp = botón `wa.me` del cliente**, no envío automático (la API de WhatsApp Business es paga).
- **Email solo a la dueña** vía Resend sin dominio (`onboarding@resend.dev`): Resend sin dominio verificado solo envía al email de la propia cuenta. El feedback al cliente es la pantalla de confirmación.
- **Pendientes e historial = misma tabla `orders`** (`status` pending/delivered). Sin Google Sheets: exportación CSV en Historial.
- **Precio de variante opcional** (`variants.price` null = precio del producto).
- **Fecha mínima de entrega** = hoy + el mayor `lead_days` del pedido. Servidor usa `STORE_TZ` (default Buenos Aires).
- **El público nunca escribe en la DB**: RLS solo lectura del catálogo activo; `orders` solo vía la función o el admin logueado. El registro de usuarios está desactivado en Supabase (requisito de seguridad: cualquier usuario autenticado es admin).
- Moneda fija ARS (`src/lib.js`).
- **Orden manual por arrastre** (2026-10-17): `categories.sort` y `products.sort` = posición; se reordena en el backoffice arrastrando ⠿ (`src/admin/sortable.js`, pointer events sin librería, anda con mouse y touch). La tienda ordena por `sort` y luego por nombre. El orden de productos es uno solo (global); el filtro por categoría respeta ese orden.
- **Stock por producto** (2026-10-18): `products.stock` obligatorio (0 = Agotado, se ve en la tienda con el botón deshabilitado; si hay, la tienda muestra "N disponibles"). Compartido por todas las variantes. El pedido lo descuenta en la misma transacción que lo guarda (función SQL `create_order`, solo service role, la llama `place-order`); borrar un pedido **pendiente** lo devuelve (trigger `restock`). Por eso `orders.items` guarda `product_id` (los pedidos anteriores no lo tienen y no devuelven stock). El editor de productos no reenvía el stock si no se tocó, para no pisar descuentos hechos mientras se editaba.
- **Todo producto lleva al menos una foto** (2026-10-18): el editor no deja guardar sin foto (validación solo en el backoffice; la DB no lo exige porque solo escribe la admin).
- **Borrar productos desde la lista** (2026-10-18): ícono de tacho en cada fila de Productos (pide confirmación; borra el producto y sus fotos). El botón dentro del editor sigue existiendo.
- **Fotos HEIC** (2026-10-18): Chrome/Firefox no leen HEIC (fotos de iPhone/Mac) y la subida quedaba colgada en "Guardando…". Si el navegador no puede leer la foto, se convierte con `heic-to` (~3 MB, import dinámico: solo se descarga al subir una HEIC). Toda foto se sube como JPG ≤1200 px. Si igual no se puede leer, se muestra un error y el botón se libera.
- **Identidad MADRE** (2026-10-18, reemplaza la paleta pastel provisoria): sale del Figma "Panadería" (`figma.com/design/4f02ud6U3xpTORvpJ1rUs4`). Logo = frame "Final" (284:236): "MADRE" crema `#EFE9D6` sobre el perro en patineta rojo oscuro `#860004`, fondo rojo `#a40005` con grano al 20% en overlay. Títulos en Kirang Haerang (Google Fonts, mayúsculas, como las etiquetas), texto en sans del sistema, tinta `#2c2c2d`. Claro fijo (`color-scheme: light`). Ilustraciones de la marca: dibujos a mano de la página Packaging, frame "Illust" (175:94). En la web: `public/logo.svg` (armado con las 2 capas del logo), `favicon.svg`, `panadero.svg` (pie de la tienda junto a "SIN CONSERVANTES · PRODUCTO LOCAL", como las etiquetas), `chef.svg` (confirmación del pedido), `src/grano.png`. Los SVG originales de Figma quedan en `brand/` (ignorado por git).

## Operación

- Deploy web: `git push` a `main`.
- Deploy función: `npx supabase functions deploy place-order --no-verify-jwt` (si cambia `supabase/functions/`).
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
- [ ] **Catálogo de prueba cargado en producción** (2026-10-17) para revisar la UI: 8 productos (Focaccia, Pan de masa madre, Chipá, Cookies, Alfajores de maicena, Torta de zanahoria, Cheesecake, Budín de limón), categorías Cookies/Tortas/Budines (Pan ya existía) e imágenes `test-*.svg` en Storage. Borrar antes de lanzar: productos y categorías desde el backoffice o por SQL, y las imágenes con `storage rm` (todas empiezan con `test-`).
- [ ] Rediseño de UI con la marca MADRE (2026-10-18): aplicado a la tienda (banda roja con logo, títulos Kirang Haerang, ilustraciones) y, por los tokens compartidos, al backoffice. Falta revisarlo con la dueña.

## Ideas / deuda conocida

- **Subida de fotos HEIC** (deuda aceptada 2026-10-18): la dueña reporta que no le funciona desde su Mac. Verificado que producción tiene el conversor y que una HEIC real de iPhone (3992×2992) se convierte en ~4 s en Edge; no se pudo reproducir. Para retomarlo: averiguar navegador, mensaje que ve y conseguir la foto que falla. Mientras tanto, exportar las fotos como JPG antes de subirlas.
- Fotos subidas y canceladas en el editor quedan huérfanas en Storage (`shortcut:` en `src/admin/Products.jsx`).
- Sin protección anti-spam en el formulario de pedidos.
- Sin opción retiro/envío (se usa el campo Notas).
- Actions de los workflows en Node 20 (deprecado por GitHub): subir versiones cuando dejen de funcionar.
