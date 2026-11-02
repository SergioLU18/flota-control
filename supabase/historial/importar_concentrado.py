"""Convierte "CONCENTRADO RENTA.xlsx" (una hoja por semana) en la carga inicial del historial.

    py supabase/historial/importar_concentrado.py ["CONCENTRADO RENTA.xlsx"]

Genera en supabase/historial/ (fuera de git, porque traen datos personales):
  concentrado.sql   carga en una sola transacción: vehículos, conductores, rentas, cargos, pagos, km y servicios
  REPORTE.md        qué se importó, cómo se interpretó y qué conviene revisar a mano
  esperado.json     saldos y estados que debe dar la base; lo verifica probar.mjs

Cómo se lee el Excel
  · Cada hoja es una semana que empieza en lunes. La fila es un coche (C-1, C-2…), identificado por sus placas.
  · Una semana cuenta como rentada si tiene conductor y dice PAGADO o NO PAGADO. DESOCUPADO o vacío, no.
  · Una renta = semanas seguidas del mismo conductor en el mismo coche. Si el coche vuelve a quedar con
    otro conductor (o vacío), la renta se finaliza el lunes siguiente a su última semana.
  · Cargos: uno por semana rentada con el precio de esa hoja. C-12 paga mensual: se usa el equivalente
    semanal (mensual × 12 ÷ 52).
  · Pagos: uno por cada semana PAGADO. Después, un ajuste por renta para que el saldo final sea el de la
    columna "Deuda semanas anteriores" de su última semana (+ esa semana si no la pagó). Las reparaciones
    pendientes se cargan como daño al conductor.
  · Kilometraje: se descartan lecturas que retroceden o que implican más de 2,500 km por semana.
"""
import json
import re
import sys
import unicodedata
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import openpyxl

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
EXCEL = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / 'CONCENTRADO RENTA.xlsx'
NS = uuid.UUID('6f1c2a52-6c55-4d0a-9a39-2f3b8c1d0e77')  # ids estables: regenerar da los mismos uuid

KM_MAX_SEMANA = 2500
ORIGEN = 'Importado del concentrado de rentas.'

# Mismo conductor escrito de dos formas (C-18, semanas seguidas).
ALIAS = {'JOSE AREVAR': 'JOSE RENE ARENAL AYVAR'}
NO_ES_CONDUCTOR = {'PENDIENTE DE ENTREGA', 'BLANCO'}
# Coches que cubrieron una unidad de forma temporal: no se quedan con ella (la C-25 es del Kia YWX 006 J).
UNIDAD_TEMPORAL = {'ZBE 026 G': 'Cubrió la unidad C-25 unas semanas.'}
# Coches que ya salieron de la flota: se cargan dados de baja.
BAJA = {'ZBE 026 G'}

# Notas de mantenimiento → tipo de servicio del catálogo (migración 0200).
SERVICIOS = [
    (re.compile(r'servicio de [\d,]+ ?km realizado', re.I), 'Servicio 10,000 km', lambda t: t.strip().capitalize()),
    (re.compile(r'cambio de frenos y bateria realizado', re.I), 'Frenos / balatas', lambda t: 'Frenos y batería'),
    (re.compile(r'cambio de frenos realizado', re.I), 'Frenos / balatas', lambda t: 'Cambio de frenos'),
    (re.compile(r'taller clutch y frenos', re.I), 'Frenos / balatas', lambda t: 'Clutch y frenos (en taller); costo no registrado'),
]


# ------------------------------------------------------------
# Utilidades
# ------------------------------------------------------------

