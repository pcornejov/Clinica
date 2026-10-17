# CLAUDE.md — Sistema para clínicas

Guía para continuar el desarrollo con Claude Code. Léela completa antes de
cambiar código. Plan y decisiones: `docs/PLAN.md`. Investigación de clínicas
chilenas: `docs/INVESTIGACION.md`. Webpay, correo y WhatsApp:
`docs/INTEGRACIONES.md`.

## Qué es

Prototipo para presentar a clínicas chilenas y luego adaptarlo a cada una
(una instalación y una base de datos por clínica). Lo desarrolla y mantiene una
sola persona. Todo el texto de la interfaz, el código de dominio y los
comentarios están **en español de Chile**. El usuario conversa en español.

Módulos: web pública, agendamiento en línea, portal del paciente, backoffice
(admin y recepción), portal médico con ficha clínica, pagos (caja y Webpay) y
avisos por correo y WhatsApp.

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Base, esquema, auth con roles, datos demo | ✅ |
| 1 | Mantenedores: especialidades, médicos, horarios, bloqueos, usuarios | ✅ |
| 2 | Agendamiento web, cuenta de paciente, agenda de recepción, sobrecupo, lista de espera | ✅ |
| 3 | Pagos: caja (bonos con folio, efectivo, etc.) y Webpay Plus | ✅ |
| 4 | Avisos por correo (Resend) y WhatsApp (Meta), con botones de confirmar/anular | ✅ |
| 5 | Ficha clínica: atenciones, CIE-10, firma inmutable, correcciones, adjuntos R2, auditoría | ✅ |
| 6 | Bot de WhatsApp para agendar conversando | Pendiente |
| 7 | Personalización por clínica desde el panel (marca, módulos, reglas) | Pendiente |

**Pendientes antes de usarlo con pacientes reales**
- Publicar: Neon + Cloudflare. Los pasos están en el README.
- Probar Webpay contra el ambiente de integración real de Transbank. Desde el
  servidor de desarrollo original su firewall bloqueaba las peticiones, así que
  solo se probó con el modo `simulado`.
- Poner `MOSTRAR_CODIGOS_DEMO` en `"false"` cuando haya correo real.
- Proteger formularios públicos con Cloudflare Turnstile y limitar reservas por RUT/IP.
- Importar el CIE-10 completo del DEIS-MINSAL (`npm run db:cie10 -- archivo.csv`).
  Hoy hay un catálogo básico de 116 códigos.
- Validar con profesionales: receta electrónica (ClaveÚnica), vigencia de la
  Ley 21.719 y tema tributario (boletas).

## Stack

- **React Router v8** (framework mode, SSR) sobre **Cloudflare Workers**,
  con `@cloudflare/vite-plugin`. Vite 8, TypeScript 7, Tailwind CSS v4.
- **PostgreSQL**: Neon (driver HTTP) en producción; Postgres local con
  `postgres.js` en desarrollo. Lo decide `app/db/client.ts` según la URL.
- **Drizzle ORM** con migraciones SQL en `drizzle/`.
- **Better Auth**: el personal ingresa con contraseña (hash PBKDF2 nativo,
  `app/lib/password.ts`) y los pacientes con un código por correo (email OTP).
- **Zod 4** para validar todo lo que entra.
- Cron de Workers cada 5 min (`workers/app.ts` → `scheduled`); archivos en R2.

## Puesta en marcha en un PC nuevo

Requisitos: **Node 22.22 o superior**, **PostgreSQL 16** (instalado o con
Docker) y **psql** (lo usan las pruebas e2e).

```bash
npm install
docker compose up -d                 # Postgres local (o usa uno instalado)
cp .dev.vars.example .dev.vars       # y completa los valores (ver abajo)
npm run db:migrate
npm run db:seed
npm run dev                          # http://localhost:5173
```

Para desarrollo local, `.dev.vars` necesita como mínimo:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/clinica
BETTER_AUTH_SECRET=<openssl rand -base64 32>
TRANSBANK_MODO=simulado
```
Para correr las pruebas e2e, agrega `APP_URL=http://localhost:4173`.

Usuarios demo (contraseña `Demo1234!`): `admin@example.com`,
`recepcion@example.com`, `camila.rojas@example.com` (médico; los demás médicos
siguen el patrón `nombre.apellido@example.com`) y `paciente@example.com`.
El paciente también entra en `/ingresar/paciente` con un código; en modo demo
el código se muestra en pantalla.

## Comandos

