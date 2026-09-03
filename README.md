# Mi Presupuesto

Aplicación web personal para controlar tres cosas: ingresos, gastos y ahorros/inversiones.

## Características

- Diseñada primero para celular.
- Funciona como página web y PWA.
- Sin servidor ni base de datos.
- Los datos se guardan localmente en `localStorage` de cada dispositivo.
- Exportación e importación de datos mediante JSON.
- Cambio de mes.
- Copiar valores del mes anterior para evitar volver a digitar gastos fijos.
- Ingresos: salario, arriendos y otros.
- Gastos: categoría + subcategoría + valor mensual.
- Ahorros/inversiones: categoría + cuenta + saldo mensual.
- Cálculo automático de ingresos, gastos y extra disponible.
- Conversión referencial de USD a COP para el total patrimonial.

## Subir a GitHub Pages

1. Crea un repositorio nuevo, por ejemplo `mi-presupuesto`.
2. Sube todos los archivos de esta carpeta a la raíz del repositorio.
3. En GitHub entra a **Settings → Pages**.
4. En **Build and deployment**, selecciona **Deploy from a branch**.
5. Selecciona la rama `main` y carpeta `/ (root)`.
6. Guarda y espera a que GitHub publique la página.
7. Abre la URL desde el celular.
8. En iPhone/Android puedes agregarla a la pantalla de inicio para usarla como app.

## Cómo se guardan los datos

El archivo `data.json` es solamente la información inicial que carga la aplicación. Después de abrirla, los cambios se guardan en el almacenamiento local del navegador.

Por eso el celular y el PC tienen datos independientes. Para mover la información:

**Dispositivo A → ⚙️ → Exportar datos a JSON → Dispositivo B → ⚙️ → Importar JSON.**

No se necesitan claves bancarias ni números de cuenta.
