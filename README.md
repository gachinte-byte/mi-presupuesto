# Mi Presupuesto — V45

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
