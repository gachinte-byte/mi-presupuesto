# Mi Presupuesto — Gaachinte Finanzas

Aplicación web/PWA para presupuesto personal, pensada primero para iPhone y con almacenamiento local.

## Menús
- Inicio: ingresos, gastos y extra disponible.
- Gastos: categorías, subcategorías y copia del mes anterior.
- Ahorros: saldos de cuentas/inversiones y copia del mes anterior.
- Ingresos: salario, arriendos y otros.
- Análisis: patrimonio y gastos de enero a diciembre.

## Datos
Los cambios se guardan en `localStorage` del dispositivo. Usa Configuración → Exportar JSON para llevar los datos a otro dispositivo y Configuración → Importar JSON para recuperarlos.

Los saldos de ahorros/inversiones se pueden copiar del mes anterior. Al entrar en enero de un nuevo año, si enero todavía no tiene saldos y diciembre del año anterior sí los tiene, la app los pasa automáticamente a enero como saldo inicial del nuevo año.

## GitHub Pages
Sube todos los archivos a la raíz del repositorio y activa GitHub Pages desde `main` / root.
