# Flota Control

Sistema web de gestión de flota y rentas semanales (Fase 1). React en el navegador, Supabase como backend.

- **Documentación de módulos:** [docs/MODULOS.md](docs/MODULOS.md). También se ve dentro de la app en *Documentación*.
- **Notas originales:** `Note 6 Oct 2026.pdf`

## Correr

```bash
npm install
cp .env.example .env.local   # y llena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev       # http://localhost:5173
npm run build     # genera dist/ (estático, se abre en cualquier hosting)
```

En Netlify basta con conectar el repo: `netlify.toml` ya define el build y la carpeta `dist`.
Hay que agregar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en *Site configuration → Environment variables*.
Para entrar se necesita una cuenta activa (ver [supabase/README.md](supabase/README.md)).

## Cómo está hecha

- Vite + React + TypeScript, con React Router (HashRouter, sin configurar el servidor).
- Base de datos en Supabase: [supabase/README.md](supabase/README.md). `npm run db:test` la prueba con los datos ficticios de `src/data/mock.ts`.
- `src/lib/supabase.ts` crea el cliente; `src/data/load.ts` lee las tablas y las convierte al modelo de `src/data/types.ts`.
- `src/data/store.tsx` maneja la sesión y las acciones: cada una escribe en Supabase (insert, update o RPC) y recarga.
  Las reglas (rentas, km, pagos), los permisos y la auditoría los aplica la base.
- Los cálculos de pantalla (saldos, alerta de 10,000 km, avisos, finanzas) están en `src/lib/calc.ts` y `src/lib/finance.ts`.
- `src/lib/database.types.ts` se genera con `npx supabase gen types typescript --linked --schema public > src/lib/database.types.ts`
  después de cada migración.

```
src/
  data/       tipos, carga desde Supabase, store, catálogos, registro de módulos y datos ficticios (solo pruebas)
  lib/        cliente de Supabase, formatos (MXN, fechas en America/Merida), reglas, compresión de fotos y exportación CSV
  components/ layout, UI base y formularios compartidos
  pages/      una página por módulo
docs/MODULOS.md
```