def sin_acentos(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def limpio(v):
    if v is None:
        return None
    s = re.sub(r'\s+', ' ', str(v)).strip()
    return s or None


def clave(nombre):
    return sin_acentos(nombre).upper()


def titulo(s):
    menores = {'de', 'del', 'la', 'las', 'los', 'y'}
    palabras = s.lower().split(' ')
    return ' '.join(p if i and p in menores else p[:1].upper() + p[1:] for i, p in enumerate(palabras))


def dinero(x):
    return Decimal(x).quantize(Decimal('0.01'), ROUND_HALF_UP)


def monto(texto):
    """Primer importe de una nota: '$7403 PENDIENTE' → 7403, 'debe 6,700 paga el 28/7/26' → 6700."""
    if isinstance(texto, (int, float)):
        return dinero(texto)
    texto = re.sub(r'\d+/\d+/\d+|\d+-\d+-\d+|\d+ d[ií]as?\b', '', texto)  # fechas y "2 días" no son importes
    m = re.search(r'\$?\s*(\d{1,3}(?:,\d{3})+|\d+)', texto)
    return dinero(m.group(1).replace(',', '')) if m else None


def deposito(v):
    if v is None:
        return None
    n = float(str(v).replace(',', ''))
    return dinero(n * 1000 if n < 100 else n)  # el Excel lo escribe en miles: 3.5 = $3,500


def uid(*partes):
    return str(uuid.uuid5(NS, '|'.join(map(str, partes))))


def sql(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, Decimal)):
        return str(v)
    if isinstance(v, date):
        return f"'{v.isoformat()}'"
    return "'" + str(v).replace("'", "''") + "'"


def lunes(nombre_hoja):
    d = datetime.strptime(nombre_hoja.strip(), '%d %m %y').date()
    return d - timedelta(days=d.weekday())


# ------------------------------------------------------------
# Lectura
# ------------------------------------------------------------

wb = openpyxl.load_workbook(EXCEL, data_only=True)
hojas = [ws for ws in wb.worksheets if re.fullmatch(r'\d\d \d\d \d\d', ws.title.strip())]
SEMANAS = sorted(lunes(ws.title) for ws in hojas)
ULTIMA = SEMANAS[-1]

filas = []  # una por coche y semana
escrito = {}  # clave del conductor → cómo se escribe (la versión con más acentos)
avisos = []
for ws in hojas:
    sem = lunes(ws.title)
    for r in ws.iter_rows(min_row=2, values_only=True):
        r = list(r) + [None] * 20
        placas = limpio(r[5])
        if not placas:
            continue
        conductor = limpio(r[3])
        if conductor and clave(conductor) in NO_ES_CONDUCTOR:
            conductor = None
        if conductor:
            k = ALIAS.get(clave(conductor), clave(conductor))
            if k not in escrito or len(conductor.encode()) > len(escrito[k].encode()):
                escrito[k] = conductor
            conductor = k
        estado = limpio(r[12])
        filas.append({
            'semana': sem, 'unidad': limpio(r[0]), 'vehiculo': limpio(r[1]), 'color': limpio(r[2]),
            'conductor': conductor, 'vin': limpio(r[4]), 'placas': placas.upper(),
            'km': int(r[6]) if isinstance(r[6], (int, float)) else None, 'deposito': deposito(r[7]),
            'multa': (limpio(r[8]) or '').upper() == 'MULTA', 'tipo_pago': (limpio(r[10]) or '').upper(),
            'precio': dinero(r[11]) if isinstance(r[11], (int, float)) else None, 'estado': estado,
            'rentada': bool(conductor) and estado in ('PAGADO', 'NO PAGADO'),
            'deuda': r[14], 'notas': [limpio(x) for x in (r[14], r[16]) if limpio(x)],
        })

por_placas = defaultdict(dict)
for f in filas:
    por_placas[f['placas']][f['semana']] = f

# Coches que aparecen sin ninguna semana rentada ni datos (p. ej. ZBE 026 G, una sola vez y desocupado).
for placas, semanas in list(por_placas.items()):
    if not any(f['rentada'] for f in semanas.values()) and not any(f['vehiculo'] for f in semanas.values()):
        f = next(iter(semanas.values()))
        avisos.append(f"Se omitió el coche {placas} ({f['unidad']}, semana {f['semana']}): sin modelo ni semanas rentadas.")
        del por_placas[placas]

# ------------------------------------------------------------
# Vehículos
# ------------------------------------------------------------

def ultimo(semanas, campo):
    for s in sorted(semanas, reverse=True):
        if semanas[s][campo]:
            return semanas[s][campo]
    return None


