-- La C-25 quedó sin asignar porque en el concentrado aparecía en dos coches. Confirmado con el negocio:
-- la C-25 es el Kia YWX 006 J; el Changan ZBE 026 G solo la cubrió unas semanas y ya no está en la flota.
-- No pisa una unidad que ya se haya capturado a mano.

update public.vehiculos
set unidad = 'C-25',
    notas = btrim(regexp_replace(notas, 'Unidad C-25\.\s*', ''))
where placas = 'YWX 006 J'
  and unidad is null
  and not exists (select 1 from public.vehiculos where unidad = 'C-25');

update public.vehiculos
set notas = btrim(regexp_replace(notas, 'Unidad C-25\.\s*', 'Cubrió la unidad C-25 unas semanas. '))
where placas = 'ZBE 026 G'
  and notas ~ 'Unidad C-25\.';
