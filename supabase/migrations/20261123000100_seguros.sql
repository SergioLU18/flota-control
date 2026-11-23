-- Seguros (notas de la reunión del 22 nov 2026: "recordatorio de seguros" y "subir pólizas").
--   · Cada coche tiene sus pólizas: aseguradora, número, cobertura, vigencia, teléfono de siniestros y el PDF.
--     Al renovar se registra una póliza nueva; las anteriores quedan como historial. Nada se borra: una póliza
--     capturada por error se cancela con motivo.
--   · Los datos de la póliza los ve todo el personal (sirven para reportar un siniestro). Lo que costó va aparte,
--     como gasto de seguro (finanzas): al registrar la póliza, quien tiene finanzas.editar puede capturar el pago
--     en el mismo paso y el gasto queda ligado a la póliza.
--   · El aviso de vencimiento (30 días antes y ya vencida) lo calcula la app con la vigencia.
--   · Permiso nuevo flota.seguros. Lo reciben quienes ya editaban la flota (y las plantillas que la editan).

-- ============================================================
-- 1. Pólizas
-- ============================================================

create table public.polizas (
  id                  uuid primary key default gen_random_uuid(),
  vehiculo_id         uuid not null references public.vehiculos,
  aseguradora         text not null check (btrim(aseguradora) <> ''),
  numero              text not null check (btrim(numero) <> ''),
  cobertura           text not null default 'amplia' check (cobertura in ('amplia', 'limitada', 'rc', 'otra')),
  vigencia_inicio     date not null,
  vigencia_fin        date not null,
  telefono_siniestros text not null default '',
  notas               text not null default '',
  archivo_id          uuid references public.archivos, -- el PDF (o foto) de la póliza; se puede subir después
  registrado_por      uuid default auth.uid() references public.usuarios,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  cancelado_en        timestamptz,
  cancelado_por       uuid references public.usuarios,
  motivo_cancelacion  text,
  check (vigencia_fin > vigencia_inicio),
  check ((cancelado_en is null and cancelado_por is null and motivo_cancelacion is null)
      or (cancelado_en is not null and cancelado_por is not null and btrim(motivo_cancelacion) <> ''))
);
create index polizas_vehiculo_idx on public.polizas (vehiculo_id, vigencia_fin desc);
create index polizas_archivo_idx on public.polizas (archivo_id) where archivo_id is not null;

create trigger polizas_auditar after insert or update or delete on public.polizas
for each row execute function public.auditar();
create trigger polizas_actualizado_en before update on public.polizas
for each row execute function public.tocar_actualizado_en();

-- El gasto con el que se pagó (opcional).
alter table public.gastos add column poliza_id uuid references public.polizas;
create index gastos_poliza_idx on public.gastos (poliza_id) where poliza_id is not null;

-- ============================================================
-- 2. Permiso flota.seguros
-- ============================================================

insert into public.catalogo_permisos (orden, clave, modulo, nombre, requiere, descripcion) values
  (4, 'flota.seguros', 'flota', 'Seguros', '{flota.ver}',
   'Registrar, renovar y cancelar pólizas de seguro y subir su PDF');

update public.usuarios
   set permisos = public.normalizar_permisos(permisos || '{flota.seguros}')
 where rol = 'admin' and 'flota.editar' = any (permisos);
update public.plantillas_permisos
   set permisos = public.normalizar_permisos(permisos || '{flota.seguros}')
 where 'flota.editar' = any (permisos);
update public.plantillas_permisos
   set descripcion = 'Operación diaria: flota y seguros, conductores, rentas, cobranza, taller, incidentes e inspecciones.'
 where nombre = 'Operador';

-- ============================================================
-- 3. Lectura: todo el personal. Escritura: solo con las RPC de abajo.
-- ============================================================

select public.definir_acceso('polizas', null);

-- ============================================================
-- 4. RPC
-- ============================================================

