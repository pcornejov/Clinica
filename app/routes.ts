import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  // Web pública
  layout("routes/publico/layout.tsx", [
    index("routes/publico/inicio.tsx"),
    route("especialidades", "routes/publico/especialidades.tsx"),
    route("medicos", "routes/publico/medicos.tsx"),
    route("agendar", "routes/publico/agendar.tsx"),
    route("agendar/confirmar", "routes/publico/agendar-confirmar.tsx"),
    route("agendar/lista-espera", "routes/publico/lista-espera.tsx"),
    route("cita/:token", "routes/publico/cita.tsx"),
    route("cita/:token/reagendar", "routes/publico/cita-reagendar.tsx"),
  ]),

  // Sesión
  route("ingresar", "routes/ingresar.tsx"),
  route("ingresar/paciente", "routes/ingresar-paciente.tsx"),
  route("salir", "routes/salir.tsx"),
  route("api/auth/*", "routes/api.auth.ts"),

  // Backoffice (administración y recepción)
  ...prefix("admin", [
    layout("routes/admin/layout.tsx", [
      index("routes/admin/inicio.tsx"),
      route("agenda", "routes/admin/agenda.tsx"),
      route("lista-espera", "routes/admin/lista-espera.tsx"),
      route("especialidades", "routes/admin/especialidades.tsx"),
      route("medicos", "routes/admin/medicos.tsx"),
      route("medicos/nuevo", "routes/admin/medico-nuevo.tsx"),
      route("medicos/:id", "routes/admin/medico.tsx"),
      route("usuarios", "routes/admin/usuarios.tsx"),
    ]),
    route("pacientes/buscar", "routes/admin/pacientes-buscar.ts"),
  ]),

  // Portal médico
  ...prefix("medico", [layout("routes/medico/layout.tsx", [index("routes/medico/inicio.tsx")])]),

  // Portal del paciente
  ...prefix("mi-cuenta", [
    layout("routes/paciente/layout.tsx", [index("routes/paciente/inicio.tsx")]),
  ]),
] satisfies RouteConfig;
