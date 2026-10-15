# Flota Control (demo)

Demo estática en React del sistema de gestión de flota y rentas semanales (Fase 1, web).
Sirve para recorrer los módulos con el cliente antes de construir el backend.

- **Documentación de módulos:** [docs/MODULOS.md](docs/MODULOS.md). También se ve dentro de la app en *Documentación*.
- **Notas originales:** `Note 6 Oct 2026.pdf`

## Correr

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # genera dist/ (estático, se abre en cualquier hosting)
```

En Netlify basta con conectar el repo: `netlify.toml` ya define el build y la carpeta `dist`.
Agregar `?as=u1` (admin) o `?as=u3` (operador) a la URL entra directo con ese usuario.

## Cómo está hecha

- Vite + React + TypeScript, con React Router (HashRouter, sin configurar el servidor).
- Base de datos en Supabase: [supabase/README.md](supabase/README.md). `npm run db:test` la prueba con los datos de la demo.
- Sin backend: los datos ficticios están en `src/data/mock.ts` y el estado vive en memoria (`src/data/store.tsx`).
  Cada acción del store equivale a un futuro endpoint de la API y deja una línea en la auditoría.
- Las reglas de negocio (saldos, alerta de 10,000 km, avisos) están en `src/lib/calc.ts`.
- "Hoy" es fijo: 8 de octubre de 2026, para que los datos sean reproducibles.

```
src/
  data/       tipos, datos ficticios, store y registro de módulos
  lib/        formatos (MXN, fechas en America/Merida), reglas, compresión de fotos y exportación CSV
  components/ layout, UI base y formularios compartidos
  pages/      una página por módulo
docs/MODULOS.md
```