| Comando | Para qué |
|---|---|
| `npm run dev` | Desarrollo (runtime real de Workers vía Vite) |
| `npm run typecheck` | `wrangler types` + `react-router typegen` + `tsc`. **Correrlo tras cambiar rutas, `wrangler.jsonc` o `.dev.vars`** |
| `npm test` | Tests unitarios (Vitest) |
| `npm run db:generate` | Genera una migración desde `app/db/schema.ts` |
| `npm run db:generate -- --custom --name x` | Migración SQL manual (triggers, constraints) |
| `npm run db:migrate` | Aplica migraciones |
| `npm run db:reset` | Borra todo, migra y carga los datos demo (solo localhost) |
| `npm run preview:e2e` | Compila y sirve en :4173 para las pruebas e2e |
| `npm run e2e` | Pruebas de punta a punta (otra terminal con `preview:e2e` corriendo) |
| `npm run e2e -- fase5` | Una sola suite |
| `npm run deploy` | Publica en Cloudflare |

Las pruebas e2e (`e2e/*.mjs`) usan Playwright (`playwright-core`). La primera
vez, instala Chromium con `npx playwright-core install chromium`, o define
`CHROMIUM_PATH`. Cada suite reinicia la base de datos. Son scripts propios, no
`@playwright/test`: imprimen ✔/✘ por verificación y guardan capturas en
`e2e/capturas/`. **Antes de dar por terminada una fase, corre todas las suites.**

## Estructura

```
app/
  config/clinica.ts        Marca, módulos y reglas (anticipación, devolución, etc.)
  db/schema.ts             Esquema Drizzle (fuente de verdad)
  db/client.ts             Conexión (Neon HTTP o postgres.js)
  lib/                     RUT, fechas (America/Santiago), teléfono, auth, sesión,
                           token de gestión de citas, formularios (validar + Zod)
  modules/                 Lógica de negocio (sin JSX)
    disponibilidad.ts      Cálculo de cupos (función pura, con tests)
    citas.server.ts        Buscar cupos, crear/anular/reagendar, lista de espera
    pagos.server.ts        Webpay, caja, devoluciones, liberar reservas
    webpay.server.ts       Cliente Transbank (integración/producción/simulado)
    avisos/                Plantillas, programación, cola de envío, respuestas WhatsApp
    fichas.server.ts       Acceso a fichas, historial, atenciones, CIE-10
    pacientes.server.ts    Alta/búsqueda de pacientes, cuentas
  routes/
    publico/               Web pública, agendar, cita (link de gestión), lista de espera
    pago/                  Webpay: ir, retorno, simulador
    admin/                 Backoffice (admin y recepción)
    medico/                Portal médico y ficha clínica
    paciente/              Mis citas
  routes.ts                Tabla de rutas (se edita a mano)
workers/app.ts             Entrada del Worker: fetch + cron
drizzle/                   Migraciones (0001 y 0004 son SQL manual: constraints y triggers)
scripts/                   seed, reset, importar CIE-10
e2e/                       Pruebas de punta a punta
```

## Convenciones

- **Nombres de dominio en español** (`citas`, `pacientes`, `crearCita`,
  `formatearRut`). Las tablas de Better Auth (`user`, `session`, `account`,
  `verification`) quedan en inglés porque las exige la librería.
- **Rutas delgadas**: loader y action validan, llaman a `app/modules/*` y
  devuelven datos. La lógica vive en los módulos.
- **Un archivo `*.server.ts` no puede importarse desde componentes.** React
  Router solo quita del bundle del navegador lo que usan
  `loader`/`action`/`middleware`. Si un componente necesita una función, va en
  un módulo sin `.server` (ejemplo: `modules/clinico.ts`).
- **No importar entre archivos de rutas.** Lo compartido va en `modules/` o `components/`.
- **Contexto por petición**: `context.get(contextoApp)` entrega `{ db, env, auth, ctx }`.
  El usuario autenticado está en `context.get(contextoUsuario)`, que lo pone el
  middleware `requerirRol(...)` del layout o de la ruta.
- **Formularios**:
  - `validar(esquemaZod, formData, ["camposMultiples"])` de `lib/formularios.ts`.
  - Varias acciones por página con un `<input name="intent">`.
  - Respuestas `ResultadoAccion` `{ seccion, ok?, error?, errores? }`.
  - Componentes `Campo`, `CampoSelect`, `CampoTexto`, `Casilla`, `Boton`,
    `Aviso` y `Seccion` (`components/formulario.tsx`).
- **Fechas**:
  - La agenda se define en hora de Chile; la base guarda `timestamptz`.
  - Usa siempre `aInstante(fecha, hora)`, `fechaLocal`, `formatearFechaHora` y
    `formatearDia` de `lib/fechas.ts`, que manejan el cambio de horario.
  - Nunca uses `new Date("2026-10-20T09:00")` sin zona.
