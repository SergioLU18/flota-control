-- Permisos por módulo: lectura y escritura por módulo, plantillas y nada se borra.
--
--   · Roles: solo superadmin (todo, siempre) y admin (con la lista de permisos que se le configure). El antiguo
--     "operador" pasa a ser una plantilla: un admin con los permisos de la operación diaria.
--   · Cada permiso es "modulo.accion": ver, editar y algunas acciones especiales (flota.baja, rentas.tarifa…).
--     El catálogo vive en la tabla catalogo_permisos y es la única fuente: la app tiene la misma lista en
--     src/data/permissions.ts y `npm run db:test` falla si no coinciden.
--   · Un permiso trae los que requiere (editar → ver, cobranza.cancelar_pago → cobranza.editar → cobranza.ver):
--     la base los agrega sola al guardar (normalizar_permisos).
--   · Plantillas (plantillas_permisos): conjuntos de permisos con nombre que se aplican al dar de alta o editar
--     a alguien. Se copian al usuario; cambiar una plantilla no cambia a quienes ya la usaron.
--   · Lectura: los datos básicos (coches, conductores, usuarios, km, tipos de servicio, archivos y GPS) los lee
--     todo el personal activo; lo demás exige el "ver" de algún módulo que lo muestre (definir_acceso, abajo).
--     Las rentas básicas (qué coche tiene quién, fechas y km; sin tarifa ni depósito) llegan con rentas_basicas().
--   · Escritura: cada tabla y cada RPC exige su permiso. Nadie borra nada: se edita, se cancela o se desactiva
--     (los gastos se cancelan con motivo y las lecturas de km se corrigen con motivo).

-- ============================================================
-- 1. Catálogo
-- ============================================================

create table public.catalogo_permisos (
  clave       text primary key check (clave ~ '^[a-z_]+\.[a-z_]+$'),
  modulo      text not null,
  nombre      text not null,
  descripcion text not null default '',
  requiere    text[] not null default '{}',
  orden       smallint not null
);

insert into public.catalogo_permisos (orden, clave, modulo, nombre, requiere, descripcion) values
  ( 1, 'flota.ver',                 'flota',         'Ver',             '{}',                     'Lista de coches y su expediente con todo su historial'),
  ( 2, 'flota.editar',              'flota',         'Editar',          '{flota.ver}',            'Alta y edición de coches y mandarlos a taller'),
  ( 3, 'flota.baja',                'flota',         'Dar de baja',     '{flota.editar}',         'Dar de baja un coche de la flota o reactivarlo'),
  (10, 'conductores.ver',           'conductores',   'Ver',             '{}',                     'Expediente del conductor: contacto, licencia, documentos y referencias'),
  (11, 'conductores.editar',        'conductores',   'Editar',          '{conductores.ver}',      'Alta y edición de conductores y sus documentos'),
  (20, 'rentas.ver',                'rentas',        'Ver',             '{}',                     'Rentas activas e historial, con tarifa y depósito'),
  (21, 'rentas.editar',             'rentas',        'Editar',          '{rentas.ver}',           'Iniciar y finalizar rentas y resolver el depósito'),
  (22, 'rentas.tarifa',             'rentas',        'Cambiar tarifa',  '{rentas.editar}',        'Cambiar tarifa semanal y depósito de una renta activa'),
  (30, 'cobranza.ver',              'cobranza',      'Ver',             '{}',                     'Cargos, pagos y saldos por conductor, por coche y totales'),
  (31, 'cobranza.editar',           'cobranza',      'Editar',          '{cobranza.ver}',         'Registrar pagos, agregar cargos extra y generar las semanas de renta'),
  (32, 'cobranza.cancelar_pago',    'cobranza',      'Cancelar pagos',  '{cobranza.editar}',      'Cancelar un pago registrado, con motivo'),
  (33, 'cobranza.corregir',         'cobranza',      'Corregir cargos', '{cobranza.editar}',      'Corregir o cancelar un cargo, con motivo'),
  (40, 'mantenimiento.ver',         'mantenimiento', 'Ver',             '{}',                     'Servicios, llantas, lecturas de km y alertas de servicio'),
  (41, 'mantenimiento.editar',      'mantenimiento', 'Editar',          '{mantenimiento.ver}',    'Registrar servicios, cambios de llantas y lecturas de km'),
  (42, 'mantenimiento.catalogos',   'mantenimiento', 'Catálogos',       '{mantenimiento.editar}', 'Tipos de servicio de mantenimiento'),
  (43, 'mantenimiento.corregir_km', 'mantenimiento', 'Corregir km',     '{mantenimiento.editar}', 'Corregir una lectura de km mal capturada, con motivo'),
  (50, 'incidentes.ver',            'incidentes',    'Ver',             '{}',                     'Incidentes con su costo, responsable y fotos'),
  (51, 'incidentes.editar',         'incidentes',    'Editar',          '{incidentes.ver}',       'Registrar, editar, cerrar y reabrir incidentes y agregar fotos'),
  (60, 'inspecciones.ver',          'inspecciones',  'Ver',             '{}',                     'Inspecciones de entrega y recepción y su galería de fotos'),
  (61, 'inspecciones.editar',       'inspecciones',  'Editar',          '{inspecciones.ver}',     'Registrar inspecciones con fotos'),
  (70, 'finanzas.ver',              'finanzas',      'Ver',             '{}',                     'Estado de resultados, rentabilidad por coche, gastos y precio de compra'),
  (71, 'finanzas.editar',           'finanzas',      'Editar',          '{finanzas.ver}',         'Capturar, editar y cancelar gastos, y el precio de compra de los coches'),
  (80, 'orion.ver',                 'orion',         'Ver',             '{}',                     'Mapa de la flota, estado de cada equipo y km del GPS'),
  (90, 'bitacora.ver',              'bitacora',      'Ver',             '{}',                     'Quién hizo cada cambio y cuándo, con los valores de todos los módulos'),
  (95, 'usuarios.ver',              'usuarios',      'Ver',             '{}',                     'Lista de usuarios con sus permisos y las plantillas'),
  (96, 'usuarios.editar',           'usuarios',      'Editar',          '{usuarios.ver}',         'Dar de alta usuarios, cambiar sus permisos y contraseñas y editar plantillas');

