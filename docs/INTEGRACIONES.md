# Integraciones: Webpay, correo y WhatsApp

Las tres funcionan **sin configurar nada** (modo simulado), lo que permite hacer
la demo de inmediato. Cada una se activa en serio al agregar sus credenciales.
El estado actual de cada canal se ve en **Panel → Avisos** (arriba).

## Webpay Plus (Transbank)

Variable `TRANSBANK_MODO` en `wrangler.jsonc`:

| Modo | Qué hace |
|---|---|
| `integracion` | Ambiente de pruebas de Transbank con las credenciales públicas de prueba. **Es el valor por defecto.** |
| `simulado` | No contacta a Transbank. Una pantalla propia, rotulada como simulador, imita el formulario de pago y vuelve a la clínica exactamente igual que Webpay. |
| `produccion` | Cobro real. Requiere los secretos `TRANSBANK_CODIGO_COMERCIO` y `TRANSBANK_LLAVE`, que Transbank entrega al afiliar a la clínica. |

**Datos de prueba del ambiente de integración**

| Dato | Valor |
|---|---|
| Tarjeta aprobada | VISA `4051 8856 0044 6623`, CVV `123`, cualquier fecha futura |
| Tarjeta rechazada | Mastercard `5186 0595 5959 0568` |
| Autenticación del banco | RUT `11.111.111-1`, clave `123` |

> El firewall de Transbank bloquea algunos servidores de centros de datos. Si
> al pagar aparece "No pudimos conectar con Webpay", usa `TRANSBANK_MODO=simulado`
> para la demo.

**Reglas implementadas**
- La hora queda retenida como "pendiente de pago" por 15 minutos
  (`reservaPagoMinutos` en `app/config/clinica.ts`). Si no se paga, el cron la libera.
- La cita se marca pagada solo con la confirmación del servidor (commit), nunca
  porque el navegador volvió. El retorno es idempotente: refrescar no cobra dos veces.
- Si el pago llega después de que la hora se liberó, se devuelve automáticamente.
- Si el paciente anula con más de 24 h de anticipación
  (`cancelacionConDevolucionHoras`), se devuelve el pago. Con menos, se le advierte
  antes de anular. Si anula la clínica, siempre se devuelve.

## Correo (Resend)

1. Crea una cuenta gratuita en [resend.com](https://resend.com). El plan
   gratuito permite 3.000 correos al mes y 100 al día.
2. Para enviar a cualquier persona, verifica un dominio propio en Resend.
   Sin dominio, Resend solo deja enviar a tu propio correo.
3. Configura los secretos:
   ```bash
   npx wrangler secret put RESEND_API_KEY      # re_xxxxxxxx
   npx wrangler secret put EMAIL_REMITENTE     # Centro Médico <avisos@tu-dominio.cl>
   ```
   En local, agrégalos a `.dev.vars`.

Correos que envía el sistema: confirmación, recordatorio (24 h antes), cambio de
hora, anulación, hora liberada (lista de espera) y el código de ingreso de
pacientes. Con correo real configurado, conviene poner `MOSTRAR_CODIGOS_DEMO`
en `"false"`.

## WhatsApp (Cloud API de Meta)

### 1. Crear la app y obtener el número de prueba (gratis)
1. En [developers.facebook.com](https://developers.facebook.com), crea una app de
   tipo **Business** y agrega el producto **WhatsApp**.
2. Meta asigna un **número de prueba**. Agrega como destinatarios los celulares
   que usarás en la demo (máximo 5).
3. Copia el **Phone number ID**.
4. Crea un **token permanente**: Configuración del negocio → Usuarios del
   sistema → Generar token, con permisos `whatsapp_business_messaging` y
   `whatsapp_business_management`. El token temporal del panel caduca en 24 h.

### 2. Crear las plantillas (requieren aprobación de Meta)
Categoría **Utilidad**, idioma **Español (es)**. Los nombres y textos deben ser
exactamente estos (están en `app/modules/avisos/plantillas.ts`):

| Nombre | Texto | Botones |
|---|---|---|
| `cita_confirmada` | Hola {{1}}, tu hora de {{2}} con {{3}} quedó reservada para el {{4}}. Para ver, cambiar o anular tu hora: {{5}} | — |
| `cita_recordatorio` | Hola {{1}}, te recordamos tu hora de {{2}} con {{3}} el {{4}}. ¿Asistirás? Responde con uno de los botones. | Respuesta rápida: **Confirmar asistencia**, **Anular hora** |
| `cita_reagendada` | Hola {{1}}, tu hora de {{2}} con {{3}} cambió al {{4}}. Para ver o gestionar tu hora: {{5}} | — |
| `cita_anulada` | Hola {{1}}, tu hora de {{2}} del {{3}} fue anulada. Si quieres agendar una nueva hora: {{4}} | — |
| `hora_liberada` | Hola {{1}}, se liberó una hora de {{2}} con {{3}} el {{4}}. Si te sirve, resérvala aquí: {{5}} | — |

Los mensajes nunca incluyen información clínica, solo especialidad,
profesional, fecha y hora.

### 3. Configurar el webhook (para los botones del recordatorio)
1. En la app de Meta → WhatsApp → Configuración → Webhook:
   - URL: `https://<tu-app>.workers.dev/api/whatsapp`
   - Token de verificación: una palabra secreta que inventes.
   - Suscríbete al campo `messages`.
2. Copia el **App secret** (Configuración → Básica).

### 4. Secretos
```bash
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
npx wrangler secret put WHATSAPP_VERIFY_TOKEN   # la palabra del paso 3
npx wrangler secret put WHATSAPP_APP_SECRET
```

### Seguridad de las respuestas
Cuando el paciente toca **Confirmar** o **Anular**, el sistema exige tres cosas:
- que el mensaje venga firmado por Meta (`X-Hub-Signature-256` con el App secret);
- que el botón traiga el token firmado de esa cita;
- que responda el mismo celular registrado del paciente o su tutor.

### Bot de WhatsApp
El paciente escribe al número de la clínica y el bot le ofrece agendar, ver y anular sus horas
(menús de botones y listas). Funciona con el mismo webhook (`/api/whatsapp`, campo `messages`) y
**no necesita plantillas nuevas**: las conversaciones que inicia el paciente se responden con
mensajes normales durante 24 horas, sin costo. Se activa o desactiva en Panel → Configuración
(módulo "Bot de WhatsApp"). Con el número de prueba de Meta solo conversan los destinatarios
verificados.

### Sin WhatsApp configurado (demo)
En **Panel → Avisos**, cada recordatorio por WhatsApp tiene botones
**Simular respuesta del paciente**. Ejecutan exactamente el mismo proceso que
una respuesta real.

## Cron
Cada 5 minutos (`triggers.crons` en `wrangler.jsonc`), el cron libera las horas
cuyo plazo de pago venció y envía los avisos pendientes (recordatorios y
reintentos). Además, los avisos de una reserva se envían de inmediato en segundo
plano.

Probar el cron en local:
```bash
curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*"
```
