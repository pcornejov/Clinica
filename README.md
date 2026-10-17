# Clínica

Sistema web para clínicas: agenda en línea, administración del personal, fichas
clínicas y avisos por correo y WhatsApp. El plan completo está en
[docs/PLAN.md](docs/PLAN.md).

**Stack:** React Router v8 sobre Cloudflare Workers · PostgreSQL (Neon) ·
Drizzle · Better Auth · Tailwind CSS.

## Desarrollo local

Requisitos: Node 22.22 o superior y un PostgreSQL (local o una base en Neon).

```bash
npm install
cp .dev.vars.example .dev.vars   # completar DATABASE_URL y BETTER_AUTH_SECRET
npm run db:migrate               # crea las tablas
npm run db:seed                  # carga los datos demo
npm run dev                      # http://localhost:5173
```

`npm run db:reset` borra todo, migra y vuelve a cargar los datos demo (solo
funciona con una base de datos en `localhost`).

### Usuarios demo

Contraseña de todos: `Demo1234!`

| Correo | Rol |
|---|---|
| `admin@example.com` | Administración (mantenedores de médicos, especialidades y usuarios) |
| `recepcion@example.com` | Recepción (solo resumen y agenda) |
| `camila.rojas@example.com` | Médico (los demás: `nombre.apellido@example.com`) |
| `paciente@example.com` | Paciente (también puede ingresar en `/ingresar/paciente` con código) |

## Pagos y avisos

Webpay, correo y WhatsApp funcionan sin configuración (modo simulado) y se
activan con sus credenciales. Ver [docs/INTEGRACIONES.md](docs/INTEGRACIONES.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (corre en el runtime de Cloudflare) |
| `npm run typecheck` | Genera tipos y revisa TypeScript |
| `npm test` | Tests unitarios (Vitest) |
| `npm run db:generate` | Genera una migración a partir de `app/db/schema.ts` |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run deploy` | Compila y publica en Cloudflare |

## Publicar en Cloudflare (gratis)

1. Crear una cuenta en [Neon](https://neon.tech) y un proyecto. Copiar la
   *connection string*.
2. Aplicar migraciones y datos demo contra Neon:
   `DATABASE_URL="postgresql://…neon.tech/…" npm run db:migrate` y lo mismo
   con `npm run db:seed`.
3. Crear una cuenta en [Cloudflare](https://dash.cloudflare.com) e iniciar
   sesión con `npx wrangler login`.
4. Cargar los secretos:
   `npx wrangler secret put DATABASE_URL` y
   `npx wrangler secret put BETTER_AUTH_SECRET`.
5. En `wrangler.jsonc`, cambiar `APP_URL` por la URL final
   (`https://clinica.<tu-subdominio>.workers.dev`).
6. `npm run deploy`.

## Estructura

```
app/
  config/clinica.ts   Marca, módulos activos y reglas de la clínica
  db/                 Esquema Drizzle y conexión
  lib/                RUT, fechas (zona horaria de Chile), auth, sesión
  routes/             publico/ · admin/ · medico/ · paciente/
  components/         Componentes compartidos
workers/app.ts        Entrada del Worker (peticiones + cron)
drizzle/              Migraciones SQL (0001 = reglas de integridad)
scripts/              Datos demo y reinicio de la base local
```