- **Dinero** en CLP como enteros. **RUT** normalizado `12345678-5` en la base
  (`normalizarRut`) y con puntos al mostrarlo (`formatearRut`). **Teléfonos** en
  E.164 (`normalizarTelefono`).
- **Auditoría**: toda acción relevante del personal llama a
  `registrarAuditoria(...)`. La tabla es de solo inserción (trigger).
- **Tareas después de responder**: usa `enSegundoPlano(app, promesa)`, por
  ejemplo para enviar avisos con `procesarCola`. No llames
  `ctx.waitUntil` directo: el Worker cierra la conexión a la base cuando esas
  tareas terminan.
- **Comentarios**: breves, en español, explicando el porqué. Los de módulos y
  funciones públicas van con `/** */`.

## Reglas de negocio y seguridad que no se deben romper

- **Doble agendamiento**: la restricción `EXCLUDE` de `citas_sin_superposicion`
  (en `drizzle/0001`) es la última defensa; los sobrecupos quedan fuera de ella.
  Además, el servidor siempre revalida que la hora pedida sea un cupo real
  (`buscarCupos`).
- **RUT ajeno**: reservar con un RUT existente **nunca** sobrescribe sus datos.
  Solo se completan campos vacíos y, si el contacto no coincide, la cita se
  marca `requiereRevision`. Las cuentas se vinculan con el correo **registrado**,
  no con el recién escrito.
- **Link de gestión de cita**: `/cita/<id>.<firma HMAC>`, firmado con
  `BETTER_AUTH_SECRET` (`lib/token-gestion.server.ts`). No exponer ids de cita
  sin firma.
- **Pagos**:
  - Una cita se marca pagada solo con el commit del servidor.
  - El retorno de Webpay es idempotente: el pago se "toma" con
    `detalle.confirmando` antes de confirmarlo.
  - Las actualizaciones son condicionales (`WHERE estado = 'pendiente'`) porque
    Neon HTTP no tiene transacciones.
- **Avisos**:
  - Sin información clínica en correos ni WhatsApp.
  - WhatsApp solo con `consentimientoContactoEn`.
  - La cola toma los avisos con `FOR UPDATE SKIP LOCKED`.
  - Las respuestas de WhatsApp exigen tres cosas: firma de Meta, token firmado
    de la cita y celular registrado.
- **Ficha clínica (Ley 20.584)**:
  - Solo el rol `medico` la ve.
  - Un médico accede a pacientes con cita o atención suya. Para otros debe
    declarar un motivo (acceso excepcional, 12 h, auditado).
  - Atenciones y diagnósticos firmados son inmutables por trigger (`drizzle/0001`
    y `0004`). Para corregir se crea una atención nueva con `corrigeA`. Nunca
    borrar.
  - Los adjuntos se validan por sus bytes (`tipoReal`) y su descarga queda auditada.

## Trampas conocidas

- React Router v8: el middleware siempre está activo y `context` es un
  `RouterContextProvider`. Los tipos de cada ruta salen de `./+types/<archivo>`,
  que se regeneran con `npx react-router typegen`.
- `wrangler types` genera `worker-configuration.d.ts` (ignorado por git) a
  partir de `wrangler.jsonc` y `.dev.vars`. Si `Env` no tiene una variable,
  regenera los tipos.
- Las migraciones de Drizzle no expresan constraints `EXCLUDE` ni triggers:
  van en migraciones `--custom`. El seed inserta los diagnósticos **antes** de
  firmar cada atención, porque el trigger lo exige.
- En `vite preview`, el cron se dispara con
  `curl "http://localhost:4173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*"`.
- El plan gratuito de Workers limita a 10 ms de CPU por petición y 3 MB de
  bundle comprimido. Hoy pesa ~680 KB; revisa con
  `npx wrangler deploy --dry-run`. Evita dependencias pesadas.
- Sin `RESEND_API_KEY` o `WHATSAPP_TOKEN`, los canales funcionan en modo
  simulado y todo queda visible en **Panel → Avisos**.
- Con `TRANSBANK_MODO=simulado`, el pago usa `/pago/simulador`, rotulado como
  demostración. No le pongas marca de Transbank.

## Cómo trabajar en este proyecto

1. Antes de una fase nueva, conversa el alcance con el usuario y anota las
   decisiones en `docs/PLAN.md`.
2. Lógica pura → función con test en Vitest. Flujos → suite nueva o ampliada en `e2e/`.
3. Antes de commitear:
   - `npm run typecheck` y `npm test`;
   - `npm run build`;
   - las suites e2e afectadas (idealmente todas).
4. Revisa visualmente las pantallas nuevas con las capturas en `e2e/capturas/`,
   también en ancho de celular (390 px).
5. Commits en español, describiendo qué y por qué.
