import { createRequestHandler, RouterContextProvider } from "react-router";
import { crearDb } from "../app/db/client";
import { crearAuth } from "../app/lib/auth.server";
import { contextoApp } from "../app/lib/contexto";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const { db, cerrar } = crearDb(env.DATABASE_URL);
    const context = new RouterContextProvider();
    context.set(contextoApp, { env, ctx, db, auth: crearAuth(env, db) });
    try {
      return await requestHandler(request, context);
    } finally {
      ctx.waitUntil(cerrar());
    }
  },

  async scheduled(controller, _env, _ctx) {
    // Fase 3: liberar reservas con pago vencido.
    // Fase 4: enviar recordatorios pendientes por correo y WhatsApp.
    console.log(`cron ${controller.cron} ejecutado`);
  },
} satisfies ExportedHandler<Env>;
