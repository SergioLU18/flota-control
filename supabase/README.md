# Base de datos (Supabase)

El esquema sale de la demo (`src/data/types.ts`, `src/lib/calc.ts`) y de [docs/MODULOS.md](../docs/MODULOS.md). La app habla directo con Supabase usando supabase-js:

- **Auth** maneja cuentas y sesiones (token JWT, igual en navegador y en Capacitor).
- **RLS** decide qué ve y qué hace cada rol.
- Las acciones de varios pasos son **funciones RPC** que corren en una sola transacción.
- Las fotos y los documentos van a **Storage**.

```
supabase/
  config.toml                               configuración del entorno local (supabase start)
  migrations/
    20261014000100_esquema_inicial.sql      tablas, reglas, auditoría, generación de cargos y vistas
    20261014000200_catalogos.sql            tipos de servicio
    20261014000300_permisos.sql             alta de usuarios, RLS, RPC y privilegios
    20261014000400_storage_y_cron.sql       bucket "archivos" y tarea nocturna de cargos
  pruebas.mjs                               carga la demo y prueba reglas y permisos
```

```bash
npm run db:test   # no necesita Docker ni conexión: usa PGlite (Postgres en WASM) imitando a Supabase
```

## Proyecto

Proyecto `flota-control` (ref `twdbrwapuwabvcabbdyw`, org ChichenIT, `us-east-1`). Ya tiene las cuatro migraciones, el bucket `archivos` y el cron `generar-cargos`.
La contraseña de la base está en `.env.local` (`SUPABASE_DB_PASSWORD`), que no se sube a git.

Para subir una migración nueva:

```bash
npx supabase login                                   # una vez por equipo
npx supabase link --project-ref twdbrwapuwabvcabbdyw # una vez por clon del repo
npx supabase db push
npx supabase gen types typescript --linked --schema public > src/lib/database.types.ts
```

### Desde cero (otro entorno)

1. En [supabase.com](https://supabase.com) crea el proyecto. Región sugerida: `us-east-1`, la más cercana a Mérida entre las disponibles.
2. Liga el repo y sube las migraciones como arriba.
3. En el panel, haz estos ajustes, que **no** se aplican con `db push` (`config.toml` solo afecta al entorno local):
   - **Authentication → Sign In / Providers:** desactiva *Allow new users to sign up*. Así solo entra quien des de alta. Aunque alguien lograra registrarse, su perfil nace inactivo y no ve nada.
   - **Authentication → URL Configuration:** pon la URL de Netlify como *Site URL*.
   - **Integrations → Cron:** confirma que existe el job `generar-cargos`. Si `pg_cron` no estaba habilitado al hacer el push, habilítalo ahí y vuelve a correr el bloque de cron de la migración 0400 en el SQL Editor.
4. Crea al personal en **Authentication → Users → Add user**, con correo y contraseña. En *User metadata* puedes poner `{"nombre": "Ana Canul"}`. Cada cuenta crea su perfil en `usuarios` como **operador inactivo**.
5. Activa al primer admin desde el SQL Editor. A partir de ahí, los demás se activan desde la pantalla de Usuarios de la app.
   ```sql
   update usuarios set rol = 'admin', activo = true where correo = 'ana@empresa.mx';
   ```

La app solo necesita la URL del proyecto y la **publishable/anon key** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). La service role key **nunca** va en el frontend. Solo la usa la futura tarea de Orión.

## Tablas

| Módulo | Tablas |
|---|---|
| 1. Usuarios | `usuarios` (perfil ligado a `auth.users`), `auditoria` |
| 2. Flota | `vehiculos`, `llantas` |
| 3. Conductores | `conductores`, `referencias_conductor`, `documentos_conductor` |
| 4. Rentas | `rentas` |
| 5. Cobranza | `cargos`, `pagos` |
| 6. Kilometraje y mantenimiento | `registros_km`, `servicios`, `tipos_servicio` |
| 7–8. Incidentes e inspecciones | `incidentes`, `inspecciones`, `fotos` |
| 9. Orión | `orion_sincronizaciones` (+ `vehiculos.orion_equipo_id`) |
| 11. Finanzas | `gastos` |
| Transversal | `archivos` (metadatos; el binario está en el bucket `archivos`) |

Vistas: `v_saldos_rentas`, `v_saldos_conductores`, `v_saldos_vehiculos`, `v_mantenimiento`, `v_licencias` y `v_llantas_vigentes`. Todas con `security_invoker`, así que respetan el RLS de quien consulta.

## Cómo la usa la app

