-- Número de unidad del coche (C-1, C-2…), el código con el que el negocio identifica cada coche.
-- Es opcional: un coche puede quedar sin unidad mientras se decide cuál le toca.

alter table public.vehiculos
  add column unidad text check (unidad <> '' and unidad = upper(btrim(unidad)));

create unique index vehiculos_unidad_uq on public.vehiculos (unidad) where unidad is not null;

-- Los coches importados del concentrado traen la unidad en las notas ("Unidad C-14. Transmisión estándar.").
-- Se pasa al campo nuevo y se quita de las notas. Si dos coches traen la misma unidad, ninguno la recibe
-- y la nota se queda como está, para resolverlo a mano.
with leidas as (
  select id, (regexp_match(notas, 'Unidad (C-\d+)\.'))[1] as unidad from public.vehiculos
), unicas as (
  select unidad from leidas where unidad is not null group by unidad having count(*) = 1
)
update public.vehiculos v
set unidad = l.unidad,
    notas = btrim(regexp_replace(v.notas, 'Unidad C-\d+\.\s*', ''))
from leidas l
join unicas u using (unidad)
where v.id = l.id;
