# Bitácora: módulos de la Fase 1

Sistema interno para una microempresa que renta coches a conductores de plataformas con **cobro semanal**. Junta dos cosas: la parte de rentera (rentas y cobranza) y la parte de agencia (historial del coche, mantenimiento e inspecciones con fotos).

Este documento explica qué hace cada módulo, qué reglas sigue y qué datos guarda. Cada sección coincide con una pantalla de la demo.

> **Sobre la demo.** Es estática: no tiene servidor y usa datos ficticios (30 coches, 24 conductores y 5 usuarios), con "hoy" fijo en el **8 de octubre de 2026**. Las acciones (registrar pagos, rentar, subir fotos) funcionan en memoria y se pierden al recargar la página. Sirve para validar flujos y pantallas con el cliente antes de construir el backend.

**Etiquetas usadas en este documento**

| Etiqueta | Significado |
|---|---|
| **Fase 1** | Está en el alcance acordado ($25,000 MXN, ~6 semanas). |
| **Notas** | Viene de las notas de la reunión y no estaba en el resumen. Hay que confirmar si entra en la Fase 1 o se cotiza aparte. |
| **Futuro** | Queda fuera de la Fase 1. El diseño lo deja preparado, pero no se construye. |

---

## 1. Usuarios y acceso

**Para qué sirve:** que solo el personal interno (unas 5 personas) entre al sistema y que cada quien vea lo que le corresponde.

**Qué hace**
- Inicio de sesión con correo y contraseña. **Fase 1**
- Dos roles: **admin** y **operador**. **Fase 1**
- Bitácora de auditoría: cada alta, edición, pago o cambio de estado guarda quién lo hizo, cuándo y qué cambió. **Notas** ("Logs/auditorías de cada cambio, quién lo hizo")

**Permisos por rol**

| Acción | Admin | Operador |
|---|---|---|
| Consultar flota, conductores, rentas y cobranza | ✔ | ✔ |
| Registrar pagos, km, servicios, incidentes e inspecciones | ✔ | ✔ |
| Iniciar y finalizar rentas | ✔ | ✔ |
| Editar tarifas y depósitos ya registrados | ✔ | — |
| Cancelar pagos (con motivo) | ✔ | — |
| Poner o quitar a alguien de la lista negra | ✔ | — |
| Finanzas: estado de resultados, rentabilidad y gastos | ✔ | — |
| Usuarios, auditoría y configuración de Orión | ✔ | — |

**Datos:** `Usuario` (nombre, correo, rol, activo) y `Auditoría` (fecha y hora, usuario, acción, entidad, detalle).

**En la demo:** en la pantalla de entrada se elige un usuario sin contraseña. Con un operador desaparecen Orión, Usuarios y la pestaña financiera del coche. En *Usuarios y auditoría → Bitácora* aparecen las acciones que vayas haciendo.

---

## 2. Flota (vehículos)

**Para qué sirve:** tener el expediente completo de cada coche, el "apartado de cada auto" de las notas.

**Qué hace**
- Alta y edición: marca, modelo, año, placas, color, VIN o serie, kilometraje actual y notas. **Fase 1**
- Estado: **disponible**, **rentado** o **en taller**. **Fase 1**
  - "Rentado" no se elige a mano: lo pone y lo quita el módulo de Rentas.
  - "En taller" saca el coche de la lista de coches que se pueden rentar.
- Vista de detalle con pestañas. **Fase 1**
  - *Resumen*: renta actual, estado del mantenimiento y datos del coche.
  - *Historial*: la historia del vehículo en una sola línea de tiempo (rentas, devoluciones, servicios, incidentes e inspecciones).
  - *Kilometraje*, *Mantenimiento y llantas*, *Incidentes* e *Inspecciones*.
- **Rentabilidad** (solo admin): ingresos, costos, utilidad acumulada, ocupación y qué porcentaje de su precio de compra ya recuperó. Ver el módulo 11. **Notas**
- Llantas actuales por posición, con marca, año DOT y km de instalación. **Notas** ("color y año de la llanta y la marca")

**Datos:** `Vehículo` (además: precio y fecha de compra, ID de equipo Orión) y `Llanta` (posición, marca, año DOT, km y fecha de instalación).

---

## 3. Conductores

**Para qué sirve:** el expediente de cada conductor y el filtro de a quién se le presta un coche.

