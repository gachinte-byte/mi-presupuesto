# Mi Presupuesto V27

Etapa 2 de integración con Cloudflare D1.

- Primero actualiza el catálogo oficial D1.
- Después carga los valores mensuales desde `/presupuesto/gastos`.
- Las categorías/subcategorías son de solo lectura y provienen de D1.
- Los valores mensuales son locales e independientes de D1.
- Los valores cargados desde D1 pueden actualizarse en una nueva carga.
- Los valores modificados manualmente quedan protegidos y no se escriben en D1.
- Ingresos y Ahorros permanecen locales.


## V29
Corrección de montos D1 con decimales/escala 100x; carga del catálogo antes de valores.
