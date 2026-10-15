-- Flota Control · esquema inicial (Fase 1)
-- Supabase (PostgreSQL 17). Ver supabase/README.md para las decisiones de diseño.
-- Los permisos (RLS), las funciones RPC y el alta de usuarios van en 20261014000300_permisos.sql.
--
-- Convenciones
--   · Fechas de calendario en `date` (día en America/Merida); momentos en `timestamptz`.
--   · Montos en MXN con numeric(12,2).
--   · Valores cerrados con CHECK sobre `text` (más fácil de ampliar que un ENUM).
--   · Nada se borra en las tablas de negocio: se cancela, se cierra o se desactiva.
--   · Quién actúa sale del JWT de Supabase Auth (auth.uid()). Las funciones RPC fijan además
--     el texto de la bitácora con set_config('app.accion', ..., true). Las tareas programadas
--     (cargos, Orión) no traen JWT y en la auditoría aparecen como "sistema".
--   · Las funciones de trigger que leen o escriben otras tablas son SECURITY DEFINER con
--     search_path vacío: aplican la regla completa aunque el usuario no vea todas las filas.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions; -- EXCLUDE con igualdad + traslape de rangos

-- ============================================================
-- Utilidades
-- ============================================================

create function public.hoy_merida() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'America/Merida')::date $$;

create function public.tocar_actualizado_en() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

-- ============================================================
-- 1. Usuarios
-- La cuenta (correo y contraseña, sesiones, tokens) la maneja Supabase Auth.
-- Aquí va el perfil del personal: nombre, rol y si está activo.
-- ============================================================