**Qué hace**
- Contacto: nombre, teléfono o WhatsApp, correo y domicilio. **Fase 1**
- Licencia: número y vigencia, con aviso si está vencida o vence en menos de 30 días. **Fase 1**
- Documentos (archivos opcionales). **Fase 1**, con la lista de las notas:
  - INE
  - Licencia
  - Carta de no antecedentes penales
  - Comprobante de domicilio
  - 2 referencias familiares (nombre, parentesco y teléfono)
- Historial de coches que ha rentado, con fechas, tarifa, km recorridos, depósito y saldo. **Fase 1**
- Movimientos y **estado de cuenta mensual** (cargos, pagos y saldo), imprimible o en PDF y exportable a Excel. **Notas**
- **Lista negra** con motivo. Al dar de alta a un conductor, su **CURP se compara** contra la lista negra, y a alguien en la lista negra no se le puede asignar un coche. **Notas**

**Datos:** `Conductor` (CURP, licencia, referencias, en lista negra y motivo) y `Documento` (tipo, archivo y vigencia).

**Futuro:** que la IA lea los documentos y llene datos como la vigencia de la licencia. También una solicitud en línea donde el aspirante suba sus documentos.

---

## 4. Rentas

**Para qué sirve:** registrar quién tiene qué coche, desde cuándo y a qué tarifa (el "registro de a quién se le prestó").

**Qué hace**
- **Iniciar renta:** coche disponible + conductor + fecha de inicio + tarifa semanal + depósito. El km de entrega se toma del coche. **Fase 1**
  - Al iniciar, el coche pasa a "rentado" y se genera el primer cargo semanal.
  - Ofrece hacer en ese momento la inspección de entrega con fotos.
- **Finalizar renta:** fecha de fin, km de devolución y qué se hace con el depósito (se devuelve, se aplica al adeudo o daños, o queda retenido). **Fase 1**
  - El coche vuelve a "disponible" y se ofrece la inspección de recepción.
- **Depósito** por renta, con su estado. **Notas** ("depósito para rentar")
- **Editar tarifa y depósito** de una renta activa (solo admin). La nueva tarifa aplica a los cargos siguientes; los ya generados no cambian. **Fase 1**

**Reglas**
1. Un coche solo puede tener **una renta activa** a la vez. Se valida en la interfaz y, en producción, también en la base de datos con un índice único parcial.
2. Un conductor solo puede tener una renta activa a la vez.
3. No se puede asignar un coche a un conductor que está en la lista negra.
4. El km de devolución no puede ser menor que el de entrega.

**Datos:** `Renta` (coche, conductor, inicio, fin, tarifa semanal, depósito y su estado, km de entrega y de devolución, estado).

---

## 5. Cobranza

**Para qué sirve:** saber quién debe cuánto. **No hay cobro en línea**: solo se registra lo que ya se pagó.

**Qué hace**
- **Cargos semanales:** un cargo por cada renta activa y cada semana. **Fase 1**
  - Se generan con el botón "Generar cargos de la semana" o con una tarea automática cada lunes.
  - La operación es **idempotente**: correrla dos veces no duplica cargos.
- **Registrar un pago:** renta, fecha, monto, método (efectivo o transferencia/depósito) y notas, por ejemplo el folio. Se guarda quién lo registró. **Fase 1**
- **Saldos:** por conductor, por coche y total global (cargado − pagado). **Fase 1**
- Pagos parciales: el saldo simplemente queda pendiente. **Fase 1**
- **Cancelar un pago** mal capturado (solo admin, con motivo obligatorio). El pago no se borra: queda tachado, deja de contar para el saldo y la cancelación queda en la auditoría. Si el monto estaba mal, se registra el pago correcto. **Fase 1**
- **Histórico en Excel:** exportación CSV de todos los pagos. **Notas**

**Reglas**
- Saldo = suma de cargos − suma de pagos vigentes. No se guarda un saldo "a mano" que pueda desfasarse.
- Los pagos nunca se borran ni se editan; solo se cancelan.
- Las semanas se calculan en la zona horaria **America/Merida** y los montos están en **MXN**.

**Datos:** `Cargo` (renta, periodo, monto, concepto) y `Pago` (renta, fecha, monto, método, notas, usuario).

**Futuro:** recordatorios y estados de cuenta por WhatsApp o correo, cobro en línea y facturación (CFDI).

