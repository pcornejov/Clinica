import { createRequestHandler, RouterContextProvider } from "react-router";
import { crearDb } from "../app/db/client";
import { crearAuth } from "../app/lib/auth.server";
import { contextoApp, type ContextoApp } from "../app/lib/contexto";
import { procesarCola } from "../app/modules/avisos/cola.server";
import { liberarReservasVencidas } from "../app/modules/pagos.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const { db, cerrar } = crearDb(env.DATABASE_URL);
    const context = new RouterContextProvider();
    const buzonDemo = {};
    const app: ContextoApp = { env, ctx, db, auth: crearAuth(env, db, buzonDemo), buzonDemo, tareas: [] };
    context.set(contextoApp, app);
    try {
      return await requestHandler(request, context);
    } finally {
      // La conexión se cierra cuando terminan las tareas en segundo plano.
      ctx.waitUntil(Promise.allSettled(app.tareas).then(cerrar));
    }
  },

  // Cada 5 minutos: libera horas no pagadas y envía avisos pendientes (recordatorios).
  async scheduled(controller, env, ctx) {
    const { db, cerrar } = crearDb(env.DATABASE_URL);
    const tarea = (async () => {
      try {
        const liberadas = await liberarReservasVencidas(db);
        const avisos = await procesarCola(db, env);
        console.log(`cron ${controller.cron}: ${liberadas} reservas liberadas, avisos`, avisos);
      } finally {
        await cerrar();
      }
    })();
    ctx.waitUntil(tarea);
    await tarea;
  },
} satisfies ExportedHandler<Env>;
