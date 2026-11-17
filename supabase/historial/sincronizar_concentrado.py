"""Pone la base al día con el concentrado más reciente (el Excel manda), sin volver a cargar todo.

    py supabase/historial/sincronizar_concentrado.py "C:/Users/.../Downloads/CONCENTRADO RENTA.xlsx"

Reusa el modelo de importar_concentrado.py (mismas reglas, mismos ids) y genera en supabase/historial/
(fuera de git, porque traen datos personales):
  sincronizacion_prueba.sql   hace todo y lo deshace al final; el error que regresa ES el resumen de lo que haría
  sincronizacion.sql          lo mismo, pero se guarda
  SINCRONIZACION.md           rentas según el Excel y saldo que debe quedar en cada una

Correr la prueba, revisar el resumen, correr la buena y volver a correr la prueba: debe salir todo en 0.
  npx supabase db query --linked -f supabase/historial/sincronizacion_prueba.sql

Qué hace, en una sola transacción (si algo truena no se guarda nada):
  · Coches y conductores nuevos (no borra ni cambia los que ya están).
  · Rentas: crea las que faltan, finaliza las que el Excel ya no tiene activas y actualiza la tarifa de las activas.
    Una renta capturada en la app (mismo coche y conductor, fechas que se traslapan) se reconoce y se usa esa.
  · Cargos semanales: cada semana rentada del Excel debe tener su cargo con el precio de esa semana (se busca el
    cargo cuyo periodo empiece a ±3 días, para las rentas de la app que no empiezan en lunes). Los cargos de
    semanas que el Excel no tiene rentadas (p. ej. los que generó la tarea nocturna después de un cambio de
    conductor) se CANCELAN con motivo; no se borran.
  · Pagos: uno por cada semana PAGADO que no esté registrada. Los pagos se cancelan, nunca se borran.
  · Saldo: al final cada renta debe quedar con el saldo del Excel (columna de deuda); la diferencia entra como
    ajuste, igual que en la carga inicial.
  · Kilometraje (lecturas que no estén; las que no cuadran se reportan) y servicios de las notas.
  · Coches que en la última semana están en "TALLER …" o "corralon" quedan en taller; los demás salen de taller.
"""
import json
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import importar_concentrado as m  # noqa: E402  (lee el Excel de sys.argv[1] al importarse)

AQUI = Path(__file__).resolve().parent


def js(o):
    if isinstance(o, Decimal):
        return str(o)
    if isinstance(o, date):
        return o.isoformat()
    raise TypeError(type(o))