---

## 6. Kilometraje y mantenimiento

**Para qué sirve:** que ningún coche se pase de su servicio y que quede el historial de todo lo que se le ha hecho.

**Qué hace**
- **Registros de kilometraje** con fecha y origen. **Fase 1**
  - Orígenes: *manual*, *entrega*, *recepción* u *Orión*.
  - El km del coche es el del último registro, y no se acepta un km menor que el anterior.
- **Servicios:** fecha, km, tipo, costo, taller y notas. **Fase 1**
- **Catálogo de tipos de servicio** (servicio de 10,000 km, frenos y balatas, llantas, alineación, carrocería, suspensión y otro). **Notas**
- **Cambio de llantas** con marca y año DOT. **Notas**
- **Alerta cada 10,000 km**, contados desde el último servicio que reinicia el contador. **Fase 1**
  - Pasa a **Próximo** a los 9,000 km y a **Vencido** a los 10,000 km.
  - Aparece en el dashboard, en el listado de mantenimiento y en la ficha del coche.

**Datos:** `RegistroKm` (coche, fecha, km, origen), `Servicio` (coche, fecha, km, tipo, costo, taller, notas, si reinicia el contador) y `TipoServicio` (catálogo).

---

## 7. Incidentes y accidentes

**Para qué sirve:** registrar choques, daños, ponchaduras y demás, y quién los paga.

**Qué hace**
- Captura: coche, conductor (se sugiere el que tiene la renta activa), fecha, tipo, descripción, costo, responsable y fotos. **Fase 1**
  - Responsable posible: conductor, empresa, tercero o seguro.
- Estado abierto o cerrado. **Fase 1**
- Aparece en el historial del coche. Si el responsable es la empresa, el costo cuenta como inversión. **Fase 1**

**Datos:** `Incidente` y `Foto` (relación genérica: una foto pertenece a un incidente o a una inspección).

---

## 8. Inspecciones con fotos

**Para qué sirve:** tener evidencia de cómo se entregó cada coche y cómo regresó.

**Qué hace**
- Inspección de **entrega** y de **recepción**: km, nivel de combustible, observaciones y varias fotos. **Fase 1**
  - Fotos guiadas: frente, trasera, lateral izquierdo, lateral derecho, interior y tablero.
- Pensada para el **iPad o el teléfono**: cada recuadro abre la cámara desde el navegador. **Fase 1**
- **Compresión al subir:** la foto se redimensiona a un máximo de 1280 px y se comprime a JPEG antes de enviarse. **Fase 1**
- **Galería histórica por coche:** cada renta muestra lado a lado "cómo se entregó" y "cómo regresó". **Fase 1**
- Se enlaza con Rentas: al iniciar o finalizar una renta se ofrece hacer la inspección.

**Datos:** `Inspección` (coche, renta, tipo, fecha, km, combustible, notas, usuario) y `Foto` (URL en almacenamiento de objetos, etiqueta).

**Técnico:** las fotos van a almacenamiento de objetos tipo S3, nunca a la base de datos. La subida se hace directo desde el navegador con una URL firmada.

**Futuro:** la misma app empaquetada con Capacitor para iPad y teléfono: fotos sin señal que se suben solas al volver la conexión, cámara nativa y notificaciones. Ver "Preparado para la app con Capacitor" abajo.

---

## 9. Integración con Orión GPS

**Para qué sirve:** que el kilometraje se actualice solo, sin capturarlo a mano.

**Estado:** **pendiente de confirmar** que Orión tenga una API o una exportación de datos. Las notas dicen "creo que sí tienen API".

**Diseño (aislado a propósito)**
1. Cada coche tiene un campo opcional *ID de equipo Orión*.
2. Una tarea programada (por ejemplo, cada noche) consulta el odómetro y crea registros de km con origen **Orión**.
3. Nunca sobrescribe los registros manuales. Descarta lecturas menores que la anterior o con saltos absurdos, y genera un aviso.
4. Si Orión solo exporta archivos, se importa un CSV o Excel con la misma lógica.
5. **Si la integración se retrasa o no existe, nada más se rompe:** el km se sigue capturando a mano y en entregas y recepciones.

**Futuro:** traer las alertas de exceso de velocidad de Orión al expediente del conductor. **Notas**

**En la demo:** el botón "Simular sincronización" suma km ficticios a los coches rentados con equipo vinculado.