vehiculos = {}
for placas, semanas in por_placas.items():
    desc = ultimo(semanas, 'vehiculo')
    m = re.fullmatch(r'(\w+) (.+?) (\d{4})(?: \((\w+)\))?', desc)
    marca, modelo, anio, trans = m.group(1), m.group(2), int(m.group(3)), m.group(4)
    color = ultimo(semanas, 'color') or ''
    color = color.upper().replace('OBSCURO', 'OSCURO').capitalize()
    vin = ultimo(semanas, 'vin')
    if vin and len(vin) != 17:
        avisos.append(f'El VIN de {placas} ({vin}) tiene {len(vin)} caracteres; se guardó tal cual.')
    unidad = ultimo(semanas, 'unidad')
    notas = f"Transmisión {'automática' if trans.startswith('AUTO') else 'estándar'}." if trans else ''
    vehiculos[placas] = {
        'id': uid('vehiculo', placas), 'unidad': unidad, 'marca': marca.capitalize(),
        'modelo': modelo.title() if not re.search(r'\d', modelo) else modelo.upper(), 'anio': anio,
        'placas': placas, 'color': color, 'vin': vin, 'notas': notas,
    }

# Una unidad repetida no se le asigna a ninguno de sus coches: queda en las notas para resolverla a mano.
por_unidad = defaultdict(list)
for v in vehiculos.values():
    if v['placas'] in UNIDAD_TEMPORAL:
        v['unidad_bd'] = None
        v['notas'] = f"{UNIDAD_TEMPORAL[v['placas']]} {v['notas']}".strip()
        continue
    por_unidad[v['unidad']].append(v)
for u, vs in por_unidad.items():
    for v in vs:
        v['unidad_bd'] = u if len(vs) == 1 else None
        if len(vs) > 1:
            v['notas'] = f"Unidad {u}. {v['notas']}".strip()
    if len(vs) > 1:
        avisos.append(f"La unidad {u} aparece en {len(vs)} coches ({', '.join(v['placas'] for v in vs)}); se dejaron sin unidad.")

# ------------------------------------------------------------
# Kilometraje: la cadena más larga de lecturas que no retroceden ni saltan de más
# ------------------------------------------------------------

lecturas = {}
for placas, semanas in por_placas.items():
    pts = sorted((s, f['km']) for s, f in semanas.items() if f['km'] is not None)
    mejor = [(1, 0)] * len(pts)  # (lecturas en la cadena, −mayor km/semana): en empate gana la más pareja
    prev = [-1] * len(pts)
    for j in range(len(pts)):
        for i in range(j):
            ritmo = (pts[j][1] - pts[i][1]) / ((pts[j][0] - pts[i][0]).days / 7)
            cand = (mejor[i][0] + 1, max(-mejor[i][1], ritmo) * -1)
            if pts[i][1] <= pts[j][1] and ritmo <= KM_MAX_SEMANA and cand > mejor[j]:
                mejor[j], prev[j] = cand, i
    cadena = []
    j = max(range(len(pts)), key=lambda k: (mejor[k], k)) if pts else -1
    while j >= 0:
        cadena.append(pts[j])
        j = prev[j]
    cadena.reverse()
    for p in pts:
        if p not in cadena:
            avisos.append(f'Se descartó la lectura de {p[1]:,} km de {placas} ({vehiculos[placas]["unidad"]}) del {p[0]}: no cuadra con las demás.')
    lecturas[placas] = cadena


def km_en(placas, dia, antes=True):
    """Lectura más cercana a `dia`: la última hasta ese día (o la primera después, si no hay)."""
    pts = lecturas[placas]
    previas = [k for s, k in pts if s <= dia]
    if antes and previas:
        return previas[-1]
    siguientes = [k for s, k in pts if s >= dia]
    return siguientes[0] if siguientes else (previas[-1] if previas else 0)


# ------------------------------------------------------------
# Rentas
# ------------------------------------------------------------

conductores = {}  # clave → registro


def conductor(nombre):
    if nombre not in conductores:
        conductores[nombre] = {'id': uid('conductor', nombre), 'nombre': titulo(escrito[nombre])}
    return conductores[nombre]


def deuda_nota(f):
    """'Deuda semanas anteriores' de la fila (columna O). Las reparaciones, depósitos y avisos no cuentan."""
    t = f['deuda']
    if t is None:
        return Decimal(0)
    if isinstance(t, (int, float)):
        return dinero(t)
    if re.search(r'reparaci|deposito|servicio|mantenimiento|realiza|saldo a favor|mando', sin_acentos(t), re.I):
        return Decimal(0)
    return monto(t) or Decimal(0)


