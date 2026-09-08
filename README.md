# Mi Presupuesto — V23

Etapa 2 de integración con Gastos IA / Cloudflare D1.

- Categorías y subcategorías: catálogo oficial de D1, solo lectura.
- Valores mensuales de Gastos: independientes de D1 y editables localmente.
- Botón **Cargar valores de D1**: trae el resumen mensual por subcategoría y solo llena celdas que todavía no tienen un valor local. Nunca sobrescribe una edición manual.
- Los cambios manuales en `mi-presupuesto` no escriben en D1.
- Ingresos y Ahorros continúan funcionando localmente.
- Excel export/import conserva los valores editables de Gastos.