---

## 10. Dashboard

**Para qué sirve:** ver de un vistazo cómo va el negocio y qué hay que atender hoy.

**Qué muestra** (todo **Fase 1**)
- Coches por estado y ocupación.
- Ingresos de la semana y del mes, es decir, los pagos registrados.
- Adeudo total y adeudo por conductor.
- Próximos mantenimientos.
- **Avisos internos** (de las notas):
  - Servicios vencidos o próximos.
  - Licencias vencidas o por vencer de conductores con coche.
  - Adeudos de más de una semana.
  - Incidentes abiertos.

---

## 11. Finanzas

**Para qué sirve:** saber si el negocio está ganando dinero y qué coches convienen y cuáles no. Solo lo ve el admin.

> Son números **operativos** para decidir, no contabilidad fiscal: no hay IVA, CFDI ni depreciación. Eso lo sigue llevando su contador.

**Qué hace**
- **Estado de resultados** por periodo: un mes, el año a la fecha, los últimos 12 meses o todo el histórico. **Notas**
  - Ingresos: lo **cobrado** (pagos registrados), no lo cargado. Se muestra también qué porcentaje de lo cargado se cobró.
  - Gastos operativos: mantenimiento y servicios, incidentes a cargo de la empresa, seguros, refrendo y verificación, GPS, gastos generales y otros.
  - Utilidad operativa y margen.
  - Aparte, como inversión y no como gasto: la compra de coches del periodo y el flujo después de esa inversión.
  - Tabla mes a mes de los últimos 12 meses.
- **Rentabilidad por coche**, ordenable por cualquier columna y exportable a Excel. **Notas**
  - Ingresos, costos y utilidad del periodo.
  - Utilidad promedio por mes y ocupación (porcentaje de días rentado desde que está en la flota).
  - Cuánto de su precio de compra ya recuperó con la utilidad acumulada y en cuántos meses terminaría de recuperarlo a ese ritmo.
  - El coche más y el menos rentable por mes. Así se ven los coches parados que solo generan gasto.
- **Gastos:** captura de los costos que no son servicios ni incidentes (seguro, refrendo, GPS, renta del patio…), ligados a un coche o generales del negocio. **Notas**

**Reglas**
- Los costos de un coche son su mantenimiento, sus incidentes a cargo de la empresa y sus gastos propios. Los gastos generales cuentan en el estado de resultados, pero no se reparten entre coches.
- Los incidentes a cargo del conductor no son gasto de la empresa.
- Los pagos cancelados no cuentan como ingreso.
- **Los números solo son tan buenos como lo que se capture.** Si no se registran el seguro o el GPS, los coches se verán más rentables de lo que son.

**Datos:** `Gasto` (fecha, categoría, coche opcional, monto, concepto, usuario). Todo lo demás sale de pagos, servicios, incidentes y vehículos.

**En la demo:** los datos de ejemplo simulan una flota que creció durante 2026. Por eso la compra de coches pesa mucho en el flujo, y hay coches recién comprados o parados con utilidad negativa.

---

## Notas de la reunión, una por una

| Nota | Dónde queda | Etiqueta |
|---|---|---|
| App / apartado de cada auto | Flota → detalle | Fase 1 |
| Revisión general | Inspecciones y servicio de 10,000 km | Fase 1 |
| Mantenimiento cada 10,000 km | Mantenimiento → alertas | Fase 1 |
| Inversión vs generado | Finanzas → rentabilidad por coche y pestaña del coche | Notas |
| Registro de a quién se le prestó | Rentas | Fase 1 |
| Lista negra y coincidencia con CURP | Conductores | Notas |
| Subir documentación (INE, no penales, 2 referencias familiares, domicilio) | Conductores → documentos | Fase 1 (archivos opcionales) |
| IA que extraiga datos como la vigencia de la licencia | Conductores | Futuro |
| Aplicar usuarios en línea (solicitud del aspirante) | — | Futuro |
| Chatbot | — | Descartado por ahora ("ahorita no") |
| Conexión con Orión GPS, alertas de exceso | Orión | Fase 1 aislada (km); alertas: Futuro |
| Histórico en Excel | Cobranza y conductor → exportar CSV | Notas |
| Contabilidad por chofer y en general | Cobranza → saldos (por chofer) y Finanzas → estado de resultados (general) | Fase 1 / Notas |
| Depósito para rentar | Rentas | Notas |
| Avisos internos | Dashboard | Fase 1 |
| Registro de accidentes | Incidentes | Fase 1 |
| Mensajes de cartera vía WhatsApp | — | Futuro |
| Histórico de la vida del vehículo (carrocería, frenos, mantenimientos) | Flota → historial | Fase 1 |
| Balatas, catálogo de mantenimiento | Mantenimiento → catálogo | Notas |
| Color, año y marca de la llanta; registro de cambio de llantas | Flota → llantas | Notas |
| Formulario para llevar TODO | Todas las altas tienen formulario | Fase 1 |
| Orión da kilometraje | Orión | Fase 1 (aislado) |
| Estado de cuenta mensual | Conductor → estado de cuenta | Notas |
| Subir pagos en efectivo o depósito | Cobranza → registrar pago | Fase 1 |
| Logs y auditoría de cada cambio, quién lo hizo | Usuarios → bitácora | Notas |
| Investigar cómo trabajan las agencias en sus sistemas | — | Pendiente (investigación) |