def reparacion(f):
    for t in f['notas']:
        if re.search(r'reparaci', sin_acentos(t), re.I):
            return monto(t)
    return None


rentas = []
for placas, semanas in por_placas.items():
    orden = sorted(semanas)
    tramos = []  # [conductor, [semanas rentadas], [semanas después en que sigue anotado aunque desocupado]]
    for s in orden:
        f = semanas[s]
        if f['rentada']:
            if tramos and tramos[-1][0] == f['conductor'] and not tramos[-1][2] and tramos[-1][1][-1] == s - timedelta(7):
                tramos[-1][1].append(s)
            else:
                tramos.append([f['conductor'], [s], []])
        elif f['conductor'] and tramos and tramos[-1][0] == f['conductor']:
            tramos[-1][2].append(s)  # devolvió el coche pero sigue en la hoja (normalmente con su deuda)
        elif f['conductor']:
            conductor(f['conductor'])  # anotado pero sin renta (p. ej. por entregar)

    acumulado = defaultdict(Decimal)  # deuda ya repartida entre rentas anteriores del mismo conductor en este coche
    for nombre, sems, despues in tramos:
        c = conductor(nombre)
        ult = semanas[sems[-1]]
        activa = sems[-1] == ULTIMA
        precios = [semanas[s]['precio'] for s in sems]
        conocidos = [p for p in precios if p]
        mensual = any(semanas[s]['tipo_pago'] == 'MENSUAL' for s in sems)
        cargos = []
        for i, s in enumerate(sems):
            p = precios[i] or next((q for q in precios[i:] if q), conocidos[-1] if conocidos else None)
            if p is None:
                raise SystemExit(f'Sin precio para {placas} en {s}')
            if mensual:
                p = dinero(p * 12 / 52)
            cargos.append({'semana': s, 'monto': p, 'pagado': semanas[s]['estado'] == 'PAGADO'})

        # Saldo que el Excel dice que quedó: deuda anotada en la última fila (+ esa semana si no la pagó).
        if despues:
            f_fin = semanas[despues[-1]]
            objetivo_total = deuda_nota(f_fin)
        else:
            objetivo_total = deuda_nota(ult) + (cargos[-1]['monto'] if not cargos[-1]['pagado'] else 0)
        objetivo = objetivo_total - acumulado[nombre]
        if objetivo < 0:
            avisos.append(f'La deuda de {c["nombre"]} en {placas} bajó entre rentas; se dejó en 0.')
            objetivo = Decimal(0)
        acumulado[nombre] += objetivo

        # Reparación pendiente: primer monto anotado = cargo por daño; lo que baje después ya es abono.
        danio = None
        for s in sems + despues:
            m = reparacion(semanas[s])
            if m:
                danio = {'semana': s, 'monto': m}
                break
        rep_final = next((reparacion(semanas[s]) for s in reversed(sems + despues) if reparacion(semanas[s])), None)
        if danio:
            objetivo += rep_final

        fin = None
        if not activa:
            fin = sems[-1] + timedelta(7)
            for t in ult['notas']:
                m = re.search(r'devoluci\w* de la unidad (\d+)/(\d+)/(\d+)', sin_acentos(t), re.I)
                if m:
                    fin = date(2000 + int(m.group(3)), int(m.group(2)), int(m.group(1)))
        km_entrega = km_en(placas, sems[0])
        km_dev = None if activa else max(km_entrega, km_en(placas, fin - timedelta(1)))

        notas = [ORIGEN]
        if sems[0] == SEMANAS[0]:
            notas.append(f'Ya estaba rentado al iniciar el concentrado ({SEMANAS[0]:%d/%m/%Y}); la fecha real de inicio no se registró.')
        if mensual:
            notas.append(f'Paga ${conocidos[-1]:,.0f} al mes; aquí se cobra el equivalente semanal (× 12 ÷ 52).')
        if any(semanas[s]['multa'] for s in sems):
            notas.append('El concentrado marca MULTA, sin monto ni detalle.')
        notas_excel = []
        for s in sems + despues:
            for t in semanas[s]['notas']:
                if t not in notas_excel and not monto(t) and not re.search(r'realiza', t, re.I):
                    notas_excel.append(t)
        if notas_excel:
            notas.append('Notas del concentrado: ' + '; '.join(notas_excel) + '.')

        deps = [semanas[s]['deposito'] for s in sems if semanas[s]['deposito']]
        rentas.append({
            'id': uid('renta', placas, nombre, sems[0]), 'placas': placas, 'unidad': vehiculos[placas]['unidad'],
            'conductor': c, 'inicio': sems[0], 'fin': fin, 'activa': activa,
            'tarifa': cargos[-1]['monto'], 'deposito': deps[0] if deps else Decimal(0),
            'km_entrega': km_entrega, 'km_devolucion': km_dev, 'cargos': cargos, 'danio': danio,
            'objetivo': objetivo, 'notas': ' '.join(notas),
        })