-- Alta (p_id null) o edición de una póliza. p_datos: vehiculo_id, aseguradora, numero, cobertura, vigencia_inicio,
-- vigencia_fin, telefono_siniestros, notas, archivo_id (ya subido; en una edición sin archivo se conserva el que tenía).
-- p_gasto (solo en el alta, pide finanzas.editar): { monto, fecha, autorizo } → gasto de seguro ligado a la póliza.
create function public.guardar_poliza(p_id uuid, p_datos jsonb, p_gasto jsonb default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id     uuid := p_id;
  v_antes  public.polizas;
  v_poliza public.polizas;
begin
  perform public.exigir_permiso('flota.seguros');

  if p_id is null then
    perform set_config('app.accion', 'Registró póliza', true);
    insert into public.polizas (vehiculo_id, aseguradora, numero, cobertura, vigencia_inicio, vigencia_fin,
                                telefono_siniestros, notas, archivo_id)
    values ((p_datos ->> 'vehiculo_id')::uuid, btrim(p_datos ->> 'aseguradora'), btrim(p_datos ->> 'numero'),
            coalesce(p_datos ->> 'cobertura', 'amplia'), (p_datos ->> 'vigencia_inicio')::date, (p_datos ->> 'vigencia_fin')::date,
            btrim(coalesce(p_datos ->> 'telefono_siniestros', '')), coalesce(p_datos ->> 'notas', ''), (p_datos ->> 'archivo_id')::uuid)
    returning * into v_poliza;
    v_id := v_poliza.id;

    if p_gasto is not null then
      perform public.exigir_permiso('finanzas.editar');
      if coalesce((p_gasto ->> 'monto')::numeric, 0) <= 0 then
        raise exception 'El monto del seguro debe ser mayor a cero';
      end if;
      if btrim(coalesce(p_gasto ->> 'autorizo', '')) = '' then
        raise exception 'Escribe quién autorizó el gasto';
      end if;
      insert into public.gastos (fecha, categoria, vehiculo_id, monto, concepto, autorizo, poliza_id)
      values (coalesce((p_gasto ->> 'fecha')::date, v_poliza.vigencia_inicio), 'seguro', v_poliza.vehiculo_id,
              (p_gasto ->> 'monto')::numeric, 'Póliza ' || v_poliza.aseguradora || ' ' || v_poliza.numero,
              btrim(p_gasto ->> 'autorizo'), v_id);
    end if;
    return v_id;
  end if;

  select * into v_antes from public.polizas where id = p_id for update;
  if not found then
    raise exception 'Póliza no encontrada';
  end if;
  if v_antes.cancelado_en is not null then
    raise exception 'La póliza está cancelada: ya no se edita';
  end if;
  if p_gasto is not null then
    raise exception 'El pago de una póliza ya registrada se captura en Finanzas';
  end if;
  perform set_config('app.accion', 'Editó póliza', true);
  update public.polizas
     set aseguradora = btrim(p_datos ->> 'aseguradora'), numero = btrim(p_datos ->> 'numero'),
         cobertura = coalesce(p_datos ->> 'cobertura', cobertura),
         vigencia_inicio = (p_datos ->> 'vigencia_inicio')::date, vigencia_fin = (p_datos ->> 'vigencia_fin')::date,
         telefono_siniestros = btrim(coalesce(p_datos ->> 'telefono_siniestros', '')), notas = coalesce(p_datos ->> 'notas', ''),
         archivo_id = coalesce((p_datos ->> 'archivo_id')::uuid, archivo_id)
   where id = p_id;
  return p_id;
end $$;

-- No se borra: queda cancelada con motivo y deja de contar como seguro vigente. Su gasto (si tiene) no se toca.
create function public.cancelar_poliza(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_permiso('flota.seguros');
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo de la cancelación';
  end if;
  perform set_config('app.accion', 'Canceló póliza: ' || btrim(p_motivo), true);
  update public.polizas set cancelado_en = now(), cancelado_por = auth.uid(), motivo_cancelacion = btrim(p_motivo)
   where id = p_id and cancelado_en is null;
  if not found then
    raise exception 'La póliza no existe o ya está cancelada';
  end if;
end $$;

grant execute on function
  public.guardar_poliza(uuid, jsonb, jsonb),
  public.cancelar_poliza(uuid, text)
to authenticated;

-- ============================================================
-- 5. Bitácora: las pólizas van al módulo de flota
-- ============================================================

alter table public.auditoria drop column modulo;
alter table public.auditoria
  add column modulo text generated always as (
    case tabla
      when 'vehiculos' then 'flota'
      when 'polizas' then 'flota'
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