> Casi todo lo marcado como **Notas** es poco trabajo extra porque reutiliza tablas que ya existen: depósito, lista negra, catálogo, llantas, CSV y estado de cuenta. Lo que más pesa es la **auditoría**, seguida de **Finanzas**, que agrega la captura de gastos y sus reportes. Hay que acordar con el cliente qué entra en los $25,000 MXN y qué se cotiza aparte.

---

## Temas transversales

- **Responsivo:** la misma web sirve en computadora, iPad y teléfono. En pantallas angostas el menú se vuelve un cajón lateral y los formularios se apilan en una columna.
- **Idioma y formato:** todo en español, montos en MXN y zona horaria America/Merida.
- **API limpia:** cada acción de la demo corresponde a un endpoint REST, como `POST /rentas`, `POST /rentas/:id/finalizar` o `POST /pagos`. La futura app para iPad usará la misma API.

### Preparado para la app con Capacitor

En la **Fase 1** todo se usa desde el navegador: las fotos se toman con la cámara del iPad o del teléfono y se suben directo al sistema. **Después**, la misma app React se empaqueta con Capacitor para publicarla en App Store y Google Play. Lo que agrega:
- fotos sin señal, guardadas en el equipo y subidas al volver la conexión;
- cámara nativa, más estable que la del navegador para varias fotos seguidas;
- ícono en el iPad y notificaciones.

Para que ese paso reutilice casi todo el código, la Fase 1 se construye así. Ninguna de estas reglas cuesta más hoy:
1. **Una sola función para tomar fotos** (`tomarFoto()`): en la web usa `<input type="file" capture>`; en la app, el plugin de cámara de Capacitor. El resto de la app no distingue.
2. **Subida directa al almacenamiento con URL firmada**, y cada foto e inspección con un **ID generado en el equipo**, para que reintentar una subida no la duplique.
3. **Sesión con token** (no depender de cookies), que funciona igual en navegador y en app.
4. **Nada exclusivo del navegador** en la lógica: ni ventanas nuevas ni almacenamiento del navegador como fuente de verdad.
- **Fotos y archivos:** en almacenamiento de objetos, comprimidos antes de subir.
- **Hosting económico:** entre $500 y $1,000 MXN al mes. Basta con un servidor pequeño o un PaaS, una base de datos administrada y almacenamiento de objetos.

## Preguntas abiertas para el cliente

1. ¿Orión tiene API o exportación? ¿Quién nos da acceso o documentación?
2. ¿Qué día de la semana se cobra? ¿Es igual para todos o depende del inicio de cada renta?
3. ¿El depósito es un monto fijo? ¿Se puede pagar en partes?
4. ¿Se cobra la primera semana completa aunque la renta empiece a media semana?
5. ¿Qué cuenta como "servicio" que reinicia el contador de 10,000 km?
6. ¿Qué entra de lo marcado como **Notas** en la Fase 1?
7. ¿Hay que migrar algún histórico en Excel al arrancar?
8. Si un coche se descompone a mitad de renta y se le da otro al conductor, ¿la renta sigue con el coche nuevo o se cierra y se abre otra? ¿Se cobra la semana completa?
9. ¿Cómo es la señal en el patio y donde se entregan los coches? De eso depende qué tan pronto conviene la app con Capacitor.