create table public.usuarios (
  id             uuid primary key references auth.users, -- sin cascada: un usuario con historial no se borra, se desactiva
  nombre         text not null check (btrim(nombre) <> ''),
  correo         text not null unique check (correo = lower(btrim(correo))),
  rol            text not null default 'operador' check (rol in ('admin', 'operador')),
  activo         boolean not null default false, -- lo activa un admin
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Rol del usuario de la sesión, o null si no hay sesión o el usuario está inactivo. Lo usan las políticas RLS.
create function public.rol_actual() returns text
language sql stable security definer set search_path = '' as $$
  select rol from public.usuarios where id = auth.uid() and activo
$$;

-- ============================================================
-- Archivos (fotos y documentos)
-- El binario vive en Supabase Storage (bucket "archivos"); aquí solo su ruta y metadatos.
-- El id lo genera el equipo antes de subir, para que reintentar no duplique.
-- ============================================================

create table public.archivos (
  id         uuid primary key default gen_random_uuid(),
  clave      text not null unique,             -- ruta del objeto dentro del bucket
  tipo_mime  text not null,
  bytes      integer check (bytes > 0),
  ancho      integer check (ancho > 0),
  alto       integer check (alto > 0),
  estado     text not null default 'pendiente' check (estado in ('pendiente', 'subido')),
  subido_por uuid not null default auth.uid() references public.usuarios,
  creado_en  timestamptz not null default now(),
  subido_en  timestamptz,
  check ((estado = 'subido') = (subido_en is not null))
);

-- ============================================================
-- 2. Flota
-- ============================================================

create table public.vehiculos (
  id              uuid primary key default gen_random_uuid(),
  marca           text not null check (btrim(marca) <> ''),
  modelo          text not null check (btrim(modelo) <> ''),
  anio            smallint not null check (anio between 1990 and 2100),
  placas          text not null unique check (placas <> '' and placas = upper(btrim(placas))),
  color           text not null default '',
  vin             text check (vin = upper(btrim(vin))),
  -- Caché del último registro de kilometraje; lo mantiene el trigger de registros_km.
  km_actual       integer not null default 0 check (km_actual >= 0),
  -- 'rentado' solo lo ponen y quitan las rentas (ver trigger vehiculos_validar_estado).
  estado          text not null default 'disponible' check (estado in ('disponible', 'rentado', 'taller')),
  notas           text not null default '',
  precio_compra   numeric(12,2) check (precio_compra >= 0),
  fecha_compra    date,
  orion_equipo_id text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create unique index vehiculos_vin_uq on public.vehiculos (vin) where vin is not null;
create unique index vehiculos_orion_uq on public.vehiculos (orion_equipo_id) where orion_equipo_id is not null;

-- ============================================================
-- 3. Conductores
-- ============================================================

create table public.conductores (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (btrim(nombre) <> ''),
  telefono        text not null default '',
  correo          text check (correo = lower(btrim(correo))),
  curp            text check (curp ~ '^[A-Z0-9]{18}$'),
  domicilio       text not null default '',
  licencia_numero text,
  licencia_vence  date,
  notas           text not null default '',
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
-- Base para la futura lista negra: la CURP identifica a la persona aunque cambie de teléfono.
create unique index conductores_curp_uq on public.conductores (curp) where curp is not null;

create table public.referencias_conductor (
  id           uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references public.conductores on delete cascade,
  nombre       text not null check (btrim(nombre) <> ''),
  parentesco   text not null default '',
  telefono     text not null default '',
  orden        smallint not null default 0
);
create index referencias_conductor_idx on public.referencias_conductor (conductor_id);

-- Un documento vigente por tipo. Al reemplazarlo, el archivo anterior queda en `archivos` y el cambio en la auditoría.
create table public.documentos_conductor (
  id             uuid primary key default gen_random_uuid(),
  conductor_id   uuid not null references public.conductores on delete cascade,
  tipo           text not null check (tipo in ('ine', 'licencia', 'no_penales', 'domicilio', 'referencias')),
  archivo_id     uuid not null references public.archivos,
  vence          date,
  subido_por     uuid not null default auth.uid() references public.usuarios,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (conductor_id, tipo)
);
create index documentos_conductor_archivo_idx on public.documentos_conductor (archivo_id);

-- ============================================================
-- 4. Rentas
-- ============================================================

create table public.rentas (
  id              uuid primary key default gen_random_uuid(),
  vehiculo_id     uuid not null references public.vehiculos,
  conductor_id    uuid not null references public.conductores,
  fecha_inicio    date not null,
  fecha_fin       date,
  tarifa_semanal  numeric(12,2) not null check (tarifa_semanal > 0),
  deposito        numeric(12,2) not null default 0 check (deposito >= 0),
  deposito_estado text not null default 'retenido' check (deposito_estado in ('retenido', 'devuelto', 'aplicado')),
  km_entrega      integer not null check (km_entrega >= 0),
  km_devolucion   integer,
  estado          text not null default 'activa' check (estado in ('activa', 'finalizada')),
  notas           text not null default '',
  creada_por      uuid default auth.uid() references public.usuarios,
  finalizada_por  uuid references public.usuarios,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint rentas_estado_completo check (
         (estado = 'activa'     and fecha_fin is null     and km_devolucion is null)
      or (estado = 'finalizada' and fecha_fin is not null and km_devolucion is not null)),
  constraint rentas_fechas_validas check (fecha_fin >= fecha_inicio),
  constraint rentas_km_devolucion_valido check (km_devolucion >= km_entrega),
  unique (id, vehiculo_id), -- destino de las FK compuestas que garantizan "misma renta, mismo coche"
  -- Reglas 1 y 2: un coche y un conductor no pueden tener dos rentas que se traslapen,
  -- ni siquiera al capturar historial con fechas pasadas. Fin exclusivo: devolver y volver a rentar el mismo día es válido.
  exclude using gist (vehiculo_id with =, daterange(fecha_inicio, fecha_fin, '[)') with &&),
  exclude using gist (conductor_id with =, daterange(fecha_inicio, fecha_fin, '[)') with &&)
);
-- Las mismas reglas como índice único parcial (el que describe la doc); además aceleran "renta activa de X".
create unique index rentas_vehiculo_activa_uq on public.rentas (vehiculo_id) where estado = 'activa';
create unique index rentas_conductor_activa_uq on public.rentas (conductor_id) where estado = 'activa';

-- ============================================================
-- 6. Kilometraje y mantenimiento
-- ============================================================

create table public.tipos_servicio (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null unique check (btrim(nombre) <> ''),
  reinicia_contador boolean not null default false, -- valor sugerido; cada servicio guarda el suyo
  descripcion       text not null default '',
  orden             smallint not null default 0,
  activo            boolean not null default true
);

create table public.servicios (
  id                uuid primary key default gen_random_uuid(),
  vehiculo_id       uuid not null references public.vehiculos,
  tipo_servicio_id  uuid not null references public.tipos_servicio,
  fecha             date not null,
  km                integer not null check (km >= 0),
  costo             numeric(12,2) not null default 0 check (costo >= 0),
  taller            text not null default '',
  notas             text not null default '',
  reinicia_contador boolean not null,
  registrado_por    uuid default auth.uid() references public.usuarios,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create index servicios_vehiculo_idx on public.servicios (vehiculo_id, fecha);
create index servicios_reinicio_idx on public.servicios (vehiculo_id, km desc) where reinicia_contador;

-- Historial de llantas por posición. La vigente es la que no tiene fecha de retiro.
create table public.llantas (
  id                uuid primary key default gen_random_uuid(),
  vehiculo_id       uuid not null references public.vehiculos,
  posicion          text not null check (posicion in ('DI', 'DD', 'TI', 'TD')),
  marca             text not null check (btrim(marca) <> ''),
  anio_dot          smallint check (anio_dot between 1990 and 2100),
  km_instalacion    integer not null check (km_instalacion >= 0),
  fecha_instalacion date not null,
  servicio_id       uuid references public.servicios, -- el "Cambio de llantas" que las instaló
  retirada_en       date,
  km_retiro         integer,
  check ((retirada_en is null) = (km_retiro is null)),
  check (retirada_en >= fecha_instalacion),
  check (km_retiro >= km_instalacion)
);
create unique index llantas_vigente_uq on public.llantas (vehiculo_id, posicion) where retirada_en is null;

-- 9. Orión: cada corrida de la tarea programada (o de una importación de CSV).
create table public.orion_sincronizaciones (
  id                     uuid primary key default gen_random_uuid(),
  iniciada_en            timestamptz not null default now(),
  terminada_en           timestamptz,
  origen                 text not null default 'api' check (origen in ('api', 'archivo')),
  estado                 text not null default 'en_curso' check (estado in ('en_curso', 'ok', 'error')),
  vehiculos_actualizados integer not null default 0,
  -- Lecturas que no se guardaron (menores a la anterior o con saltos absurdos), para el aviso.
  lecturas_descartadas   jsonb not null default '[]',
  nota                   text not null default ''
);

create table public.registros_km (
  id                uuid primary key default gen_random_uuid(),
  vehiculo_id       uuid not null references public.vehiculos,
  fecha             date not null,
  km                integer not null check (km >= 0),
  origen            text not null check (origen in ('manual', 'entrega', 'recepcion', 'orion')),
  renta_id          uuid,
  sincronizacion_id uuid references public.orion_sincronizaciones,
  registrado_por    uuid default auth.uid() references public.usuarios, -- vacío cuando viene de Orión
  creado_en         timestamptz not null default now(),
  foreign key (renta_id, vehiculo_id) references public.rentas (id, vehiculo_id),
  check ((origen = 'orion') = (sincronizacion_id is not null))
);
create index registros_km_vehiculo_idx on public.registros_km (vehiculo_id, fecha, km);

-- ============================================================
-- 5. Cobranza
-- ============================================================

create table public.cargos (
  id             uuid primary key default gen_random_uuid(),
  renta_id       uuid not null references public.rentas,
  -- 'renta' = semana de renta (la genera generar_cargos); 'danio'/'otro' = cargos manuales al conductor.
  tipo           text not null default 'renta' check (tipo in ('renta', 'danio', 'otro')),
  fecha          date not null,                 -- fecha contable del cargo (estado de cuenta, finanzas)
  periodo_inicio date,
  periodo_fin    date,
  monto          numeric(12,2) not null check (monto > 0),
  concepto       text not null check (btrim(concepto) <> ''),
  incidente_id   uuid,                           -- FK más abajo
  creado_por     uuid default auth.uid() references public.usuarios, -- vacío si lo generó la tarea programada
  creado_en      timestamptz not null default now(),
  check (tipo <> 'renta' or (periodo_inicio is not null and periodo_fin is not null and fecha = periodo_inicio)),
  check (periodo_fin >= periodo_inicio),
  -- Idempotencia: una misma renta no puede tener dos semanas de renta que se traslapen.
  exclude using gist (renta_id with =, daterange(periodo_inicio, periodo_fin, '[]') with &&) where (tipo = 'renta')
);
create index cargos_renta_idx on public.cargos (renta_id);
create index cargos_fecha_idx on public.cargos (fecha);

-- Los pagos no se editan ni se borran: solo se cancelan (ver trigger pagos_inmutables y la RPC cancelar_pago).
create table public.pagos (
  id                 uuid primary key default gen_random_uuid(),
  renta_id           uuid not null references public.rentas,
  fecha              date not null,
  monto              numeric(12,2) not null check (monto > 0),
  -- 'deposito' = aplicar el depósito de la renta al adeudo o a daños.
  metodo             text not null check (metodo in ('efectivo', 'transferencia', 'deposito')),
  notas              text not null default '',
  registrado_por     uuid not null default auth.uid() references public.usuarios,
  creado_en          timestamptz not null default now(),
  cancelado_en       timestamptz,
  cancelado_por      uuid references public.usuarios,
  motivo_cancelacion text,
  check ((cancelado_en is null and cancelado_por is null and motivo_cancelacion is null)
      or (cancelado_en is not null and cancelado_por is not null and btrim(motivo_cancelacion) <> ''))
);
create index pagos_renta_vigentes_idx on public.pagos (renta_id) where cancelado_en is null;
create index pagos_fecha_idx on public.pagos (fecha);

-- ============================================================
-- 7. Incidentes · 8. Inspecciones · Fotos
-- ============================================================

create table public.incidentes (
  id             uuid primary key default gen_random_uuid(),
  vehiculo_id    uuid not null references public.vehiculos,
  conductor_id   uuid references public.conductores,
  renta_id       uuid,
  fecha          date not null,
  tipo           text not null check (btrim(tipo) <> ''),
  descripcion    text not null default '',
  costo          numeric(12,2) not null default 0 check (costo >= 0),
  responsable    text not null check (responsable in ('conductor', 'empresa', 'tercero', 'seguro')),
  estado         text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  cerrado_en     timestamptz,
  cerrado_por    uuid references public.usuarios,
  registrado_por uuid default auth.uid() references public.usuarios,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  foreign key (renta_id, vehiculo_id) references public.rentas (id, vehiculo_id),
  check ((estado = 'cerrado') = (cerrado_en is not null))
);
create index incidentes_vehiculo_idx on public.incidentes (vehiculo_id, fecha);
create index incidentes_abiertos_idx on public.incidentes (fecha) where estado = 'abierto';

alter table public.cargos add foreign key (incidente_id) references public.incidentes;

-- El id lo genera el equipo (igual que en archivos) para que reintentar no duplique.
create table public.inspecciones (
  id             uuid primary key default gen_random_uuid(),
  vehiculo_id    uuid not null references public.vehiculos,
  renta_id       uuid,
  tipo           text not null check (tipo in ('entrega', 'recepcion')),
  fecha          date not null,
  km             integer not null check (km >= 0),
  combustible    smallint not null check (combustible between 0 and 8), -- en octavos
  notas          text not null default '',
  registrado_por uuid default auth.uid() references public.usuarios,
  creado_en      timestamptz not null default now(),
  foreign key (renta_id, vehiculo_id) references public.rentas (id, vehiculo_id),
  unique (renta_id, tipo) -- una entrega y una recepción por renta: la galería las pone lado a lado
);
create index inspecciones_vehiculo_idx on public.inspecciones (vehiculo_id, fecha);

-- Una foto pertenece a una inspección o a un incidente (exactamente uno, con FK real).
create table public.fotos (
  id            uuid primary key default gen_random_uuid(),
  archivo_id    uuid not null references public.archivos,
  inspeccion_id uuid references public.inspecciones on delete cascade,
  incidente_id  uuid references public.incidentes on delete cascade,
  etiqueta      text not null default '', -- Frente, Trasera, Lateral izq., ...
  con_danio     boolean not null default false,
  orden         smallint not null default 0,
  creado_en     timestamptz not null default now(),
  check (num_nonnulls(inspeccion_id, incidente_id) = 1)
);
create index fotos_inspeccion_idx on public.fotos (inspeccion_id) where inspeccion_id is not null;
create index fotos_incidente_idx on public.fotos (incidente_id) where incidente_id is not null;
create index fotos_archivo_idx on public.fotos (archivo_id);

-- ============================================================
-- 11. Finanzas: gastos que no son servicios ni incidentes
-- ============================================================

create table public.gastos (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null,
  categoria      text not null check (categoria in ('seguro', 'refrendo', 'gps', 'general', 'otro')),
  vehiculo_id    uuid references public.vehiculos, -- vacío = gasto general del negocio
  monto          numeric(12,2) not null check (monto > 0),
  concepto       text not null check (btrim(concepto) <> ''),
  registrado_por uuid default auth.uid() references public.usuarios,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index gastos_fecha_idx on public.gastos (fecha);
create index gastos_vehiculo_idx on public.gastos (vehiculo_id, fecha) where vehiculo_id is not null;

-- ============================================================
-- Auditoría: la escriben los triggers, nadie la edita
-- ============================================================

create table public.auditoria (
  id          bigint generated always as identity primary key,
  en          timestamptz not null default now(),
  usuario_id  uuid references public.usuarios, -- vacío = sistema (tareas programadas)
  accion      text,                            -- texto legible que fijan las RPC: "Inició renta"
  tabla       text not null,
  registro_id text not null,
  operacion   text not null check (operacion in ('alta', 'cambio', 'baja')),
  antes       jsonb,                           -- en cambios, solo los campos que cambiaron
  despues     jsonb
);
create index auditoria_en_idx on public.auditoria (en desc);
create index auditoria_registro_idx on public.auditoria (tabla, registro_id);
create index auditoria_usuario_idx on public.auditoria (usuario_id, en desc);

-- ============================================================
-- Triggers de reglas de negocio
-- ============================================================

-- "Rentado" no se elige a mano.
create function public.vehiculos_validar_estado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.estado = 'rentado' then
    raise exception 'Un vehículo nuevo no puede darse de alta como rentado';
  end if;
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado
     and (new.estado = 'rentado') <> exists (select 1 from public.rentas where vehiculo_id = new.id and estado = 'activa') then
    raise exception 'El estado "rentado" lo ponen y lo quitan las rentas (vehículo %)', new.placas;
  end if;
  return new;
end $$;

create trigger vehiculos_validar_estado before insert or update of estado on public.vehiculos
for each row execute function public.vehiculos_validar_estado();

-- Iniciar renta → coche rentado (solo si estaba disponible). Finalizar → disponible.
-- Las rentas finalizadas se pueden capturar como historial sin tocar el estado del coche.
create function public.rentas_sincronizar_vehiculo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.estado = 'activa' then
    update public.vehiculos set estado = 'rentado' where id = new.vehiculo_id and estado = 'disponible';
    if not found then
      raise exception 'El vehículo no está disponible para rentar';
    end if;
  elsif tg_op = 'UPDATE' and old.estado = 'activa' and new.estado = 'finalizada' then
    update public.vehiculos set estado = 'disponible' where id = new.vehiculo_id;
  end if;
  return null;
end $$;

create function public.rentas_validar_cambio() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.vehiculo_id <> old.vehiculo_id or new.conductor_id <> old.conductor_id then
    raise exception 'No se cambia el coche ni el conductor de una renta: se finaliza y se abre otra';
  end if;
  if old.estado = 'finalizada' and new.estado = 'activa' then
    raise exception 'Una renta finalizada no se reabre';
  end if;
  return new;
end $$;

create trigger rentas_validar_cambio before update on public.rentas
for each row execute function public.rentas_validar_cambio();
create trigger rentas_sincronizar_vehiculo after insert or update of estado on public.rentas
for each row execute function public.rentas_sincronizar_vehiculo();

-- El kilometraje nunca retrocede en el tiempo, y km_actual es siempre el mayor registrado.
create function public.registros_km_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  conflicto record;
begin
  select fecha, km into conflicto from public.registros_km
   where vehiculo_id = new.vehiculo_id and id <> new.id
     and ((fecha <= new.fecha and km > new.km) or (fecha > new.fecha and km < new.km))
   limit 1;
  if found then
    raise exception 'Kilometraje inconsistente: % km el % contra % km el %', new.km, new.fecha, conflicto.km, conflicto.fecha;
  end if;
  return new;
end $$;

create function public.registros_km_actualizar_vehiculo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Recalcular en vez de solo subir: si un admin borra una captura errónea, km_actual también baja.
  update public.vehiculos v
     set km_actual = coalesce((select max(km) from public.registros_km where vehiculo_id = v.id), 0)
   where v.id in (coalesce(new.vehiculo_id, old.vehiculo_id), coalesce(old.vehiculo_id, new.vehiculo_id));
  return null;
end $$;

create trigger registros_km_validar before insert or update on public.registros_km
for each row execute function public.registros_km_validar();
create trigger registros_km_actualizar_vehiculo after insert or update or delete on public.registros_km
for each row execute function public.registros_km_actualizar_vehiculo();

-- Pagos: no se borran; lo único que se permite es cancelarlos una vez.
create function public.pagos_inmutables() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los pagos no se borran: se cancelan con motivo';
  end if;
  if old.cancelado_en is not null then
    raise exception 'El pago ya está cancelado';
  end if;
  if (to_jsonb(new) - '{cancelado_en,cancelado_por,motivo_cancelacion}'::text[])
     is distinct from (to_jsonb(old) - '{cancelado_en,cancelado_por,motivo_cancelacion}'::text[]) then
    raise exception 'Los pagos no se editan: se cancela el erróneo y se registra el correcto';
  end if;
  return new;
end $$;

create trigger pagos_inmutables before update or delete on public.pagos
for each row execute function public.pagos_inmutables();

-- Auditoría inmutable.
create function public.auditoria_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'La bitácora de auditoría no se modifica';
end $$;

create trigger auditoria_inmutable before update or delete on public.auditoria
for each row execute function public.auditoria_inmutable();

-- ============================================================
-- Auditoría automática: cada alta, cambio o baja queda registrada con quién y qué cambió
-- ============================================================

create function public.auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_antes   jsonb;
  v_despues jsonb;
  v_id      text;
  -- km_actual es caché: cada lectura ya queda en registros_km.
  v_oculto  text[] := '{actualizado_en,km_actual}';
begin
  if tg_op = 'INSERT' then
    v_despues := to_jsonb(new) - v_oculto;
    v_id := new.id::text;
  elsif tg_op = 'DELETE' then
    v_antes := to_jsonb(old) - v_oculto;
    v_id := old.id::text;
  else
    select jsonb_object_agg(o.key, o.value), jsonb_object_agg(n.key, n.value)
      into v_antes, v_despues
      from jsonb_each(to_jsonb(old) - v_oculto) o
      join jsonb_each(to_jsonb(new) - v_oculto) n on n.key = o.key
     where o.value is distinct from n.value;
    if v_despues is null then
      return null; -- nada relevante cambió
    end if;
    v_id := new.id::text;
  end if;

  insert into public.auditoria (usuario_id, accion, tabla, registro_id, operacion, antes, despues)
  values (auth.uid(), nullif(current_setting('app.accion', true), ''), tg_table_name, v_id,
          case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end,
          v_antes, v_despues);
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'usuarios', 'vehiculos', 'llantas', 'conductores', 'referencias_conductor', 'documentos_conductor',
    'rentas', 'cargos', 'pagos', 'registros_km', 'tipos_servicio', 'servicios',
    'incidentes', 'inspecciones', 'fotos', 'gastos'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.auditar()',
                   t || '_auditar', t);
  end loop;

  foreach t in array array[
    'usuarios', 'vehiculos', 'conductores', 'documentos_conductor', 'rentas', 'servicios', 'incidentes', 'gastos'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_actualizado_en()',
                   t || '_actualizado_en', t);
  end loop;
end $$;

-- ============================================================
-- Cargos semanales
-- ============================================================

-- Crea las semanas de renta que falten hasta p_hasta. Idempotente: correrla dos veces no duplica
-- (la restricción EXCLUDE de cargos descarta lo que ya existe). Si la tarea no corrió unos días, se pone al día.
-- Las semanas se cuentan desde el inicio de cada renta (semana 1 = fecha_inicio … fecha_inicio + 6),
-- con la tarifa vigente al generarlas. Pendiente de confirmar con el cliente (preguntas 2 y 4).
-- La llama pg_cron cada noche (sin JWT) y el botón "Generar cargos de la semana" (cualquier usuario activo).
create function public.generar_cargos(p_hasta date default public.hoy_merida(), p_renta_id uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if auth.uid() is not null and public.rol_actual() is null then
    raise exception 'Sin permiso para esta acción' using errcode = '42501';
  end if;
  -- Dentro de iniciar/finalizar renta, los cargos quedan en la bitácora con la acción de la renta.
  if coalesce(current_setting('app.accion', true), '') = '' then
    perform set_config('app.accion', 'Generó cargos semanales', true);
  end if;

  insert into public.cargos (renta_id, tipo, fecha, periodo_inicio, periodo_fin, monto, concepto, creado_por)
  select r.id, 'renta', s.inicio, s.inicio, s.inicio + 6, r.tarifa_semanal,
         'Renta semana ' || ((s.inicio - r.fecha_inicio) / 7 + 1), auth.uid()
    from public.rentas r
   cross join lateral (select g::date as inicio from generate_series(r.fecha_inicio, p_hasta, interval '7 days') g) s
   where r.estado = 'activa' and (p_renta_id is null or r.id = p_renta_id)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ============================================================
-- Vistas de consulta (reglas derivadas; nada de saldos guardados "a mano").
-- security_invoker: respetan el RLS de quien consulta.
-- ============================================================

-- Saldo = cargos − pagos vigentes.
create view public.v_saldos_rentas with (security_invoker = true) as
select r.id as renta_id, r.vehiculo_id, r.conductor_id, r.estado,
       coalesce(c.cargado, 0)                          as cargado,
       coalesce(p.pagado, 0)                           as pagado,
       coalesce(c.cargado, 0) - coalesce(p.pagado, 0)  as saldo
  from public.rentas r
  left join (select renta_id, sum(monto) as cargado from public.cargos group by renta_id) c on c.renta_id = r.id
  left join (select renta_id, sum(monto) as pagado from public.pagos where cancelado_en is null group by renta_id) p on p.renta_id = r.id;

create view public.v_saldos_conductores with (security_invoker = true) as
select conductor_id, sum(cargado) as cargado, sum(pagado) as pagado, sum(saldo) as saldo
  from public.v_saldos_rentas group by conductor_id;

create view public.v_saldos_vehiculos with (security_invoker = true) as
select vehiculo_id, sum(cargado) as cargado, sum(pagado) as pagado, sum(saldo) as saldo
  from public.v_saldos_rentas group by vehiculo_id;

-- Alerta cada 10,000 km desde el último servicio que reinicia el contador (próximo a los 9,000).
create view public.v_mantenimiento with (security_invoker = true) as
select v.id as vehiculo_id, v.km_actual,
       u.id as ultimo_servicio_id, u.fecha as ultimo_servicio_fecha, u.km as ultimo_servicio_km,
       v.km_actual - coalesce(u.km, 0)          as km_desde_servicio,
       coalesce(u.km, 0) + 10000 - v.km_actual  as km_restantes,
       coalesce(u.km, 0) + 10000                as km_proximo_servicio,
       case when v.km_actual - coalesce(u.km, 0) >= 10000 then 'vencido'
            when v.km_actual - coalesce(u.km, 0) >= 9000  then 'proximo'
            else 'ok' end                       as nivel
  from public.vehiculos v
  left join lateral (
    select s.id, s.fecha, s.km from public.servicios s
     where s.vehiculo_id = v.id and s.reinicia_contador
     order by s.km desc limit 1
  ) u on true;

create view public.v_licencias with (security_invoker = true) as
select c.id as conductor_id, c.licencia_vence,
       c.licencia_vence - public.hoy_merida() as dias_para_vencer,
       case when c.licencia_vence is null then null
            when c.licencia_vence < public.hoy_merida() then 'vencida'
            when c.licencia_vence - public.hoy_merida() <= 30 then 'por_vencer'
            else 'ok' end as nivel
  from public.conductores c;

create view public.v_llantas_vigentes with (security_invoker = true) as
select * from public.llantas where retirada_en is null;