-- Lo que requiere un permiso tiene que existir.
do $$
begin
  if exists (select 1 from public.catalogo_permisos c, unnest(c.requiere) r
              where not exists (select 1 from public.catalogo_permisos x where x.clave = r)) then
    raise exception 'catalogo_permisos: un permiso requiere otro que no existe';
  end if;
end $$;

-- Valida la lista (lanza si trae un permiso desconocido) y le agrega lo que requiere. Sin repetir y en el orden del
-- catálogo (el mismo de la app: flota.ver, flota.editar, …).
create function public.normalizar_permisos(p_permisos text[]) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  v_mal text;
begin
  select x into v_mal from unnest(coalesce(p_permisos, '{}')) x
   where not exists (select 1 from public.catalogo_permisos where clave = x) limit 1;
  if found then
    raise exception 'Permiso desconocido: %', v_mal;
  end if;
  return array(
    with recursive c(clave) as (
      select unnest(coalesce(p_permisos, '{}'))
      union
      select unnest(p.requiere) from c join public.catalogo_permisos p on p.clave = c.clave
    )
    select p.clave from public.catalogo_permisos p where p.clave in (select clave from c) order by p.orden);
end $$;

-- ¿Tiene al menos uno de esos permisos? Un superadmin los tiene todos. La usan las políticas de lectura.
create function public.tiene_alguno(p_permisos text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select activo and (rol = 'superadmin' or permisos && p_permisos)
                     from public.usuarios where id = auth.uid()), false)
$$;

-- ============================================================
-- 2. Plantillas
-- ============================================================

create table public.plantillas_permisos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null unique check (btrim(nombre) <> ''),
  descripcion    text not null default '',
  permisos       text[] not null default '{}',
  activa         boolean not null default true, -- una plantilla no se borra: se desactiva
  orden          smallint not null default 0,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create function public.plantillas_normalizar() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.permisos := public.normalizar_permisos(new.permisos);
  return new;
end $$;

create trigger plantillas_normalizar before insert or update of permisos on public.plantillas_permisos
for each row execute function public.plantillas_normalizar();
create trigger plantillas_permisos_auditar after insert or update or delete on public.plantillas_permisos
for each row execute function public.auditar();
create trigger plantillas_permisos_actualizado_en before update on public.plantillas_permisos
for each row execute function public.tocar_actualizado_en();

insert into public.plantillas_permisos (orden, nombre, descripcion, permisos) values
  (1, 'Operador', 'Operación diaria: flota, conductores, rentas, cobranza, taller, incidentes e inspecciones.',
   '{flota.editar,conductores.editar,rentas.editar,cobranza.editar,mantenimiento.editar,incidentes.editar,inspecciones.editar}'),
  (2, 'Consulta', 'Ve la operación diaria sin poder cambiar nada. Sin rentas, cobranza ni finanzas.',
   '{flota.ver,conductores.ver,mantenimiento.ver,incidentes.ver,inspecciones.ver}'),
  (3, 'Contabilidad', 'Finanzas, cobranza y rentas, y la bitácora para revisar movimientos.',
   '{finanzas.editar,cobranza.cancelar_pago,cobranza.corregir,rentas.ver,flota.ver,bitacora.ver}'),
  (4, 'Administrador', 'Todos los permisos.', array(select clave from public.catalogo_permisos));

