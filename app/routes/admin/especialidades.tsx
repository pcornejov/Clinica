import { asc, eq } from "drizzle-orm";
import { data, Form } from "react-router";
import { z } from "zod";
import { Aviso, Boton, Campo, CampoSelect, CampoTexto, Casilla, type ResultadoAccion } from "~/components/formulario";
import { especialidades } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { formatearPesos } from "~/lib/fechas";
import { casilla, esViolacionUnica, textoOpcional, validar } from "~/lib/formularios";
import { requerirRol } from "~/lib/sesion.server";
import { slugify } from "~/lib/texto";
import { registrarAuditoria } from "~/modules/auditoria.server";
import type { Route } from "./+types/especialidades";

export const middleware: Route.MiddlewareFunction[] = [requerirRol("admin")];

export function meta() {
  return [{ title: "Especialidades · Administración" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  return { lista: await db.select().from(especialidades).orderBy(asc(especialidades.nombre)) };
}

const esquema = z.object({
  nombre: z.string().trim().min(2, "Ingresa el nombre"),
  descripcion: textoOpcional,
  duracionMinutos: z.coerce.number("Ingresa la duración").int().min(5, "Mínimo 5 minutos").max(240, "Máximo 240 minutos"),
  precio: z.coerce.number("Ingresa el precio").int().min(0, "No puede ser negativo"),
  activa: casilla,
});

export async function action({ request, context }: Route.ActionArgs) {
  const { db } = context.get(contextoApp);
  const usuario = context.get(contextoUsuario);
  const formulario = await request.formData();
  const intencion = formulario.get("intent");
  const id = String(formulario.get("id") ?? "");
  const seccion = intencion === "crear" ? "nueva" : id;

  const resultado = validar(esquema, formulario);
  if (!resultado.ok) {
    return data<ResultadoAccion>({ seccion, errores: resultado.errores }, { status: 400 });
  }
  const { nombre, descripcion, duracionMinutos, precio, activa } = resultado.datos;

  try {
    if (intencion === "crear") {
      const [creada] = await db
        .insert(especialidades)
        .values({ nombre, slug: slugify(nombre), descripcion, duracionMinutos, precio, activa })
        .returning({ id: especialidades.id });
      await registrarAuditoria(db, request, {
        usuarioId: usuario.id,
        accion: "crear",
        entidad: "especialidad",
        entidadId: creada.id,
        detalle: { nombre },
      });
      return data<ResultadoAccion>({ seccion: "nueva", ok: `Especialidad "${nombre}" creada` });
    }

    if (intencion === "actualizar" && z.uuid().safeParse(id).success) {
      await db
        .update(especialidades)
        .set({ nombre, descripcion, duracionMinutos, precio, activa })
        .where(eq(especialidades.id, id));
      await registrarAuditoria(db, request, {
        usuarioId: usuario.id,
        accion: "actualizar",
        entidad: "especialidad",
        entidadId: id,
        detalle: { nombre, precio, duracionMinutos, activa },
      });
      return data<ResultadoAccion>({ seccion: id, ok: "Cambios guardados" });
    }
  } catch (error) {
    if (esViolacionUnica(error)) {
      return data<ResultadoAccion>(
        { seccion, errores: { nombre: "Ya existe una especialidad con ese nombre" } },
        { status: 400 },
      );
    }
    throw error;
  }
  return data<ResultadoAccion>({ seccion, error: "Acción no válida" }, { status: 400 });
}

type Fila = Route.ComponentProps["loaderData"]["lista"][number];

function FormularioEspecialidad({
  fila,
  resultado,
}: {
  fila?: Fila;
  resultado?: ResultadoAccion;
}) {
  const errores = resultado?.errores ?? {};
  return (
    <Form method="post" className="space-y-4">
      <input type="hidden" name="intent" value={fila ? "actualizar" : "crear"} />
      {fila && <input type="hidden" name="id" value={fila.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" name="nombre" defaultValue={fila?.nombre} error={errores.nombre} required />
        <div className="grid grid-cols-2 gap-4">
          <Campo
            etiqueta="Duración (min)"
            name="duracionMinutos"
            type="number"
            defaultValue={fila?.duracionMinutos ?? 30}
            error={errores.duracionMinutos}
          />
          <Campo
            etiqueta="Precio (CLP)"
            name="precio"
            type="number"
            defaultValue={fila?.precio ?? ""}
            error={errores.precio}
          />
        </div>
      </div>
      <CampoTexto etiqueta="Descripción" name="descripcion" defaultValue={fila?.descripcion ?? ""} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Casilla etiqueta="Visible y disponible para agendar" name="activa" defaultChecked={fila?.activa ?? true} />
        <div className="flex items-center gap-3">
          {resultado?.ok && <Aviso tipo="ok">{resultado.ok}</Aviso>}
          {resultado?.error && <Aviso tipo="error">{resultado.error}</Aviso>}
          <Boton>{fila ? "Guardar" : "Crear especialidad"}</Boton>
        </div>
      </div>
    </Form>
  );
}

export default function Especialidades({ loaderData, actionData }: Route.ComponentProps) {
  const resultado = actionData as ResultadoAccion | undefined;
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Especialidades</h1>

      <details className="mt-6 rounded-xl border border-slate-200 bg-white" open={resultado?.seccion === "nueva" && !resultado.ok}>
        <summary className="cursor-pointer px-6 py-4 font-medium text-marca-700">+ Nueva especialidad</summary>
        <div className="border-t border-slate-100 p-6">
          {/* La clave cambia al crear una especialidad: así el formulario se limpia. */}
          <FormularioEspecialidad
            key={loaderData.lista.length}
            resultado={resultado?.seccion === "nueva" ? resultado : undefined}
          />
        </div>
      </details>

      <div className="mt-6 space-y-4">
        {loaderData.lista.map((fila) => (
          <details
            key={fila.id}
            className="rounded-xl border border-slate-200 bg-white"
            open={resultado?.seccion === fila.id}
          >
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-6 py-4">
              <span className="font-medium text-slate-900">
                {fila.nombre}
                {!fila.activa && (
                  <span className="ml-3 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-normal text-slate-500">
                    Inactiva
                  </span>
                )}
              </span>
              <span className="text-sm text-slate-500">
                {fila.duracionMinutos} min · {formatearPesos(fila.precio)}
              </span>
            </summary>
            <div className="border-t border-slate-100 p-6">
              <FormularioEspecialidad fila={fila} resultado={resultado?.seccion === fila.id ? resultado : undefined} />
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
