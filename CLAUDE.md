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
- [ ] Rediseño de UI (definido 2026-10-17): estilo cálido artesanal (crema, terracota/marrón, títulos serif), mobile-first (clientes llegan desde Instagram/WhatsApp), tienda primero y luego backoffice con el mismo estilo. Esperando assets de marca (logo e identidad) en `brand/`.

## Ideas / deuda conocida

- Fotos subidas y canceladas en el editor quedan huérfanas en Storage (`shortcut:` en `src/admin/Products.jsx`).
- Sin protección anti-spam en el formulario de pedidos.
- Sin opción retiro/envío (se usa el campo Notas).
- Actions de los workflows en Node 20 (deprecado por GitHub): subir versiones cuando dejen de funcionar.