-- Bitácora: los cambios de plantillas van al módulo de usuarios. modulo es una columna generada, así que se vuelve
-- a crear con la tabla nueva (reescribe la tabla sin disparar triggers: auditoria_inmutable no se queja).
alter table public.auditoria drop column modulo;
alter table public.auditoria
  add column modulo text generated always as (
    case tabla
      when 'vehiculos' then 'flota'
      when 'conductores' then 'conductores'
      when 'referencias_conductor' then 'conductores'
      when 'documentos_conductor' then 'conductores'
      when 'rentas' then 'rentas'
      when 'cargos' then 'cobranza'
      when 'pagos' then 'cobranza'
      when 'registros_km' then
        case when coalesce(despues, antes) ->> 'origen' = 'orion' then 'orion' else 'mantenimiento' end
      when 'servicios' then 'mantenimiento'
      when 'llantas' then 'mantenimiento'
      when 'tipos_servicio' then 'mantenimiento'
      when 'incidentes' then 'incidentes'
      when 'inspecciones' then 'inspecciones'
      -- En un cambio solo vienen los campos que cambiaron; sin incidente_id se asume inspección.
      when 'fotos' then
        case when coalesce(despues, antes) ->> 'incidente_id' is not null then 'incidentes' else 'inspecciones' end
      when 'gastos' then 'finanzas'
      when 'usuarios' then 'usuarios'
      when 'plantillas_permisos' then 'usuarios'
      else 'otro'
    end
  ) stored;
create index auditoria_modulo_idx on public.auditoria (modulo, en desc);

-- ============================================================
-- 3. Usuarios: dos roles y permisos nuevos
-- ============================================================

alter table public.usuarios drop constraint usuarios_permisos_check;
alter table public.usuarios drop constraint usuarios_rol_check;

-- Permisos viejos → nuevos. Todos los que no eran superadmin empiezan con la plantilla Operador (lo que la
-- operación diaria ya les dejaba hacer) más la traducción de sus permisos sueltos.
update public.usuarios u
   set rol = 'admin',
       permisos = public.normalizar_permisos(
         (select permisos from public.plantillas_permisos where nombre = 'Operador')
         || array(select m.nuevo from unnest(u.permisos) v(clave)
                    join (values ('finanzas', 'finanzas.editar'), ('orion', 'orion.ver'), ('auditoria', 'bitacora.ver'),
                                 ('editar_rentas', 'rentas.tarifa'), ('cancelar_pagos', 'cobranza.cancelar_pago'),
                                 ('bajas', 'flota.baja'), ('corregir_registros', 'cobranza.corregir'),
                                 ('corregir_registros', 'mantenimiento.corregir_km'), ('catalogos', 'mantenimiento.catalogos'),
                                 ('usuarios', 'usuarios.editar')) m(viejo, nuevo) on m.viejo = v.clave))
 where rol <> 'superadmin';

alter table public.usuarios add constraint usuarios_rol_check check (rol in ('superadmin', 'admin'));
alter table public.usuarios alter column rol set default 'admin';

-- Un superadmin no lleva lista; los demás quedan validados y con lo que requieren.
create function public.usuarios_normalizar() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.permisos := case when new.rol = 'superadmin' then '{}' else public.normalizar_permisos(new.permisos) end;
  return new;
end $$;

create trigger usuarios_normalizar before insert or update of rol, permisos on public.usuarios
for each row execute function public.usuarios_normalizar();