# Pagos semanales y ajuste final.
for r in rentas:
    cargado = sum(c['monto'] for c in r['cargos']) + (r['danio']['monto'] if r['danio'] else 0)
    pagado = sum(c['monto'] for c in r['cargos'] if c['pagado'])
    r['saldo_semanas'] = cargado - pagado
    r['ajuste'] = r['saldo_semanas'] - r['objetivo']  # > 0: abonos no anotados; < 0: deuda que no sale de las semanas
    r['fecha_ajuste'] = (r['fin'] - timedelta(1)) if r['fin'] else ULTIMA
    r['fecha_ajuste'] = max(r['fecha_ajuste'], r['inicio'])

# ------------------------------------------------------------
# Servicios
# ------------------------------------------------------------

servicios = []
for placas, semanas in por_placas.items():
    vistos = set()
    for s in sorted(semanas):
        for t in semanas[s]['notas']:
            for patron, tipo, nota in SERVICIOS:
                if patron.search(t) and t.upper() not in vistos:
                    vistos.add(t.upper())  # la nota se arrastra a las semanas siguientes: solo cuenta la primera
                    servicios.append({'id': uid('servicio', placas, s, t.upper()), 'placas': placas, 'tipo': tipo,
                                      'fecha': s, 'km': km_en(placas, s), 'notas': f'{nota(t)}. {ORIGEN}'})
                    break

# ------------------------------------------------------------
# SQL
# ------------------------------------------------------------

L = []
w = L.append
w(f'-- Historial importado de "{EXCEL.name}" ({SEMANAS[0]} a {ULTIMA}).')
w('-- Generado por supabase/historial/importar_concentrado.py: no editar a mano, volver a generarlo.')
w('-- Requiere un admin activo (los pagos quedan registrados a su nombre) y una base sin estos coches.')
w('-- Todo va en un solo bloque: el SQL Editor de Supabase no respeta begin/commit y guardaría la carga a medias.')
w('do $$ begin')
w("perform set_config('app.accion', 'Importó historial del concentrado', true);")
w("""if not exists (select 1 from public.usuarios where rol = 'admin' and activo) then
  raise exception 'Primero da de alta y activa un admin (ver supabase/README.md)';
end if;""")
w('')
w('insert into public.vehiculos (id, unidad, marca, modelo, anio, placas, color, vin, notas, estado) values')
w(',\n'.join(f"  ({sql(v['id'])}, {sql(v['unidad_bd'])}, {sql(v['marca'])}, {sql(v['modelo'])}, {v['anio']}, {sql(v['placas'])}, {sql(v['color'])}, {sql(v['vin'])}, {sql(v['notas'])}, {sql('baja' if v['placas'] in BAJA else 'disponible')})"
             for v in sorted(vehiculos.values(), key=lambda v: int(v['unidad'][2:]))) + ';')
