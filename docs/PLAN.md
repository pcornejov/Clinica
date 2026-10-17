# Plan: sistema para clínica (prototipo demo)

Prototipo para presentar a clínicas y, a partir de él, construir software a
medida para cada cliente. Desarrollo y mantención: una persona, en TypeScript.

## Objetivo y alcance

- **Foco:** toma de horas, manejo del personal, fichas clínicas y avisos por
  correo y WhatsApp.
- **Una sola clínica** por instalación (una base de datos por cliente).
- **Escala de referencia:** 15 médicos, hasta ~240 citas al día (~5.000 al mes).
- **Costo:** todo en planes gratuitos; solo se invierte en un dominio
  (~US$10 al año, opcional) y unos pocos dólares de WhatsApp si se usa un
  número real.
- **Ficha clínica genérica**, con `campos_extra` (JSON) para adaptarla a una
  especialidad cuando un cliente lo pida.
- Lo que cambia entre clínicas (marca, módulos activos, reglas) vive en
  `app/config/clinica.ts` y más adelante en la base de datos.

## Módulos

| Módulo | Usuarios | Funciones |
|---|---|---|
| Web pública | Visitantes | Información, especialidades, médicos, agendar |
| Portal del paciente | Pacientes | Ver, cancelar y reagendar citas |
| Backoffice | Admin y recepción | Médicos, especialidades, horarios, agenda, usuarios, reportes |
| Portal médico | Médicos | Agenda del día, ficha clínica, atenciones, diagnósticos |
| Notificaciones | Sistema | Confirmaciones y recordatorios por correo y WhatsApp |
| Bot de WhatsApp | Pacientes | Agendar, confirmar y cancelar por chat |

Roles: `admin`, `recepcion`, `medico`, `paciente`. Recepción no ve el
contenido clínico.

## Stack

| Capa | Elección |
|---|---|
| App web + API | React Router v8 (framework mode, SSR) en **Cloudflare Workers** |
| Base de datos | **PostgreSQL** en **Neon** (driver HTTP) · Postgres local en desarrollo |
| ORM y migraciones | Drizzle |
| Autenticación | Better Auth (contraseña PBKDF2 para el personal; código por correo para pacientes) |
| Validación | Zod |
| Estilos | Tailwind CSS v4 |
| Tareas programadas | Cloudflare Cron Triggers (cada 5 minutos) |
| Archivos de la ficha | Cloudflare R2 |
| Correo | Resend |
| WhatsApp | WhatsApp Cloud API (Meta) |
| Pagos | Webpay Plus (Transbank) y Mercado Pago, más pago en la clínica |

### Decisiones y motivos

- **React Router en vez de Next.js:** Next.js en Workers excede con facilidad
  el límite de 3 MB y de 10 ms de CPU del plan gratuito. El build actual pesa
  ~600 KB comprimido.
- **Neon (Postgres) en vez de D1 (SQLite):** es el motor que se usará en
  producción y permite una restricción `EXCLUDE` que impide en la base de datos
  que dos citas del mismo médico se crucen.
- **PBKDF2 nativo para contraseñas:** el scrypt en JavaScript que usa Better
  Auth por defecto consume demasiada CPU para el plan gratuito.
- **Cron en vez de un proceso worker:** Workers no tiene procesos permanentes.
  El cron revisa cada 5 minutos qué recordatorios enviar y qué reservas liberar.
- Si se superan los límites del plan gratuito, el plan pagado de Workers
  cuesta US$5 al mes.

## Reglas clave

### Agendamiento sin cuenta previa
1. El paciente elige especialidad o médico, fecha y hora.
2. Ingresa RUT (validado con dígito verificador), nombre, correo y teléfono.
3. Elige el pago:
   - **En la clínica:** la cita queda `agendada`.
   - **Online:** la cita queda en `pendiente_pago` por 15 minutos; si no se
     paga, el cron la libera.
4. Recibe la confirmación por correo y WhatsApp.
5. Se crea su cuenta automáticamente; ingresa con un código enviado a su
   correo o teléfono.

**Seguridad:** ingresar un RUT nunca muestra datos de esa persona. Si el
contacto no coincide con el registrado, la cita se marca con
`requiere_revision` para que recepción la revise.

### Pagos
- La cita se marca pagada solo con confirmación del servidor (commit de
  Webpay o webhook de Mercado Pago), nunca porque el navegador volvió a la web.
- Devolución configurable (por defecto, cancelación con más de 24 h).
- En producción, cada clínica usa su propio código de comercio o cuenta.

### Ficha clínica (Chile)
- Ley 20.584 (derechos y deberes del paciente): confidencialidad y acceso del
  paciente.
- Decreto 41 del MINSAL: conservación por al menos 15 años.
- Ley 21.719 de protección de datos: los datos de salud son sensibles (vigente
  desde diciembre de 2026).
- Implementación:
  - Las atenciones firmadas no se modifican; un trigger de la base de datos lo
    impide. Las correcciones son una atención nueva con `corrige_a`.
  - Tabla de auditoría de solo inserción.
  - Diagnósticos con código CIE-10.

### WhatsApp
- **Demo:** número de prueba de Meta, gratis, hasta 5 destinatarios
  verificados. Crear un token permanente de "usuario del sistema", porque el
  token del panel caduca en 24 h.
- **Número real:** chip sin WhatsApp instalado. Las conversaciones que inicia
  el paciente son gratis; las plantillas (recordatorios) cuestan centavos de
  dólar.
- Las plantillas requieren aprobación de Meta: crearlas con anticipación.

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 0. Base | Proyecto, esquema, migraciones, datos demo, autenticación con roles, web pública inicial | ✅ Lista |
| 1. Administración | CRUD de especialidades, médicos, horarios, bloqueos y usuarios | Pendiente |
| 2. Agendamiento | Disponibilidad, reserva sin cuenta, cuenta automática, mis citas, agenda de recepción | Pendiente |
| 3. Pagos | Webpay, Mercado Pago, pago en clínica, reserva temporal, devoluciones | Pendiente |
| 4. Notificaciones | Correo y WhatsApp con botones para confirmar o cancelar | Pendiente · ⭐ demo comercial mínima |
| 5. Ficha clínica | Portal médico, antecedentes, atenciones, CIE-10, adjuntos (R2), auditoría | Pendiente · ⭐ demo completa |
| 6. Bot de WhatsApp | Agendamiento por conversación | Pendiente |
| 7. Personalización | Marca, módulos y reglas configurables desde el panel | Pendiente |

### Guion de la demo
1. Un paciente agenda desde el celular y paga con Webpay (modo prueba).
2. Le llega el WhatsApp de confirmación.
3. Responde "Confirmar" al recordatorio.
4. El médico ve al paciente en su agenda, revisa su historial y registra la
   atención.
5. El administrador agrega un médico nuevo en un minuto.
