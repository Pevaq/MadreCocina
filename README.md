# Pastelería

Tienda (SPA) en GitHub Pages + Supabase (base de datos, login, fotos) + Resend (email). Todo en planes gratis.

- Tienda: `https://<usuario>.github.io/<repo>/`
- Backoffice: `https://<usuario>.github.io/<repo>/#/admin`

## Puesta en marcha (una sola vez)

### 1. Supabase
1. Crear cuenta y proyecto en https://supabase.com.
2. **SQL Editor** → pegar y ejecutar `supabase/schema.sql`.
3. **Authentication → Users → Add user**: crear el usuario de ella (email + contraseña).
4. **Authentication → Sign In / Providers**: desactivar **Allow new users to sign up** (si no, cualquiera podría crearse una cuenta y entrar al backoffice).
5. **Project Settings → API**: copiar la URL y la anon/publishable key.

### 2. Email (Resend)
1. Crear cuenta en https://resend.com **con el email de ella** (sin dominio propio, Resend solo envía al email de la cuenta).
2. Crear una API key.

### 3. Función de pedidos
Con la [CLI de Supabase](https://supabase.com/docs/guides/cli):
```sh
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>
npx supabase secrets set RESEND_API_KEY=re_xxx NOTIFY_EMAIL=email-de-ella@gmail.com
npx supabase functions deploy place-order --no-verify-jwt
```
Opcional: `STORE_TZ` (por defecto `America/Argentina/Buenos_Aires`) para calcular la fecha mínima de entrega.

### 4. GitHub
1. Subir este repo a GitHub (rama `main`).
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables**: crear `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
4. Cada push a `main` publica la web. `keep-alive.yml` consulta la base dos veces por semana para que Supabase no la pause.

## Desarrollo local
```sh
cp .env.example .env   # completar con los datos de Supabase
npm install
npm run dev
npm test
```
