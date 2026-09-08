# Mi Presupuesto

Aplicación web/PWA para presupuesto personal, pensada primero para iPhone.

## V7
- Navegación inferior en una sola línea con 5 opciones.
- Gastos por categoría con selector: todas, total o una categoría.
- Gráficas con valor al pasar el puntero por cada punto.
- Los saldos de ahorros/inversiones se arrastran dentro del mismo año, pero enero no toma automáticamente un saldo de diciembre del año anterior en las gráficas.
- Mantiene almacenamiento local y exportación/importación JSON.

## Uso
Subir todos los archivos a la raíz del repositorio de GitHub Pages.

En iPhone: abrir la URL publicada en Safari → Compartir → Añadir a pantalla de inicio.


### V14
Incluye mover subcategorías/cuentas a otra categoría desde el modo Organizar, conservando todos los valores históricos.


## V20 — Catálogo central D1
La sección Gastos usa las categorías y subcategorías activas de Cloudflare D1 como catálogo maestro. En esta etapa solo se sincroniza el catálogo; los valores mensuales se conectarán en la siguiente etapa.