w('')
w('insert into public.conductores (id, nombre, notas) values')
w(',\n'.join(f"  ({sql(c['id'])}, {sql(c['nombre'])}, {sql(ORIGEN)})" for c in sorted(conductores.values(), key=lambda c: c['nombre'])) + ';')
w('')
w('-- Primero las finalizadas; las activas pasan el coche a "rentado".')
w('insert into public.rentas (id, vehiculo_id, conductor_id, fecha_inicio, fecha_fin, tarifa_semanal, deposito, km_entrega, km_devolucion, estado, notas) values')
w(',\n'.join(
    f"  ({sql(r['id'])}, {sql(vehiculos[r['placas']]['id'])}, {sql(r['conductor']['id'])}, {sql(r['inicio'])}, {sql(r['fin'])}, "
    f"{r['tarifa']}, {r['deposito']}, {r['km_entrega']}, {sql(r['km_devolucion'])}, {sql('activa' if r['activa'] else 'finalizada')}, {sql(r['notas'])})"
    for r in sorted(rentas, key=lambda r: (r['activa'], r['inicio']))) + ';')
w('')
w('insert into public.registros_km (vehiculo_id, fecha, km, origen) values')
w(',\n'.join(f"  ({sql(vehiculos[p]['id'])}, {sql(s)}, {k}, 'manual')" for p in sorted(lecturas) for s, k in lecturas[p]) + ';')
w('')
w('insert into public.servicios (id, vehiculo_id, tipo_servicio_id, fecha, km, notas, reinicia_contador)')
w('select s.id::uuid, s.vehiculo_id::uuid, t.id, s.fecha::date, s.km, s.notas, t.reinicia_contador from (values')
w(',\n'.join(f"  ({sql(s['id'])}, {sql(vehiculos[s['placas']]['id'])}, {sql(s['tipo'])}, {sql(s['fecha'])}, {s['km']}, {sql(s['notas'])})" for s in servicios))
w(') s (id, vehiculo_id, tipo, fecha, km, notas) join public.tipos_servicio t on t.nombre = s.tipo;')
w('')
w('-- Semanas de renta con el mismo concepto que usa generar_cargos, para que no las vuelva a crear.')
w('insert into public.cargos (renta_id, tipo, fecha, periodo_inicio, periodo_fin, monto, concepto) values')
cargos_sql = []
for r in rentas:
    for c in r['cargos']:
        n = (c['semana'] - r['inicio']).days // 7 + 1
        cargos_sql.append(f"  ({sql(r['id'])}, 'renta', {sql(c['semana'])}, {sql(c['semana'])}, {sql(c['semana'] + timedelta(6))}, {c['monto']}, 'Renta semana {n}')")
    if r['danio']:
        cargos_sql.append(f"  ({sql(r['id'])}, 'danio', {sql(r['danio']['semana'])}, null, null, {r['danio']['monto']}, 'Reparación pendiente según concentrado')")
    if r['ajuste'] < 0:
        cargos_sql.append(f"  ({sql(r['id'])}, 'otro', {sql(r['fecha_ajuste'])}, null, null, {-r['ajuste']}, 'Ajuste por importación: deuda anotada en el concentrado')")
w(',\n'.join(cargos_sql) + ';')
w('')
w('insert into public.pagos (renta_id, fecha, monto, metodo, notas, registrado_por)')
w("select p.renta_id::uuid, p.fecha::date, p.monto, 'efectivo', p.notas,")
w("       (select id from public.usuarios where rol = 'admin' and activo order by creado_en limit 1) from (values")
pagos_sql = []
for r in rentas:
    for c in r['cargos']:
        if c['pagado']:
            n = (c['semana'] - r['inicio']).days // 7 + 1
            pagos_sql.append(f"  ({sql(r['id'])}, {sql(c['semana'])}, {c['monto']}, {sql(f'Semana {n} marcada PAGADO en el concentrado (método no registrado).')})")
    if r['ajuste'] > 0:
        pagos_sql.append(f"  ({sql(r['id'])}, {sql(r['fecha_ajuste'])}, {r['ajuste']}, 'Ajuste por importación: abonos que el concentrado no detalla semana a semana.')")
w(',\n'.join(pagos_sql))
w(') p (renta_id, fecha, monto, notas);')
w('')
w('end $$;')
(AQUI / 'concentrado.sql').write_text('\n'.join(L) + '\n', encoding='utf-8')

# ------------------------------------------------------------
# Valores esperados y reporte
# ------------------------------------------------------------

