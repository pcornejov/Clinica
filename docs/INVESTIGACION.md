# Investigación: cómo funcionan las clínicas en Chile

Octubre 2026. Revisión de páginas públicas de Red de Salud UC Christus, Clínica
Santa María y Clínica Andes Salud Chillán, además del ecosistema chileno
(Fonasa/Isapre, software de la competencia, normativa). No se crearon cuentas
ni se reservaron horas: solo se miraron los formularios iniciales de reserva.

## 1. El flujo de reserva estándar

El formulario inicial de reserva es casi idéntico en Andes Salud y Santa María:

| Paso | Andes Salud Chillán | Clínica Santa María |
|---|---|---|
| Tipo de atención | Pestañas: Hora médica · Imagenología · Procedimientos | Pestañas: Consultas · Dental · Telemedicina · Exámenes |
| Identificación | **RUT del paciente "(Invitado)"** o iniciar sesión | **RUT del paciente** |
| Búsqueda | Sucursal → Especialidad → Especialista (opcional) → Previsión (opcional) | Modo: **Especialidad · Profesional · Express** → Especialidad → Sucursal |
| Sin RUT | — | Extranjeros: por teléfono o correo, presentando pasaporte |
| WhatsApp | Botón "¿Quieres agendar una hora?" (asistente con nombre propio) | Botón "Agenda tu hora por WhatsApp" |

Fuentes: `reservaweb.andessaludchillan.cl/agenda_web/` y
`clinicasantamaria.cl/reserva-de-horas`.

**Conclusiones:**
- **El RUT va primero y la reserva es como invitado**, sin cuenta. Es lo mismo
  que definimos en el plan.
- Se puede buscar por **especialidad**, por **profesional** o en modo
  **"Express"**. Express probablemente muestra la primera hora disponible; es
  una inferencia.
- La **previsión** se pide al buscar porque no todos los médicos atienden con
  bono Fonasa.
- **WhatsApp para agendar ya es un estándar**: las dos clínicas lo ofrecen.
- Exámenes e imágenes se reservan en un flujo separado de las consultas.

## 2. Pago

- **Consulta presencial:** en las tres clínicas se paga en la clínica el día de
  la atención. Con Fonasa se compra el bono electrónico con huella vía **IMED**
  en admisión. No se vio pago online obligatorio al reservar.
- **Telemedicina:** se paga online. En UC Christus el correo de confirmación
  trae un link de Webpay; en Andes, Fonasa bonifica en línea y se cobra el
  copago.
- **Pago de cuentas online** separado de la reserva: Webpay en las tres y
  trytoku en Andes.
- **Boleta electrónica** para que el paciente pida el reembolso a su Isapre
  (UC Christus).
- **IMED y Medipass** no tienen una API pública para software de agenda.
  Integrarse con ellos es un convenio comercial.

## 3. Confirmación, recordatorios y cancelación

- **Confirmación por correo**, con link para anular o reagendar (telemedicina
  en UC Christus y Andes).
- **Recordatorios presenciales:** ninguna de las tres clínicas los publica.
- **Competencia (Medilink):** recordatorio por WhatsApp con link para confirmar
  o anular; la agenda se actualiza sola. **Es lo que las clínicas ya esperan.**
- **Reclamos recurrentes** en las tres: dificultad para anular o reagendar por
  teléfono y caídas del agendador. Es una oportunidad para ofrecer
  autoservicio simple y confiable.

## 4. Portal o app del paciente

Funciones comunes (app "Mi Andes Salud", "Mi Clínica" de Santa María, Portal
Paciente de UC Christus):
- Mis citas: agendar, ver, anular.
- Resultados de exámenes e informes de imagenología, para descargar.
- Recetas, órdenes de examen y documentos entregados por el médico.
- **Grupo familiar o cargas**: un perfil administra a los hijos y otros
  dependientes.
- Historial de atenciones.
- Pago de cuentas.

## 5. Normativa y ecosistema

| Tema | Hallazgo | Fuente |
|---|---|---|
| Ficha clínica | Ley 20.584 y Decreto 41/2012: contenido, reserva, conservación de 15 años | Confirmado |
| Datos personales | Ley 21.719 vigente desde el 1-dic-2026; los datos de salud son sensibles y requieren consentimiento expreso. Hay un proyecto para postergarla, no confirmado | Confirmado / por verificar |
| Receta electrónica | Desde nov-2025 basta un sistema validado con ClaveÚnica, sin firma electrónica avanzada | Fuente secundaria, verificar |
| Licencia médica | Va por operadores (IMED y otros); es una integración aparte | Confirmado |
| Precios | La Ley 20.584 exige informar el valor de las atenciones | Confirmado |
| WhatsApp | No hay norma específica. Recomendación: mensajes mínimos (fecha, hora, profesional) sin diagnósticos, y guardar el consentimiento de contacto | Inferencia |
| Tributario | El médico independiente emite boleta de honorarios; qué emite la clínica hay que validarlo con un contador | Parcial |

## 6. Cambios propuestos al plan

1. **Formulario de reserva al estilo de las clínicas grandes**: RUT, luego
   especialidad o profesional o "primera hora disponible", y previsión
   opcional.
2. **Pago:** mantener la opción online, pero el **pago en la clínica es el
   caso principal**. En caja se registra el medio de pago (bono Fonasa, bono
   Isapre, particular o convenio) junto con el folio y el monto del bono, sin
   integrarse con IMED.
3. **Recordatorio por WhatsApp con botones Confirmar / Anular**, y anular o
   reagendar desde el link del correo, sin llamar a nadie.
4. **Grupo familiar:** reservar para un hijo o dependiente con su RUT, usando
   el contacto del tutor. Es imprescindible para pediatría.
5. **Sucursales** en el modelo de datos desde ya. Si la clínica tiene una sola
   sede, el selector no se muestra.
6. **Sobrecupo:** recepción puede agendar fuera de los cupos normales,
   marcando la cita como sobrecupo.
7. **Consentimiento de contacto** (correo y WhatsApp) guardado al reservar,
   por la Ley 21.719.
8. **Para más adelante:** lista de espera, reserva de exámenes y
   procedimientos, box o sala, convenios, receta electrónica, boletas e
   integración con IMED.