create or replace function public.validar_usuario(p_id uuid, p_rol text, p_permisos text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_yo   public.usuarios;
  v_otro public.usuarios;
begin
  perform public.exigir_permiso('usuarios.editar');
  select * into v_yo from public.usuarios where id = auth.uid();
  if p_id is not null then
    select * into v_otro from public.usuarios where id = p_id;
    if not found then
      raise exception 'Usuario no encontrado';
    end if;
  end if;
  if p_rol not in ('superadmin', 'admin') then
    raise exception 'Rol no válido: %', p_rol;
  end if;
  if v_yo.rol <> 'superadmin' then
    if v_otro.rol = 'superadmin' then
      raise exception 'Solo un superadmin puede modificar a otro superadmin' using errcode = '42501';
    end if;
    if p_rol = 'superadmin' then
      raise exception 'Solo un superadmin puede nombrar a otro superadmin' using errcode = '42501';
    end if;
    -- Lo que ya tenía se puede conservar o quitar; lo nuevo tiene que tenerlo quien lo otorga.
    if exists (select 1 from unnest(public.normalizar_permisos(p_permisos)) p
                where p <> all (coalesce(v_otro.permisos, '{}')) and p <> all (v_yo.permisos)) then
      raise exception 'No puedes otorgar permisos que tú no tienes' using errcode = '42501';
    end if;
  end if;
end $$;

create or replace function public.guardar_usuario(p_id uuid, p_nombre text, p_rol text, p_permisos text[], p_activo boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_otro     public.usuarios;
  v_permisos text[] := case when p_rol = 'superadmin' then '{}' else public.normalizar_permisos(p_permisos) end;
begin
  perform public.validar_usuario(p_id, p_rol, v_permisos);
  select * into v_otro from public.usuarios where id = p_id for update;
  if p_id = auth.uid() and (p_rol <> v_otro.rol or v_permisos is distinct from v_otro.permisos or not p_activo) then
    raise exception 'No puedes cambiar tu propio rol o permisos, ni desactivar tu cuenta';
  end if;
  perform set_config('app.accion', 'Editó usuario', true);
  update public.usuarios
     set nombre = btrim(p_nombre), rol = p_rol, permisos = v_permisos, activo = p_activo, actualizado_en = now()
   where id = p_id;
end $$;

-- Alta o edición de una plantilla. Mismas reglas que con un usuario: nadie pone en una plantilla un permiso que
-- no tiene (salvo los que la plantilla ya traía). Regresa el id.
create function public.guardar_plantilla(p_id uuid, p_nombre text, p_descripcion text, p_permisos text[], p_activa boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id       uuid := p_id;
  v_antes    text[] := '{}';
  v_yo       public.usuarios;
  v_permisos text[] := public.normalizar_permisos(p_permisos);
begin
  perform public.exigir_permiso('usuarios.editar');
  select * into v_yo from public.usuarios where id = auth.uid();
  if v_id is not null then
    select permisos into v_antes from public.plantillas_permisos where id = v_id for update;
    if not found then
      raise exception 'Plantilla no encontrada';
    end if;
  end if;
  if v_yo.rol <> 'superadmin' and exists (select 1 from unnest(v_permisos) p where p <> all (v_antes) and p <> all (v_yo.permisos)) then
    raise exception 'No puedes poner en una plantilla permisos que tú no tienes' using errcode = '42501';
  end if;
  if v_id is null then
    perform set_config('app.accion', 'Creó plantilla de permisos', true);
    insert into public.plantillas_permisos (nombre, descripcion, permisos, activa, orden)
    values (btrim(p_nombre), coalesce(btrim(p_descripcion), ''), v_permisos, coalesce(p_activa, true),
            coalesce((select max(orden) + 1 from public.plantillas_permisos), 1))
    returning id into v_id;
  else
    perform set_config('app.accion', 'Editó plantilla de permisos', true);
    update public.plantillas_permisos
       set nombre = btrim(p_nombre), descripcion = coalesce(btrim(p_descripcion), ''), permisos = v_permisos, activa = coalesce(p_activa, true)
     where id = v_id;
  end if;
  return v_id;
end $$;

-- ============================================================
-- 4. Nada se borra
-- ============================================================

-- Gastos: se cancelan con motivo (como pagos y cargos) y dejan de contar.
alter table public.gastos
  add column cancelado_en       timestamptz,
  add column cancelado_por      uuid references public.usuarios,
  add column motivo_cancelacion text,
  add constraint gastos_cancelacion_completa check (
       (cancelado_en is null and cancelado_por is null and motivo_cancelacion is null)
    or (cancelado_en is not null and cancelado_por is not null and btrim(motivo_cancelacion) <> ''));

create function public.gastos_validar_cambio() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.cancelado_en is not null then
    raise exception 'El gasto ya está cancelado';
  end if;
  return new;
end $$;

create trigger gastos_validar_cambio before update on public.gastos
for each row execute function public.gastos_validar_cambio();

create function public.cancelar_gasto(p_gasto_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_permiso('finanzas.editar');
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo de la cancelación';
  end if;
  perform set_config('app.accion', 'Canceló gasto', true);
  update public.gastos
     set cancelado_en = now(), cancelado_por = auth.uid(), motivo_cancelacion = btrim(p_motivo)
   where id = p_gasto_id and cancelado_en is null;
  if not found then
    raise exception 'El gasto no existe o ya está cancelado';
  end if;
end $$;

-- Lecturas de km: en lugar de borrar la errónea, se corrige su valor con motivo. El km del coche se recalcula
-- (registros_km_actualizar_vehiculo) y las reglas de consistencia aplican igual (registros_km_validar).
-- Las de entrega y recepción son parte de la renta y no se tocan.
create function public.corregir_km(p_registro_id uuid, p_km integer, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_permiso('mantenimiento.corregir_km');
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo de la corrección';
  end if;
  perform set_config('app.accion', 'Corrigió km: ' || btrim(p_motivo), true);
  update public.registros_km set km = p_km where id = p_registro_id and origen not in ('entrega', 'recepcion');
  if not found then
    raise exception 'La lectura no existe o es parte de una renta (entrega o recepción)';
  end if;
end $$;

-- Sin DELETE para nadie desde la app, ni en las tablas que se creen después.
revoke delete on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke delete on tables from anon, authenticated;

-- ============================================================
-- 5. Lectura y escritura por tabla
-- definir_acceso reemplaza todas las políticas de la tabla por las estándar:
--   · p_leer:      null = todo el personal activo; si no, basta uno de esos permisos.
--   · p_escribir:  permisos para insert/update (null = todo el personal activo); p_ops dice cuáles se abren.
--   · p_condicion: condición extra al capturar (registrar a nombre propio, etc.).
-- Para una tabla nueva basta una línea más en la lista de abajo.
-- ============================================================

create function public.definir_acceso(p_tabla text, p_leer text[], p_escribir text[] default null,
                                      p_ops text[] default '{}', p_condicion text default null) returns void
language plpgsql set search_path = '' as $$
declare
  v_pol  record;
  v_op   text;
  v_leer text := case when p_leer is null then '(select public.rol_actual()) is not null'
                      else format('(select public.tiene_alguno(%L::text[]))', p_leer) end;
  v_escr text := case when p_escribir is null then '(select public.rol_actual()) is not null'
                      else format('(select public.tiene_alguno(%L::text[]))', p_escribir) end;
begin
  if exists (select 1 from unnest(coalesce(p_leer, '{}') || coalesce(p_escribir, '{}')) p
              where not exists (select 1 from public.catalogo_permisos where clave = p)) then
    raise exception 'definir_acceso(%): permiso desconocido', p_tabla;
  end if;
  for v_pol in select policyname from pg_policies where schemaname = 'public' and tablename = p_tabla loop
    execute format('drop policy %I on public.%I', v_pol.policyname, p_tabla);
  end loop;
  execute format('alter table public.%I enable row level security', p_tabla);
  execute format('create policy "leer" on public.%I for select to authenticated using (%s)', p_tabla, v_leer);
  foreach v_op in array p_ops loop
    case v_op
      when 'insert' then
        execute format('create policy "capturar" on public.%I for insert to authenticated with check (%s%s)',
                       p_tabla, v_escr, coalesce(' and ' || p_condicion, ''));
      when 'update' then
        execute format('create policy "editar" on public.%I for update to authenticated using (%s)', p_tabla, v_escr);
      else
        raise exception 'definir_acceso(%): operación no válida %', p_tabla, v_op;
    end case;
  end loop;
end $$;

--                           tabla                     leer (basta uno)                               escribir                                    abre               condición al capturar
select public.definir_acceso('archivos',               null,                                          null,                                       '{insert,update}', 'subido_por = (select auth.uid())');
select public.definir_acceso('vehiculos',              null,                                          '{flota.editar}',                           '{insert,update}');
select public.definir_acceso('conductores',            null,                                          '{conductores.editar}',                     '{insert,update}');
select public.definir_acceso('referencias_conductor',  null,                                          '{conductores.editar}',                     '{insert,update}');
select public.definir_acceso('documentos_conductor',   null,                                          '{conductores.editar}',                     '{insert,update}', 'subido_por = (select auth.uid())');
select public.definir_acceso('tipos_servicio',         null,                                          '{mantenimiento.catalogos}',                '{insert,update}');
select public.definir_acceso('registros_km',           null,                                          '{mantenimiento.editar}',                   '{insert}',        'origen <> ''orion'' and registrado_por = (select auth.uid())');
select public.definir_acceso('gps_posiciones',         null);
select public.definir_acceso('catalogo_permisos',      null);
select public.definir_acceso('rentas',                 '{rentas.ver,cobranza.ver,finanzas.ver}');
select public.definir_acceso('cargos',                 '{cobranza.ver,finanzas.ver}',                 '{cobranza.editar}',                        '{insert}',        'tipo <> ''renta''');
select public.definir_acceso('pagos',                  '{cobranza.ver,finanzas.ver}',                 '{cobranza.editar}',                        '{insert}',        'registrado_por = (select auth.uid()) and cancelado_en is null');
select public.definir_acceso('servicios',              '{mantenimiento.ver,flota.ver,finanzas.ver}',  '{mantenimiento.editar}',                   '{insert,update}');
select public.definir_acceso('llantas',                '{mantenimiento.ver,flota.ver,finanzas.ver}',  '{mantenimiento.editar}',                   '{insert,update}');
select public.definir_acceso('incidentes',             '{incidentes.ver,flota.ver,finanzas.ver}',     '{incidentes.editar}',                      '{insert,update}');
select public.definir_acceso('inspecciones',           '{inspecciones.ver,flota.ver}',                '{inspecciones.editar}',                    '{insert,update}');
select public.definir_acceso('fotos',                  '{incidentes.ver,inspecciones.ver,flota.ver}', '{incidentes.editar,inspecciones.editar}',  '{insert}');
select public.definir_acceso('gastos',                 '{finanzas.ver}',                              '{finanzas.editar}',                        '{insert,update}');
select public.definir_acceso('orion_sincronizaciones', '{orion.ver}');
select public.definir_acceso('auditoria',              '{bitacora.ver}');
select public.definir_acceso('plantillas_permisos',    '{usuarios.ver}');

-- Usuarios: todo el personal ve los nombres (bitácora, quién registró) y cada quien su propio perfil aunque esté
-- inactivo. Se editan solo con guardar_usuario.
select public.definir_acceso('usuarios', null);
drop policy "leer" on public.usuarios;
create policy "leer" on public.usuarios for select to authenticated
  using ((select public.rol_actual()) is not null or id = (select auth.uid()));

revoke insert, update on public.catalogo_permisos, public.plantillas_permisos from anon, authenticated;

-- Qué coche tiene (o tuvo) quién, sin tarifa ni depósito: lo necesitan inspecciones, flota y conductores.
create function public.rentas_basicas()
returns table (id uuid, vehiculo_id uuid, conductor_id uuid, estado text, fecha_inicio date, fecha_fin date, km_entrega integer, km_devolucion integer)
language sql stable security definer set search_path = '' as $$
  select id, vehiculo_id, conductor_id, estado, fecha_inicio, fecha_fin, km_entrega, km_devolucion
    from public.rentas where public.rol_actual() is not null
$$;

-- ============================================================
-- 6. Cada RPC exige su permiso
-- Mismo cuerpo que en las migraciones anteriores; solo cambia el permiso que se revisa.
-- ============================================================

CREATE OR REPLACE FUNCTION public.agregar_fotos_incidente(p_incidente_id uuid, p_fotos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exigir_permiso('incidentes.editar');
  perform set_config('app.accion', 'Agregó fotos al incidente', true);
  perform public.insertar_fotos(
    (select jsonb_agg(f || jsonb_build_object('orden', coalesce((select max(orden) from public.fotos where incidente_id = p_incidente_id), -1) + o))
       from jsonb_array_elements(p_fotos) with ordinality as x(f, o)),
    null, p_incidente_id);
end $function$;

CREATE OR REPLACE FUNCTION public.registrar_incidente(p_id uuid, p_datos jsonb, p_fotos jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_vehiculo  uuid := (p_datos ->> 'vehiculo_id')::uuid;
  v_conductor uuid := (p_datos ->> 'conductor_id')::uuid;
begin
  perform public.exigir_permiso('incidentes.editar');
  if exists (select 1 from public.incidentes where id = p_id) then
    return p_id;
  end if;
  perform set_config('app.accion', 'Registró incidente', true);
  insert into public.incidentes (id, vehiculo_id, conductor_id, renta_id, fecha, tipo, descripcion, costo, responsable)
  values (p_id, v_vehiculo, v_conductor,
          (select id from public.rentas where vehiculo_id = v_vehiculo and conductor_id = v_conductor and estado = 'activa'),
          (p_datos ->> 'fecha')::date, p_datos ->> 'tipo', coalesce(p_datos ->> 'descripcion', ''),
          coalesce((p_datos ->> 'costo')::numeric, 0), p_datos ->> 'responsable');
  perform public.insertar_fotos(p_fotos, null, p_id);
  return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.registrar_inspeccion(p_id uuid, p_datos jsonb, p_fotos jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_vehiculo uuid := (p_datos ->> 'vehiculo_id')::uuid;
  v_renta    uuid := (p_datos ->> 'renta_id')::uuid;
  v_fecha    date := (p_datos ->> 'fecha')::date;
  v_km       integer := (p_datos ->> 'km')::integer;
begin
  perform public.exigir_permiso('inspecciones.editar');
  if exists (select 1 from public.inspecciones where id = p_id) then
    return p_id;
  end if;
  perform set_config('app.accion', 'Registró inspección', true);
  insert into public.inspecciones (id, vehiculo_id, renta_id, tipo, fecha, km, combustible, notas)
  values (p_id, v_vehiculo, v_renta, p_datos ->> 'tipo', v_fecha, v_km, (p_datos ->> 'combustible')::smallint, coalesce(p_datos ->> 'notas', ''));
  perform public.registrar_km_si_sube(v_vehiculo, v_fecha, v_km, p_datos ->> 'tipo', v_renta);
  perform public.insertar_fotos(p_fotos, p_id, null);
  return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.registrar_servicio(p_id uuid, p_datos jsonb, p_llantas jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_vehiculo uuid := (p_datos ->> 'vehiculo_id')::uuid;
  v_fecha    date := (p_datos ->> 'fecha')::date;
  v_km       integer := (p_datos ->> 'km')::integer;
  l          jsonb;
begin
  perform public.exigir_permiso('mantenimiento.editar');
  if exists (select 1 from public.servicios where id = p_id) then
    return p_id; -- reintento de algo que ya se guardó
  end if;
  perform set_config('app.accion', 'Registró servicio', true);
  insert into public.servicios (id, vehiculo_id, tipo_servicio_id, fecha, km, costo, taller, notas, reinicia_contador)
  values (p_id, v_vehiculo, (p_datos ->> 'tipo_servicio_id')::uuid, v_fecha, v_km, coalesce((p_datos ->> 'costo')::numeric, 0),
          coalesce(p_datos ->> 'taller', ''), coalesce(p_datos ->> 'notas', ''), coalesce((p_datos ->> 'reinicia_contador')::boolean, false));
  perform public.registrar_km_si_sube(v_vehiculo, v_fecha, v_km, 'manual');

  for l in select * from jsonb_array_elements(coalesce(p_llantas, '[]')) loop
    update public.llantas set retirada_en = v_fecha, km_retiro = v_km
     where vehiculo_id = v_vehiculo and posicion = l ->> 'posicion' and retirada_en is null;
    insert into public.llantas (vehiculo_id, posicion, marca, anio_dot, km_instalacion, fecha_instalacion, servicio_id)
    values (v_vehiculo, l ->> 'posicion', btrim(l ->> 'marca'), (l ->> 'anio_dot')::smallint, v_km, v_fecha, p_id);
  end loop;
  return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.guardar_conductor(p_id uuid, p_datos jsonb, p_referencias jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id;
begin
  perform public.exigir_permiso('conductores.editar');
  if v_id is null then
    perform set_config('app.accion', 'Dio de alta conductor', true);
    insert into public.conductores (nombre, telefono, correo, curp, domicilio, licencia_numero, licencia_vence, notas)
    values (p_datos ->> 'nombre', coalesce(p_datos ->> 'telefono', ''), p_datos ->> 'correo', p_datos ->> 'curp', coalesce(p_datos ->> 'domicilio', ''),
            p_datos ->> 'licencia_numero', (p_datos ->> 'licencia_vence')::date, coalesce(p_datos ->> 'notas', ''))
    returning id into v_id;
  else
    perform set_config('app.accion', 'Editó conductor', true);
    update public.conductores
       set nombre = p_datos ->> 'nombre', telefono = coalesce(p_datos ->> 'telefono', ''), correo = p_datos ->> 'correo', curp = p_datos ->> 'curp',
           domicilio = coalesce(p_datos ->> 'domicilio', ''), licencia_numero = p_datos ->> 'licencia_numero',
           licencia_vence = (p_datos ->> 'licencia_vence')::date, notas = coalesce(p_datos ->> 'notas', '')
     where id = v_id;
    if not found then
      raise exception 'Conductor no encontrado';
    end if;
    delete from public.referencias_conductor where conductor_id = v_id;
  end if;
  insert into public.referencias_conductor (conductor_id, nombre, parentesco, telefono, orden)
  select v_id, btrim(r ->> 'nombre'), coalesce(r ->> 'parentesco', ''), coalesce(r ->> 'telefono', ''), (o - 1)::smallint
    from jsonb_array_elements(coalesce(p_referencias, '[]')) with ordinality as x(r, o)
   where btrim(coalesce(r ->> 'nombre', '')) <> '';
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.guardar_vehiculo(p_id uuid, p_datos jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id     uuid := p_id;
  v_precio boolean := public.tiene_permiso('finanzas.editar');
begin
  perform public.exigir_permiso('flota.editar');
  if v_id is null then
    perform set_config('app.accion', 'Dio de alta coche', true);
    insert into public.vehiculos (unidad, marca, modelo, anio, placas, color, vin, estado, notas, precio_compra, fecha_compra, orion_equipo_id)
    values (p_datos ->> 'unidad', p_datos ->> 'marca', p_datos ->> 'modelo', (p_datos ->> 'anio')::smallint, p_datos ->> 'placas',
            coalesce(p_datos ->> 'color', ''), p_datos ->> 'vin', coalesce(p_datos ->> 'estado', 'disponible'), coalesce(p_datos ->> 'notas', ''),
            case when v_precio then (p_datos ->> 'precio_compra')::numeric end, (p_datos ->> 'fecha_compra')::date, p_datos ->> 'orion_equipo_id')
    returning id into v_id;
  else
    perform set_config('app.accion', 'Editó coche', true);
    update public.vehiculos
       set unidad = p_datos ->> 'unidad', marca = p_datos ->> 'marca', modelo = p_datos ->> 'modelo', anio = (p_datos ->> 'anio')::smallint,
           placas = p_datos ->> 'placas', color = coalesce(p_datos ->> 'color', ''), vin = p_datos ->> 'vin',
           estado = coalesce(p_datos ->> 'estado', estado), notas = coalesce(p_datos ->> 'notas', ''),
           precio_compra = case when v_precio then (p_datos ->> 'precio_compra')::numeric else precio_compra end,
           fecha_compra = (p_datos ->> 'fecha_compra')::date, orion_equipo_id = p_datos ->> 'orion_equipo_id'
     where id = v_id;
    if not found then
      raise exception 'Coche no encontrado';
    end if;
  end if;
  if (p_datos ->> 'km') is not null then
    perform public.registrar_km_si_sube(v_id, public.hoy_merida(), (p_datos ->> 'km')::integer, 'manual');
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.iniciar_renta(p_vehiculo_id uuid, p_conductor_id uuid, p_tarifa_semanal numeric, p_deposito numeric DEFAULT 0, p_fecha_inicio date DEFAULT hoy_merida(), p_km_entrega integer DEFAULT NULL::integer, p_notas text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_km integer;
  v_id uuid;
begin
  perform public.exigir_permiso('rentas.editar');
  perform set_config('app.accion', 'Inició renta', true);

  select km_actual into v_km from public.vehiculos where id = p_vehiculo_id for update;
  if not found then
    raise exception 'Vehículo no encontrado';
  end if;
  v_km := coalesce(p_km_entrega, v_km);

  insert into public.rentas (vehiculo_id, conductor_id, fecha_inicio, tarifa_semanal, deposito, km_entrega, notas)
  values (p_vehiculo_id, p_conductor_id, p_fecha_inicio, p_tarifa_semanal, p_deposito, v_km, coalesce(p_notas, ''))
  returning id into v_id;

  insert into public.registros_km (vehiculo_id, fecha, km, origen, renta_id)
  values (p_vehiculo_id, p_fecha_inicio, v_km, 'entrega', v_id);

  perform public.generar_cargos(public.hoy_merida(), v_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.finalizar_renta(p_renta_id uuid, p_km_devolucion integer, p_deposito_estado text, p_fecha_fin date DEFAULT hoy_merida())
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_vehiculo uuid;
begin
  perform public.exigir_permiso('rentas.editar');
  perform set_config('app.accion', 'Finalizó renta', true);

  select vehiculo_id into v_vehiculo from public.rentas where id = p_renta_id and estado = 'activa' for update;
  if not found then
    raise exception 'La renta no existe o ya está finalizada';
  end if;

  perform public.generar_cargos(p_fecha_fin - 1, p_renta_id);

  insert into public.registros_km (vehiculo_id, fecha, km, origen, renta_id)
  values (v_vehiculo, p_fecha_fin, p_km_devolucion, 'recepcion', p_renta_id);

  update public.rentas
     set estado = 'finalizada', fecha_fin = p_fecha_fin, km_devolucion = p_km_devolucion,
         deposito_estado = p_deposito_estado, finalizada_por = auth.uid()
   where id = p_renta_id;

  if p_deposito_estado = 'aplicado' then
    return public.aplicar_deposito(p_renta_id, p_fecha_fin);
  end if;
  return 0;
end $function$;

CREATE OR REPLACE FUNCTION public.resolver_deposito(p_renta_id uuid, p_estado text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exigir_permiso('rentas.editar');
  if p_estado not in ('devuelto', 'aplicado') then
    raise exception 'El depósito se devuelve o se aplica';
  end if;
  perform set_config('app.accion', case p_estado when 'aplicado' then 'Aplicó depósito' else 'Devolvió depósito' end, true);
  update public.rentas set deposito_estado = p_estado where id = p_renta_id and deposito_estado = 'retenido';
  if not found then
    raise exception 'La renta no existe o su depósito ya no está retenido';
  end if;
  if p_estado = 'aplicado' then
    return public.aplicar_deposito(p_renta_id, public.hoy_merida());
  end if;
  return 0;
end $function$;

CREATE OR REPLACE FUNCTION public.editar_renta(p_renta_id uuid, p_tarifa_semanal numeric, p_deposito numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exigir_permiso('rentas.tarifa');
  perform set_config('app.accion', 'Editó renta', true);
  update public.rentas set tarifa_semanal = p_tarifa_semanal, deposito = p_deposito where id = p_renta_id;
  if not found then
    raise exception 'Renta no encontrada';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.cancelar_pago(p_pago_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exigir_permiso('cobranza.cancelar_pago');
  perform set_config('app.accion', 'Canceló pago', true);
  update public.pagos
     set cancelado_en = now(), cancelado_por = auth.uid(), motivo_cancelacion = p_motivo
   where id = p_pago_id and cancelado_en is null;
  if not found then
    raise exception 'El pago no existe o ya está cancelado';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.corregir_cargo(p_cargo_id uuid, p_monto numeric, p_concepto text, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exigir_permiso('cobranza.corregir');
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo de la corrección';
  end if;
  perform set_config('app.accion', 'Corrigió cargo: ' || btrim(p_motivo), true);
  update public.cargos set monto = p_monto, concepto = btrim(p_concepto) where id = p_cargo_id and cancelado_en is null;
  if not found then
    raise exception 'El cargo no existe o está cancelado';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.cancelar_cargo(p_cargo_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exigir_permiso('cobranza.corregir');
  perform set_config('app.accion', 'Canceló cargo', true);
  update public.cargos
     set cancelado_en = now(), cancelado_por = auth.uid(), motivo_cancelacion = p_motivo
   where id = p_cargo_id and cancelado_en is null;
  if not found then
    raise exception 'El cargo no existe o ya está cancelado';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.precios_compra()
 RETURNS TABLE(vehiculo_id uuid, precio_compra numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select id, precio_compra from public.vehiculos where public.tiene_permiso('finanzas.ver')
$function$;

CREATE OR REPLACE FUNCTION public.vehiculos_validar_precio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is not null and not public.tiene_permiso('finanzas.editar')
     and new.precio_compra is distinct from (case when tg_op = 'UPDATE' then old.precio_compra end) then
    raise exception 'Solo quien tiene el permiso de finanzas captura el precio de compra';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.vehiculos_validar_estado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' and new.estado = 'rentado' then
    raise exception 'Un vehículo nuevo no puede darse de alta como rentado';
  end if;
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if 'baja' in (new.estado, old.estado) and auth.uid() is not null and not public.tiene_permiso('flota.baja') then
      raise exception 'No tienes permiso para dar de baja o reactivar un vehículo';
    end if;
    if new.estado = 'baja' and exists (select 1 from public.rentas where vehiculo_id = new.id and estado = 'activa') then
      raise exception 'Finaliza la renta antes de dar de baja el vehículo %', new.placas;
    end if;
    if (new.estado = 'rentado') <> exists (select 1 from public.rentas where vehiculo_id = new.id and estado = 'activa') then
      raise exception 'El estado "rentado" lo ponen y lo quitan las rentas (vehículo %)', new.placas;
    end if;
  end if;
  return new;
end $function$;

-- ============================================================
-- Privilegios de lo nuevo (definir_acceso queda solo para migraciones)
-- ============================================================

grant execute on function
  public.tiene_alguno(text[]),
  public.normalizar_permisos(text[]),
  public.guardar_plantilla(uuid, text, text, text[], boolean),
  public.cancelar_gasto(uuid, text),
  public.corregir_km(uuid, integer, text),
  public.rentas_basicas()
to authenticated;
