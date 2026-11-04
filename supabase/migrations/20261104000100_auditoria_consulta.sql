-- Bitácora: columnas calculadas para filtrar desde la app sin traer toda la tabla.
--   · modulo: el módulo de la app al que pertenece cada movimiento (las claves de src/data/modules.ts).
--   · texto: el movimiento como texto plano para la búsqueda libre (placas, nombres, montos, ids…).
-- Son columnas generadas: las calcula la base al insertar, así que el trigger auditar() no cambia.
-- Agregarlas reescribe la tabla pero no dispara triggers, así que auditoria_inmutable no se queja.

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
      else 'otro'
    end
  ) stored,
  add column texto text generated always as (
    -- || y no concat_ws: concat_ws es STABLE y una columna generada exige funciones IMMUTABLE.
    coalesce(accion, '') || ' ' || registro_id || ' ' || coalesce(antes::text, '') || ' ' || coalesce(despues::text, '')
  ) stored;

create index auditoria_modulo_idx on public.auditoria (modulo, en desc);
