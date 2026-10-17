import { asc, eq, or } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";
import { z } from "zod";
import { Aviso, Boton, Campo, CampoTexto, Casilla, Seccion } from "~/components/formulario";
import { especialidades, medicoEspecialidades, medicos, user } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { validar, type Errores } from "~/lib/formularios";
import { normalizarRut, validarRut } from "~/lib/rut";
import { requerirRol } from "~/lib/sesion.server";
import { registrarAuditoria } from "~/modules/auditoria.server";
import { esquemaMedico } from "~/modules/medicos";
import { crearUsuarioPersonal } from "~/modules/personal.server";
import type { Route } from "./+types/medico-nuevo";

export const middleware: Route.MiddlewareFunction[] = [requerirRol("admin")];

export function meta() {
  return [{ title: "Nuevo médico · Administración" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const lista = await db
    .select({ id: especialidades.id, nombre: especialidades.nombre })
    .from(especialidades)
    .where(eq(especialidades.activa, true))
    .orderBy(asc(especialidades.nombre));
  return { especialidades: lista };
}

const esquemaAlta = esquemaMedico.extend({
  rut: z.string().refine(validarRut, "RUT inválido").transform((v) => normalizarRut(v)!),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  especialidades: z.array(z.uuid()).min(1, "Elige al menos una especialidad"),
});

export async function action({ request, context }: Route.ActionArgs) {
  const { db } = context.get(contextoApp);
  const admin = context.get(contextoUsuario);
  const formulario = await request.formData();

  const resultado = validar(esquemaAlta, formulario, ["especialidades"]);
  if (!resultado.ok) return data({ errores: resultado.errores }, { status: 400 });
  const d = resultado.datos;

  const errores: Errores = {};
  const [repetidoMedico] = await db.select({ id: medicos.id }).from(medicos).where(or(eq(medicos.rut, d.rut), eq(medicos.email, d.email)));
  if (repetidoMedico) errores.rut = "Ya existe un médico con ese RUT o correo";
  const [repetidoUsuario] = await db.select({ id: user.id }).from(user).where(eq(user.email, d.email));
  if (repetidoUsuario) errores.email = "Ya existe un usuario con ese correo";
  if (Object.keys(errores).length) return data({ errores }, { status: 400 });

  // Neon por HTTP no permite transacciones: si falla un paso, se deshace el usuario creado.
  const userId = await crearUsuarioPersonal(db, {
    nombre: `${d.nombres} ${d.apellidos}`,
    email: d.email,
    rol: "medico",
    password: d.password,
  });
  try {
    const [medico] = await db
      .insert(medicos)
      .values({
        userId,
        rut: d.rut,
        nombres: d.nombres,
        apellidos: d.apellidos,
        email: d.email,
        telefono: d.telefono,
        registroSis: d.registroSis,
        biografia: d.biografia,
        atiendeFonasa: d.atiendeFonasa,
      })
      .returning({ id: medicos.id });
    await db
      .insert(medicoEspecialidades)
      .values(d.especialidades.map((especialidadId) => ({ medicoId: medico.id, especialidadId })));
    await registrarAuditoria(db, request, {
      usuarioId: admin.id,
      accion: "crear",
      entidad: "medico",
      entidadId: medico.id,
      detalle: { nombre: `${d.nombres} ${d.apellidos}` },
    });
    return redirect(`/admin/medicos/${medico.id}?nuevo=1`);
  } catch (error) {
    await db.delete(user).where(eq(user.id, userId));
    throw error;
  }
}

export default function MedicoNuevo({ loaderData, actionData }: Route.ComponentProps) {
  const errores = (actionData as { errores?: Errores } | undefined)?.errores ?? {};
  return (
    <>
      <Link to="/admin/medicos" className="text-sm text-marca-700 hover:underline">
        ← Médicos
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Nuevo médico</h1>

      <Form method="post" className="mt-6 space-y-6">
        <Seccion titulo="Datos personales">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombres" name="nombres" error={errores.nombres} required />
            <Campo etiqueta="Apellidos" name="apellidos" error={errores.apellidos} required />
            <Campo etiqueta="RUT" name="rut" placeholder="12.345.678-5" error={errores.rut} required />
            <Campo etiqueta="Registro Superintendencia de Salud" name="registroSis" ayuda="Opcional" />
            <Campo etiqueta="Teléfono" name="telefono" type="tel" />
            <Casilla etiqueta="Atiende con bono Fonasa" name="atiendeFonasa" defaultChecked className="self-end pb-2" />
          </div>
          <CampoTexto etiqueta="Presentación" name="biografia" className="mt-4" ayuda="Se muestra en la web pública" />
        </Seccion>

        <Seccion titulo="Especialidades" descripcion="Puede tener más de una.">
          {errores.especialidades && <Aviso tipo="error">{errores.especialidades}</Aviso>}
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {loaderData.especialidades.map((e) => (
              <Casilla key={e.id} etiqueta={e.nombre} name="especialidades" value={e.id} />
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Acceso al sistema" descripcion="El médico ingresa con su correo para ver su agenda y fichas.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Correo" name="email" type="email" error={errores.email} required />
            <Campo
              etiqueta="Contraseña inicial"
              name="password"
              type="text"
              autoComplete="off"
              error={errores.password}
              ayuda="Mínimo 8 caracteres. Entrégasela al médico."
              required
            />
          </div>
        </Seccion>

        <div className="flex justify-end gap-3">
          <Link to="/admin/medicos" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
            Cancelar
          </Link>
          <Boton>Crear médico</Boton>
        </div>
      </Form>
    </>
  );
}