doc = {
    'primera': m.SEMANAS[0], 'ultima': m.ULTIMA,
    'vehiculos': [
        {'id': v['id'], 'unidad': v['unidad_bd'], 'marca': v['marca'], 'modelo': v['modelo'], 'anio': v['anio'],
         'placas': v['placas'], 'color': v['color'], 'vin': v['vin'], 'notas': v['notas'], 'taller': v['taller'],
         'baja': v['placas'] in m.BAJA}
        for v in m.vehiculos.values()],
    'conductores': [{'id': c['id'], 'nombre': c['nombre']} for c in m.conductores.values()],
    'rentas': [
        {'id': r['id'], 'vehiculo_id': m.vehiculos[r['placas']]['id'], 'conductor_id': r['conductor']['id'],
         'etiqueta': f"{r['unidad']} · {r['conductor']['nombre']}", 'inicio': r['inicio'], 'fin': r['fin'],
         'activa': r['activa'], 'tarifa': r['tarifa'], 'deposito': r['deposito'], 'km_entrega': r['km_entrega'],
         'km_devolucion': r['km_devolucion'], 'notas': r['notas'], 'objetivo': r['objetivo'],
         'fecha_ajuste': r['fecha_ajuste'], 'danio': r['danio'],
         'semanas': [{'semana': c['semana'], 'monto': c['monto'], 'pagado': c['pagado'],
                      'n': (c['semana'] - r['inicio']).days // 7 + 1} for c in r['cargos']]}
        for r in m.rentas],
    'km': [{'vehiculo_id': m.vehiculos[p]['id'], 'etiqueta': m.vehiculos[p]['unidad'], 'fecha': s, 'km': k}
           for p in sorted(m.lecturas) for s, k in m.lecturas[p]],
    'servicios': [{'id': s['id'], 'vehiculo_id': m.vehiculos[s['placas']]['id'], 'tipo': s['tipo'], 'fecha': s['fecha'],
                   'km': s['km'], 'notas': s['notas']} for s in m.servicios],
}
DATOS = json.dumps(doc, default=js, ensure_ascii=False)
assert '$datos$' not in DATOS

# Contador del resumen: n('clave') suma 1.
def n(k):
    return f"c := c || jsonb_build_object('{k}', coalesce((c->>'{k}')::int, 0) + 1);"


def aviso(expr):
    return f'avisos := avisos || to_jsonb({expr});'


CUERPO = f"""
declare
  d jsonb := $datos${DATOS}$datos$::jsonb;
  v_min date := (d->>'primera')::date;
  v_max date := (d->>'ultima')::date;
  v_admin uuid;
  c jsonb := '{{}}';
  avisos jsonb := '[]';
  x jsonb; s jsonb;
  v_id uuid; v_estado text; v_inicio date; v_km_entrega integer; v_tarifa numeric;
  v_cid uuid; v_monto numeric; v_sem date; v_saldo numeric; v_dif numeric; v_nota text;
begin
  perform set_config('app.accion', 'Sincronizó con el concentrado al ' || to_char(v_max, 'DD/MM/YYYY'), true);
  select id into v_admin from public.usuarios where rol in ('superadmin', 'admin') and activo order by creado_en limit 1;
  if v_admin is null then
    raise exception 'Primero da de alta y activa un admin (ver supabase/README.md)';
  end if;

  -- 1. Coches y conductores nuevos.
  for x in select e.value from jsonb_array_elements(d->'vehiculos') e loop
    insert into public.vehiculos (id, unidad, marca, modelo, anio, placas, color, vin, notas, estado)
    values ((x->>'id')::uuid, x->>'unidad', x->>'marca', x->>'modelo', (x->>'anio')::int, x->>'placas', x->>'color',
            x->>'vin', x->>'notas', case when (x->>'baja')::boolean then 'baja' else 'disponible' end)
    on conflict (id) do nothing;
    if found then {n('coches_nuevos')} end if;
  end loop;
  for x in select e.value from jsonb_array_elements(d->'conductores') e loop
    insert into public.conductores (id, nombre, notas) values ((x->>'id')::uuid, x->>'nombre', 'Importado del concentrado de rentas.')
    on conflict (id) do nothing;
    if found then {n('conductores_nuevos')} end if;
  end loop;

  -- 2. Rentas: primero las que terminaron (liberan coche y conductor), luego las activas.
  for x in select e.value from jsonb_array_elements(d->'rentas') e
            order by (e.value->>'activa')::boolean, e.value->>'inicio' loop
    v_id := null;
    select id into v_id from public.rentas where id = (x->>'id')::uuid;
    if v_id is null then
      -- Capturada en la app: mismo coche y conductor, con fechas que se traslapan.
      select id into v_id from public.rentas
       where vehiculo_id = (x->>'vehiculo_id')::uuid and conductor_id = (x->>'conductor_id')::uuid
         and daterange(fecha_inicio, fecha_fin, '[)') && daterange((x->>'inicio')::date, (x->>'fin')::date, '[)')
       order by fecha_inicio limit 1;
      if v_id is not null then
        {n('rentas_de_la_app')}
        {aviso("'Se usó la renta capturada en la app para ' || (x->>'etiqueta')")}
      end if;
    end if;

    if v_id is null then
      if (x->>'activa')::boolean then
        update public.vehiculos set estado = 'disponible' where id = (x->>'vehiculo_id')::uuid and estado = 'taller';
      end if;
      begin
        insert into public.rentas (id, vehiculo_id, conductor_id, fecha_inicio, fecha_fin, tarifa_semanal, deposito,
                                   km_entrega, km_devolucion, estado, notas, finalizada_por)
        values ((x->>'id')::uuid, (x->>'vehiculo_id')::uuid, (x->>'conductor_id')::uuid, (x->>'inicio')::date,
                (x->>'fin')::date, (x->>'tarifa')::numeric, (x->>'deposito')::numeric, (x->>'km_entrega')::int,
                (x->>'km_devolucion')::int, case when (x->>'activa')::boolean then 'activa' else 'finalizada' end,
                x->>'notas', case when (x->>'activa')::boolean then null else v_admin end);
        v_id := (x->>'id')::uuid;
        {n('rentas_nuevas')}
      exception when others then
        {aviso("'No se pudo crear la renta ' || (x->>'etiqueta') || ': ' || sqlerrm")}
        continue;
      end;
    end if;

    select estado, fecha_inicio, km_entrega, tarifa_semanal into v_estado, v_inicio, v_km_entrega, v_tarifa
      from public.rentas where id = v_id;
    if v_estado = 'activa' and not (x->>'activa')::boolean then
      update public.rentas
         set estado = 'finalizada', fecha_fin = greatest((x->>'fin')::date, v_inicio),
             km_devolucion = greatest(v_km_entrega, coalesce((x->>'km_devolucion')::int, 0)), finalizada_por = v_admin
       where id = v_id;
      {n('rentas_finalizadas')}
    elsif v_estado = 'finalizada' and (x->>'activa')::boolean then
      {aviso("(x->>'etiqueta') || ': en la app está finalizada y el concentrado la tiene activa; revísala a mano'")}
    end if;
    if v_estado = 'activa' and (x->>'activa')::boolean and v_tarifa <> (x->>'tarifa')::numeric then
      update public.rentas set tarifa_semanal = (x->>'tarifa')::numeric where id = v_id;
      {n('tarifas_actualizadas')}
    end if;

    -- 3. Cargos: uno por semana rentada, con el precio de esa semana.
    for s in select e.value from jsonb_array_elements(x->'semanas') e loop
      v_sem := (s->>'semana')::date;
      v_cid := null;
      select id, monto into v_cid, v_monto from public.cargos
       where renta_id = v_id and tipo = 'renta' and cancelado_en is null and periodo_inicio between v_sem - 3 and v_sem + 3
       order by abs(periodo_inicio - v_sem) limit 1;
      if v_cid is not null then
        if v_monto <> (s->>'monto')::numeric then
          update public.cargos set monto = (s->>'monto')::numeric where id = v_cid;
          {n('cargos_corregidos')}
        end if;
      else
        begin
          insert into public.cargos (renta_id, tipo, fecha, periodo_inicio, periodo_fin, monto, concepto)
          values (v_id, 'renta', v_sem, v_sem, v_sem + 6, (s->>'monto')::numeric, 'Renta semana ' || ((v_sem - v_inicio) / 7 + 1));
          {n('cargos_nuevos')}
        exception when exclusion_violation then
          {aviso("(x->>'etiqueta') || ': la semana del ' || to_char(v_sem, 'DD/MM') || ' choca con un cargo cancelado; no se cobró'")}
        end;
      end if;
    end loop;
    -- Semanas cobradas que el Excel no tiene rentadas (dentro del periodo que cubre el Excel): se cancelan.
    for v_cid in
      select g.id from public.cargos g
       where g.renta_id = v_id and g.tipo = 'renta' and g.cancelado_en is null
         and g.periodo_inicio between v_min - 3 and v_max + 3
         and not exists (select 1 from jsonb_array_elements(x->'semanas') e
                          where g.periodo_inicio between (e.value->>'semana')::date - 3 and (e.value->>'semana')::date + 3)
    loop
      update public.cargos
         set cancelado_en = now(), cancelado_por = v_admin,
             motivo_cancelacion = 'Sincronización con el concentrado: esa semana no aparece rentada a este conductor'
       where id = v_cid;
      {n('cargos_cancelados')}
    end loop;
    if jsonb_typeof(x->'danio') = 'object' and not exists (
         select 1 from public.cargos where renta_id = v_id and tipo = 'danio' and cancelado_en is null
            and concepto = 'Reparación pendiente según concentrado') then
      insert into public.cargos (renta_id, tipo, fecha, monto, concepto)
      values (v_id, 'danio', (x->'danio'->>'semana')::date, (x->'danio'->>'monto')::numeric, 'Reparación pendiente según concentrado');
      {n('cargos_por_danio')}
    end if;

    -- 4. Pagos de las semanas PAGADO.
    for s in select e.value from jsonb_array_elements(x->'semanas') e where (e.value->>'pagado')::boolean loop
      v_sem := (s->>'semana')::date;
      if not exists (select 1 from public.pagos where renta_id = v_id and cancelado_en is null
                        and fecha between v_sem - 3 and v_sem + 3 and notas like '%marcada PAGADO en el concentrado%') then
        insert into public.pagos (renta_id, fecha, monto, metodo, notas, registrado_por)
        values (v_id, v_sem, (s->>'monto')::numeric, 'efectivo',
                'Semana ' || (s->>'n') || ' marcada PAGADO en el concentrado (método no registrado).', v_admin);
        {n('pagos_nuevos')}
      end if;
    end loop;
    for v_cid in
      select p.id from public.pagos p
       where p.renta_id = v_id and p.cancelado_en is null and p.notas like '%marcada PAGADO en el concentrado%'
         and not exists (select 1 from jsonb_array_elements(x->'semanas') e where (e.value->>'pagado')::boolean
                            and p.fecha between (e.value->>'semana')::date - 3 and (e.value->>'semana')::date + 3)
    loop
      update public.pagos set cancelado_en = now(), cancelado_por = v_admin,
             motivo_cancelacion = 'Sincronización con el concentrado: esa semana ya no aparece como PAGADO'
       where id = v_cid;
      {n('pagos_cancelados')}
    end loop;

    -- 5. Saldo final = el del Excel.
    v_saldo := (select coalesce(sum(monto), 0) from public.cargos where renta_id = v_id and cancelado_en is null)
             - (select coalesce(sum(monto), 0) from public.pagos where renta_id = v_id and cancelado_en is null);
    v_dif := v_saldo - (x->>'objetivo')::numeric;
    if v_dif > 0 then
      insert into public.pagos (renta_id, fecha, monto, metodo, notas, registrado_por)
      values (v_id, greatest((x->>'fecha_ajuste')::date, v_inicio), v_dif, 'efectivo',
              'Ajuste por sincronización con el concentrado al ' || to_char(v_max, 'DD/MM/YYYY') || ': abonos que no se detallan semana a semana.', v_admin);
      {n('ajustes_abono')}
    elsif v_dif < 0 then
      insert into public.cargos (renta_id, tipo, fecha, monto, concepto)
      values (v_id, 'otro', greatest((x->>'fecha_ajuste')::date, v_inicio), -v_dif,
              'Ajuste por sincronización con el concentrado: deuda anotada');
      {n('ajustes_cargo')}
    end if;
  end loop;

  -- 6. Taller según la última semana del Excel.
  for x in select e.value from jsonb_array_elements(d->'vehiculos') e loop
    if (x->>'taller')::boolean then
      update public.vehiculos set estado = 'taller' where id = (x->>'id')::uuid and estado = 'disponible';
      if found then {n('a_taller')} end if;
    else
      update public.vehiculos set estado = 'disponible' where id = (x->>'id')::uuid and estado = 'taller';
      if found then {n('salen_de_taller')} end if;
    end if;
  end loop;

  -- 7. Kilometraje y servicios.
  for x in select e.value from jsonb_array_elements(d->'km') e order by e.value->>'fecha' loop
    if not exists (select 1 from public.registros_km where vehiculo_id = (x->>'vehiculo_id')::uuid and fecha = (x->>'fecha')::date) then
      begin
        insert into public.registros_km (vehiculo_id, fecha, km, origen)
        values ((x->>'vehiculo_id')::uuid, (x->>'fecha')::date, (x->>'km')::int, 'manual');
        {n('lecturas_km')}
      exception when others then
        {aviso("(x->>'etiqueta') || ': no se guardó la lectura de ' || (x->>'km') || ' km del ' || to_char((x->>'fecha')::date, 'DD/MM') || ' (' || sqlerrm || ')'")}
        -- Choca con una lectura capturada en la app: no se corrige, se deja anotado en el coche para revisarlo.
        select fecha, km into v_sem, v_km_entrega from public.registros_km
         where vehiculo_id = (x->>'vehiculo_id')::uuid
           and ((fecha <= (x->>'fecha')::date and km > (x->>'km')::int) or (fecha > (x->>'fecha')::date and km < (x->>'km')::int))
         order by fecha limit 1;
        if v_sem is not null then
          v_nota := 'Revisar km (posible error de dedo): el concentrado dice ' || to_char((x->>'km')::int, 'FM999,999') || ' km el '
                    || to_char((x->>'fecha')::date, 'DD/MM/YYYY') || ' y en la app quedó ' || to_char(v_km_entrega, 'FM999,999')
                    || ' km el ' || to_char(v_sem, 'DD/MM/YYYY') || '.';
          update public.vehiculos set notas = btrim(notas || ' ' || v_nota)
           where id = (x->>'vehiculo_id')::uuid and strpos(notas, v_nota) = 0;
          if found then {n('notas_de_km')} end if;
        end if;
      end;
    end if;
  end loop;
  insert into public.servicios (id, vehiculo_id, tipo_servicio_id, fecha, km, notas, reinicia_contador)
  select (e.value->>'id')::uuid, (e.value->>'vehiculo_id')::uuid, t.id, (e.value->>'fecha')::date, (e.value->>'km')::int,
         e.value->>'notas', t.reinicia_contador
    from jsonb_array_elements(d->'servicios') e join public.tipos_servicio t on t.nombre = e.value->>'tipo'
  on conflict (id) do nothing;
  get diagnostics v_dif = row_count;
  if v_dif > 0 then c := c || jsonb_build_object('servicios_nuevos', v_dif); end if;

  c := c || jsonb_build_object('avisos', avisos);
"""

ENCABEZADO = f"""-- Sincronización con "{m.EXCEL.name}" ({m.SEMANAS[0]} a {m.ULTIMA}).
-- Generado por supabase/historial/sincronizar_concentrado.py: no editar a mano, volver a generarlo.
-- Un solo bloque: si algo falla no se guarda nada. Se puede correr otra vez: lo que ya está no se repite.
"""

(AQUI / 'sincronizacion_prueba.sql').write_text(
    ENCABEZADO + '-- PRUEBA: hace todo y lo deshace. El error que regresa es el resumen de lo que haría.\ndo $$' + CUERPO +
    "  raise exception 'PRUEBA, no se guardó nada. Resumen: %', c::text;\nend $$;\n", encoding='utf-8')
(AQUI / 'sincronizacion.sql').write_text(
    ENCABEZADO + 'do $$' + CUERPO + "  raise notice 'Sincronización: %', c::text;\nend $$;\n", encoding='utf-8')

# Reporte: lo que dice el Excel (lo que hizo la base lo dice el resumen de la prueba).
pesos = lambda x: f'${x:,.2f}'
R = [f'# Sincronización con el concentrado', '',
     f'Fuente: `{m.EXCEL.name}`, {len(m.SEMANAS)} semanas ({m.SEMANAS[0]:%d/%m/%Y} a {m.ULTIMA:%d/%m/%Y}).', '',
     '## Rentas activas según el Excel', '', '| Unidad | Conductor | Desde | Tarifa | Saldo que debe quedar |', '|---|---|---|---|---|']
for r in sorted((r for r in m.rentas if r['activa']), key=lambda r: int(r['unidad'][2:])):
    R.append(f"| {r['unidad']} | {r['conductor']['nombre']} | {r['inicio']:%d/%m} | {pesos(r['tarifa'])} | {pesos(r['objetivo'])} |")
R += ['', '## Coches en taller (última semana)', '']
R += [f"- {v['unidad']} ({v['placas']})" for v in m.vehiculos.values() if v['taller']] or ['- Ninguno']
R += ['', '## Avisos del Excel', ''] + [f'- {a}' for a in m.avisos]
(AQUI / 'SINCRONIZACION.md').write_text('\n'.join(R) + '\n', encoding='utf-8')

print(f"{len(doc['vehiculos'])} coches, {len(doc['rentas'])} rentas ({sum(r['activa'] for r in m.rentas)} activas) "
      f"en el Excel; generados sincronizacion_prueba.sql, sincronizacion.sql y SINCRONIZACION.md")
