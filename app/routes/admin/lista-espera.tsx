import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { data, Form } from "react-router";
import { z } from "zod";
import { especialidades, listaEspera, medicos, pacientes } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { formatearDia } from "~/lib/fechas";
import { formatearRut } from "~/lib/rut";
import { formatearTelefono } from "~/lib/telefono";
import { registrarAuditoria } from "~/modules/auditoria.server";
import type { Route } from "./+types/lista-espera";

export function meta() {
  return [{ title: "Lista de espera · Recepción" }];
}

const textoEstado = { activa: "Esperando", notificada: "Avisado: hora liberada", agendada: "Agendado", cancelada: "Cancelada" };

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const tutor = alias(pacientes, "tutor");
  const lista = await db
    .select({
      id: listaEspera.id,
      estado: listaEspera.estado,
      desde: listaEspera.desde,
      hasta: listaEspera.hasta,
      creadoEn: listaEspera.creadoEn,
      paciente: { nombres: pacientes.nombres, apellidos: pacientes.apellidos, rut: pacientes.rut, telefono: pacientes.telefono, email: pacientes.email },
      telefonoTutor: tutor.telefono,
      especialidad: especialidades.nombre,
      medico: medicos.apellidos,
    })
    .from(listaEspera)
    .innerJoin(pacientes, eq(pacientes.id, listaEspera.pacienteId))
    .leftJoin(tutor, eq(tutor.id, pacientes.tutorId))
    .innerJoin(especialidades, eq(especialidades.id, listaEspera.especialidadId))
    .leftJoin(medicos, eq(medicos.id, listaEspera.medicoId))
    .where(inArray(listaEspera.estado, ["activa", "notificada"]))
    .orderBy(asc(listaEspera.creadoEn));
  return {
    lista: lista.map((l) => {
      const telefono = l.paciente.telefono ?? l.telefonoTutor;
      return { ...l, rut: formatearRut(l.paciente.rut), telefono: telefono ? formatearTelefono(telefono) : null };
    }),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { db } = context.get(contextoApp);
  const usuario = context.get(contextoUsuario);
  const formulario = await request.formData();
  const id = z.uuid().safeParse(formulario.get("id")).data;
  const estado = z.enum(["agendada", "cancelada"]).safeParse(formulario.get("estado")).data;
  if (!id || !estado) return data({ error: "Acción no válida" }, { status: 400 });
  await db.update(listaEspera).set({ estado }).where(and(eq(listaEspera.id, id), inArray(listaEspera.estado, ["activa", "notificada"])));
  await registrarAuditoria(db, request, { usuarioId: usuario.id, accion: `lista_espera_${estado}`, entidad: "lista_espera", entidadId: id });
  return { error: null };
}

export default function ListaEsperaAdmin({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Lista de espera</h1>
      <p className="mt-1 text-sm text-slate-500">
        Cuando se anula o cambia una hora, se avisa automáticamente a la primera persona que calce. Aquí puedes llamar a los demás.
      </p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Paciente</th>
              <th className="px-4 py-3 font-medium">Busca</th>
              <th className="px-4 py-3 font-medium">Le sirve</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loaderData.lista.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nadie en lista de espera.</td></tr>
            )}
            {loaderData.lista.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 align-top last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{l.paciente.nombres} {l.paciente.apellidos}</p>
                  <p className="text-xs text-slate-500">{l.rut}{l.telefono && ` · ${l.telefono}`}</p>
                </td>
                <td className="px-4 py-3">{l.especialidad}{l.medico && <span className="text-slate-500"> · Dr(a). {l.medico.split(" ")[0]}</span>}</td>
                <td className="px-4 py-3">{formatearDia(l.desde)} – {formatearDia(l.hasta)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs ${l.estado === "notificada" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
                    {textoEstado[l.estado]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {(["agendada", "cancelada"] as const).map((estado) => (
                      <Form method="post" key={estado}>
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="estado" value={estado} />
                        <button className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50">
                          {estado === "agendada" ? "Ya se agendó" : "Quitar"}
                        </button>
                      </Form>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