| Acción | Llamada |
|---|---|
| Consultar cualquier pantalla | `supabase.from('vehiculos').select(...)`, vistas incluidas |
| Altas y ediciones simples (coches, conductores, servicios, incidentes, inspecciones, km, pagos, gastos) | `insert` / `update` directo. `registrado_por` se llena solo con el usuario de la sesión |
| Iniciar renta | `rpc('iniciar_renta', { p_vehiculo_id, p_conductor_id, p_tarifa_semanal, p_deposito, p_fecha_inicio?, p_km_entrega?, p_notas? })` |
| Finalizar renta | `rpc('finalizar_renta', { p_renta_id, p_km_devolucion, p_deposito_estado, p_fecha_fin? })` |
| Editar tarifa y depósito (admin) | `rpc('editar_renta', { p_renta_id, p_tarifa_semanal, p_deposito })` |
| Cancelar pago (admin) | `rpc('cancelar_pago', { p_pago_id, p_motivo })` |
| Botón "Generar cargos de la semana" | `rpc('generar_cargos')` (también corre solo cada noche) |
| Subir foto o documento | `storage.from('archivos').upload('fotos/<archivo_id>.jpg', blob, { upsert: true })` y después `insert` en `archivos` |

## Permisos (RLS)

| | Sin sesión | Inactivo | Operador | Admin |
|---|---|---|---|---|
| Flota, conductores, rentas, cobranza, mantenimiento, incidentes, inspecciones | — | — | consulta y captura | consulta y captura |
| Iniciar y finalizar rentas, registrar pagos, generar cargos | — | — | ✔ | ✔ |
| Editar tarifas, cancelar pagos, borrar km erróneo, corregir cargos | — | — | — | ✔ |
| Gastos, auditoría, Orión, catálogo de servicios | — | — | — | ✔ |
| Usuarios | — | solo su perfil | consulta | consulta y edita |

Nada se borra por la API, salvo referencias, fotos, gastos y (admin) registros de km: las demás tablas no tienen política de `delete`.

## Reglas que garantiza la base

Aunque la app tenga un error, la base no deja guardar datos que rompan estas reglas:

- **Una renta activa por coche y por conductor.** Hay índices únicos parciales y, además, restricciones `EXCLUDE` que impiden que dos rentas se traslapen en fechas, incluso al capturar historial atrasado.
- **"Rentado" no se pone a mano.** Iniciar una renta pasa el coche a rentado, y solo si estaba disponible. Finalizarla lo regresa a disponible. Una renta finalizada no se reabre, y nunca se le cambia el coche ni el conductor.
- **El kilometraje no retrocede.** `vehiculos.km_actual` lo mantiene un trigger y se recalcula si se borra una captura errónea.
- **Pagos:** no se editan ni se borran. Solo se cancelan, una vez y con motivo. El saldo siempre se calcula (cargos − pagos vigentes).
- **Cargos idempotentes:** `generar_cargos` crea las semanas que falten. Correrla dos veces no duplica nada y, si la tarea no corrió unos días, se pone al día.
- **Inspecciones e incidentes ligados a una renta deben ser del mismo coche** que esa renta. Una entrega y una recepción por renta.
- **Auditoría automática:** cada alta, cambio o baja queda en `auditoria` con el usuario (del JWT), la acción (la fijan las RPC) y, en los cambios, solo los campos que cambiaron. No se edita ni se borra.

## Decisiones que conviene revisar

1. **Semanas de cobro por renta.** Cada renta se cobra por sus propias semanas, a partir de su fecha de inicio. La demo usaba "lunes de la semana actual", y con rentas que empiezan a media semana eso duplicaba días. Si el cliente cobra a todos el mismo día (preguntas 2 y 4), solo cambia `generar_cargos`.
2. **Aplicar el depósito = un pago con método `deposito`**, para que el saldo baje.
3. **Cargos por daños u otros** (`tipo = 'danio' | 'otro'`), opcionalmente ligados a un incidente.
4. **CURP opcional pero única**, como base de la futura lista negra.
5. **Un documento vigente por tipo y conductor.** El archivo anterior se queda en `archivos`.
6. **Los cargos los corrige un admin editando el monto**, a diferencia de los pagos. Si el cliente quiere "cancelar con motivo", se agrega igual que en `pagos`.
7. **Cambio de coche a mitad de renta** (pregunta 8): por ahora es finalizar la renta y abrir otra.
8. **Columnas sensibles:** RLS filtra filas, no columnas. Un operador puede leer `vehiculos.precio_compra` y los costos de servicios por la API, aunque la app no se los muestre. Si importa, se mueve a una tabla aparte solo para admin.

## Pendiente

- **Crear usuarios desde la app** requiere la service role key, así que va en una Edge Function. Mientras tanto se crean en el panel (paso 4). Activarlos y cambiarles el rol sí se hace desde la pantalla de Usuarios.
- **Llantas y catálogo de servicios:** la app los muestra, pero aún no tiene pantallas para editarlos. Por ahora se editan desde el panel.
- **Tarea de Orión:** una Edge Function programada con la service role key, en cuanto se confirme la API (pregunta 1).
- No hay estado "vendido" para dar de baja coches. La lista negra, las alertas de Orión, WhatsApp y CFDI quedan para el Futuro.
