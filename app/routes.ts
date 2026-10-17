import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  // Web pública
  layout("routes/publico/layout.tsx", [
    index("routes/publico/inicio.tsx"),
    route("especialidades", "routes/publico/especialidades.tsx"),
    route("medicos", "routes/publico/medicos.tsx"),
  ]),

  // Sesión
  route("ingresar", "routes/ingresar.tsx"),
  route("salir", "routes/salir.tsx"),
  route("api/auth/*", "routes/api.auth.ts"),

  // Backoffice (administración y recepción)
  ...prefix("admin", [layout("routes/admin/layout.tsx", [index("routes/admin/inicio.tsx")])]),

  // Portal médico
  ...prefix("medico", [layout("routes/medico/layout.tsx", [index("routes/medico/inicio.tsx")])]),

  // Portal del paciente
  ...prefix("mi-cuenta", [
    layout("routes/paciente/layout.tsx", [index("routes/paciente/inicio.tsx")]),
  ]),
] satisfies RouteConfig;