esperado = {
    'ultima_semana': ULTIMA.isoformat(),
    'conteos': {
        'vehiculos': len(vehiculos), 'conductores': len(conductores), 'rentas': len(rentas),
        'rentas_activas': sum(r['activa'] for r in rentas), 'servicios': len(servicios),
        'registros_km': sum(len(v) for v in lecturas.values()),
    },
    'rentas': {r['id']: str(r['objetivo']) for r in rentas},
    'rentados': sorted(vehiculos[r['placas']]['id'] for r in rentas if r['activa']),
    'km_actual': {v['id']: (lecturas[p][-1][1] if lecturas[p] else 0) for p, v in vehiculos.items()},
}
(AQUI / 'esperado.json').write_text(json.dumps(esperado, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

pesos = lambda x: f'${x:,.2f}'
R = []
w = R.append
w('# Importación del concentrado de rentas')
w('')
w(f'Fuente: `{EXCEL.name}`, {len(SEMANAS)} semanas ({SEMANAS[0]:%d/%m/%Y} a {ULTIMA:%d/%m/%Y}). Generado por `importar_concentrado.py`.')
w('')
c = esperado['conteos']
w(f"- {c['vehiculos']} vehículos, {c['conductores']} conductores, {c['rentas']} rentas ({c['rentas_activas']} activas)")
w(f"- {len(cargos_sql)} cargos, {len(pagos_sql)} pagos, {c['registros_km']} lecturas de km, {c['servicios']} servicios")
w(f"- Saldo total por cobrar: {pesos(sum(r['objetivo'] for r in rentas))}")
w('')
w('## Rentas')
w('')
w('"Según semanas" es lo que debería si solo contaran las marcas PAGADO / NO PAGADO. "Saldo final" es lo que dicen las notas de deuda y es lo que queda en la base; la diferencia entra como ajuste (abono si es positiva, cargo si es negativa).')
w('')
w('| Unidad | Placas | Conductor | Inicio | Fin | Semanas | Tarifa | Según semanas | Saldo final | Ajuste |')
w('|---|---|---|---|---|---|---|---|---|---|')
for r in sorted(rentas, key=lambda r: (int(r['unidad'][2:]), r['inicio'])):
    w(f"| {r['unidad']} | {r['placas']} | {r['conductor']['nombre']} | {r['inicio']:%d/%m} | {f'{r['fin']:%d/%m}' if r['fin'] else 'activa'} | {len(r['cargos'])} | "
      f"{pesos(r['tarifa'])} | {pesos(r['saldo_semanas'])} | {pesos(r['objetivo'])} | {pesos(r['ajuste']) if r['ajuste'] else '—'} |")
w('')
w('## Servicios')
w('')
for s in servicios:
    w(f"- {vehiculos[s['placas']]['unidad']} ({s['placas']}), {s['fecha']:%d/%m}: {s['tipo']} a {s['km']:,} km. {s['notas']}")
w('')
w('## Para revisar')
w('')
for a in avisos:
    w(f'- {a}')
sin_renta = [c['nombre'] for k, c in conductores.items() if not any(r['conductor'] is c for r in rentas)]
if sin_renta:
    w(f"- Conductores anotados sin semanas rentadas (se dieron de alta sin renta): {', '.join(sin_renta)}.")
w('- Los pagos se registraron como **efectivo**: el concentrado no dice el método.')
w('- El depósito de las rentas finalizadas quedó como **retenido**: el concentrado no dice si se devolvió o se aplicó.')
w('- Las rentas que ya existían al iniciar el concentrado empiezan el 13/07/2026; lo anterior no está en el archivo.')
w('- Las notas de "Abono semana actual" (columna P) no se usan: el ajuste ya refleja los abonos parciales.')
w('- Los avisos sin monto ("Mantenimiento 10,000", "Programar mantenimiento…", "faltan 500 deposito") quedaron en las notas de la renta.')
(AQUI / 'REPORTE.md').write_text('\n'.join(R) + '\n', encoding='utf-8')

print(f"{c['vehiculos']} vehículos, {c['conductores']} conductores, {c['rentas']} rentas, {len(cargos_sql)} cargos, {len(pagos_sql)} pagos, "
      f"{c['registros_km']} km, {c['servicios']} servicios, {len(avisos)} avisos")
