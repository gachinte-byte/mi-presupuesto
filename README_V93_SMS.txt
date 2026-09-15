Mi Presupuesto V93 — SMS + chat principal

Cambios:
- El Worker selecciona automáticamente el chat principal de Telegram cuando no se configura Chat ID.
- La selección automática es estable: usa el chat con mayor cantidad de gastos confirmados.
- Los gastos SMS confirmados con chat_id='sms' también se incluyen en Mi Presupuesto cuando no se especifica chat_id, por lo que el gasto ya confirmado de $93.800 se puede mostrar sin modificarlo manualmente.
- Los futuros SMS confirmados se guardan con el chat principal real y no con chat_id='sms'.
- La reclasificación de gastos existentes no fue modificada.
- El modal de SMS incluye Descripción opcional. Si se deja vacía, conserva el comercio/descripción detectada.
