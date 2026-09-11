V69 — Corrección de Notas e interactividad de gráficos: notas funcionales en Inicio y Análisis; puntos de patrimonio/cuentas táctiles; dona general de Gastos más grande y centrada en móvil; Gastos conserva dona/barras según selección y Ahorros/Inversiones conserva líneas.

# Mi Presupuesto — V63

## Fase 3 — Integración D1 de Ahorros e Ingresos (lectura + escritura)

V45 parte directamente de la versión estable **V44** de `mi-presupuesto`.

### Objetivo de esta versión

Conectar Ahorros e Ingresos con el Worker de `gastos-ia` para que los valores mensuales se lean desde D1 y, cuando el usuario los cambie en la aplicación, se guarden nuevamente en D1.

### Endpoints utilizados

Lectura:
- `GET /presupuesto/ahorros`
- `GET /presupuesto/ahorros/saldos?mes=YYYY-MM`
- `GET /presupuesto/ingresos`
- `GET /presupuesto/ingresos/valores?mes=YYYY-MM`

Escritura:
- `POST /presupuesto/ahorros/saldos`
- `POST /presupuesto/ingresos/valores`

### Comportamiento V45

- D1 proporciona el catálogo oficial de Ahorros: categorías y productos.
- D1 proporciona los saldos mensuales de Ahorros.
- D1 proporciona el catálogo oficial de Ingresos: categorías y subcategorías.
- D1 proporciona los valores mensuales de Ingresos.
- Editar un saldo de Ahorros intenta guardarlo inmediatamente en D1.
- Editar un ingreso intenta guardarlo inmediatamente en D1.
- Si la escritura falla, el valor anterior se restaura localmente y se informa el error.
- `Copiar saldos del mes anterior` guarda los valores copiados en D1.
- `Copiar ingresos del mes anterior` guarda los valores copiados en D1.
- Al cambiar de mes, la aplicación vuelve a consultar D1.
- El guardado local continúa funcionando como respaldo de estado/interfaz.

### Clave de escritura

La aplicación **no contiene la clave dentro del código**. El usuario debe introducir el valor de `PRESUPUESTO_WRITE_KEY` en Configuración. La clave se almacena en `localStorage` de ese dispositivo y se envía al Worker mediante el header `X-Presupuesto-Write-Key`.

**No publicar la clave en GitHub ni compartirla.** Si la clave se expone, debe rotarse en Cloudflare y actualizarse en la aplicación.

### Seguridad del Worker

Los endpoints de escritura del Worker requieren el secret `PRESUPUESTO_WRITE_KEY`. Además validan identificación del producto/subcategoría, formato de mes y valores numéricos. Las escrituras usan `UPSERT` sobre las claves únicas mensuales, evitando duplicados.

### Alcance de V48

Esta versión sincroniza y guarda **valores mensuales**. La estructura del catálogo (crear/eliminar/renombrar categorías, productos o subcategorías) sigue siendo una etapa posterior porque D1 es la fuente oficial y esos cambios requieren endpoints CRUD específicos.

### Datos D1 migrados y comprobados

Ahorros:
- 6 categorías
- 13 productos
- 29 registros mensuales migrados

Ingresos:
- 3 categorías
- 3 subcategorías
- 11 registros mensuales migrados

### Estabilidad

- No se modifica la lógica existente de Gastos/Telegram.
- No se toca `calculadora-inversiones`.
- V48 mantiene la interfaz base de V43/V44/V45/V46.
- V48 corrige la copia de mes anterior para Ahorros e Ingresos: obtiene explícitamente los valores del mes anterior desde D1 antes de copiarlos y guardarlos en el mes actual.
- Antes de esta versión se validaron lectura y escritura controlada de Ahorros e Ingresos en D1.

### Versiones relevantes

- V30: integración funcional de Gastos con D1.
- V41: correcciones PWA/iPhone.
- V43: acabado visual estable de Gastos y botones secundarios.
- V44: lectura de Ahorros e Ingresos desde D1.
- V45: lectura + escritura de valores mensuales de Ahorros e Ingresos.
- V46: corrección de variable `mes` en escrituras.
- V48: copia de mes anterior consulta D1 directamente y luego hace UPSERT de todos los valores al mes actual.


