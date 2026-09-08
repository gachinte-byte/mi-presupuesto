# Mi Presupuesto — V44

## Fase 3 — Integración D1 de Ahorros e Ingresos (lectura)

V44 parte directamente de la versión estable **V43** de `mi-presupuesto`.

### Objetivo de esta versión

Conectar Ahorros e Ingresos con el Worker de `gastos-ia` mediante los endpoints de lectura de Fase 3, sin habilitar todavía escrituras en D1.

### Endpoints utilizados

- `GET /presupuesto/ahorros`
- `GET /presupuesto/ahorros/saldos?mes=YYYY-MM`
- `GET /presupuesto/ingresos`
- `GET /presupuesto/ingresos/valores?mes=YYYY-MM`

### Comportamiento V44

- D1 proporciona el catálogo oficial de Ahorros: categorías y productos.
- D1 proporciona los saldos mensuales disponibles de Ahorros.
- D1 proporciona el catálogo oficial de Ingresos: categorías y subcategorías.
- D1 proporciona los valores mensuales disponibles de Ingresos.
- Los valores recibidos de D1 se incorporan al estado local para mostrar la información en la aplicación.
- Los históricos locales se conservan cuando D1 todavía no tiene registros para un mes concreto.
- La aplicación vuelve a consultar D1 al cambiar de mes.
- Los botones y edición existentes continúan funcionando localmente en esta etapa.
- **Todavía NO existen escrituras desde `mi-presupuesto` hacia D1.**

### Próxima etapa

Después de validar V44, se agregará la escritura segura hacia D1 para que:

- editar un saldo de Ahorros guarde en `presupuesto_ahorro_saldos`;
- editar un ingreso guarde en `presupuesto_ingreso_valores`;
- copiar el mes anterior pueda persistir los nuevos valores en D1;
- la escritura esté protegida mediante autorización en el Worker;
- al recargar desde otro dispositivo, los cambios permanezcan en D1.

### Datos D1 migrados y comprobados

Ahorros:
- 6 categorías
- 13 productos
- 29 registros mensuales migrados

Ingresos:
- 3 categorías
- 3 subcategorías
- 11 registros mensuales migrados

### Seguridad / estabilidad

- No se modifica la lógica existente de Gastos/Telegram.
- No se toca `calculadora-inversiones`.
- V44 no agrega endpoints de escritura.
- Antes de habilitar escritura se probará primero lectura y luego un cambio controlado.

### Versiones relevantes

- V30: integración funcional de Gastos con D1.
- V41: correcciones PWA/iPhone.
- V43: acabado visual estable de Gastos y botones secundarios.
- V44: lectura de Ahorros e Ingresos desde D1.