### V48
- Corrige de forma defensiva la copia de mes anterior para Ahorros e Ingresos.
- Evita errores si aparece algún elemento indefinido en los datos locales.
- La copia toma los valores del mes anterior desde D1 y los guarda en el mes actual mediante UPSERT.
- No modifica Gastos ni Telegram.


## Fase 3 — V49: gestión de cuentas e ingresos
- Ahorros: crear, renombrar, cambiar categoría/moneda, cambiar visibilidad en Inicio y eliminar lógicamente cuentas desde `mi-presupuesto`; cambios persistidos en D1.
- Ingresos: crear, renombrar, cambiar categoría y eliminar lógicamente ingresos; cambios persistidos en D1.
- Los saldos/valores históricos NO se eliminan al desactivar una cuenta o ingreso.
- Escrituras protegidas con `PRESUPUESTO_WRITE_KEY`.
- Las categorías centrales existentes se mantienen; la gestión solicitada se aplica a cuentas/productos y subcategorías de ingreso.


## V52 — estética y organización local
- Ahorros e inversiones mantiene la estructura D1 de cuentas/categorías, pero permite cambiar **localmente** el nombre visible de cada categoría (por ejemplo, CDTS → CDTS personales). Estos nombres no modifican D1.
- Se eliminó el rótulo “TERCERA TABLA” y el texto auxiliar debajo de “Ahorros e inversiones”.
- Ingresos incorpora el menú **↕ Organizar** para ordenar localmente las líneas de ingreso en el orden elegido por el usuario.
- En Ingresos, cada línea muestra su categoría como etiqueta visual y, dentro del modo organización, permite cambiar localmente el nombre visible de esa categoría.
- La organización y los nombres locales se guardan en localStorage y no escriben cambios estructurales en D1.


### Corrección V52
- Al actualizar Gastos desde D1, una respuesta correcta con 0 movimientos ahora limpia los valores locales del mes y los deja en $0.
- Se diferencia mes vacío en D1 de error de conexión: los errores no modifican los valores locales.


## V63 — mes visible en totales
- Los totales inferiores de Gastos e Ingresos muestran dinámicamente el mes actual: “Gastos · Septiembre 2026” e “Ingresos · Septiembre 2026”.
- Se actualizan automáticamente al cambiar de mes y no agregan elementos adicionales a la interfaz.


## V63
Corrección: los títulos dinámicos de Gastos e Ingresos ahora se actualizan explícitamente cada vez que cambia el mes, incluyendo después de la sincronización D1.


### V63
- El título inferior de Ahorros e inversiones ahora muestra dinámicamente el mes actual.
- No muestra valores en ese título; los totales COP y USD permanecen en el resumen inferior.
- El mes se actualiza junto con el selector superior, igual que Gastos e Ingresos.


## V63
- Gastos: indicador informativo obtenido de D1 con la última fecha de gasto del mes seleccionado y la fecha sugerida para continuar la carga.
- Worker `/presupuesto/gastos`: agrega `ultima_fecha_gasto` sin cambiar los valores ni la lógica de clasificación.


## V63
Conecta el indicador informativo de última fecha de gasto con `ultima_fecha_gasto` entregado por el endpoint `/presupuesto/gastos` del Worker V57. No modifica datos ni la lógica de D1.


### V63
- Agrega Notas del mes en Inicio: hasta 3 notas breves por mes, guardadas exclusivamente en localStorage.
- Las notas se pueden expandir/ocultar, editar y eliminar; no se envían a D1.


V63: Configuración simplificada. La conexión con Gastos IA usa por defecto el Worker oficial `https://gastos-ia.gachinte.workers.dev`; la URL ya no se edita desde la interfaz. La clave de escritura D1 queda dentro de Configuración avanzada.


V67: corrigió el desplegable de Notas de Análisis con estado explícito y agregó valores visibles al pasar el cursor/foco sobre las barras del gráfico de Total gastos.
