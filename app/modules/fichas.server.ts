import { and, asc, desc, eq, gt, ilike, inArray, ne, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "~/db/client";
import {
  adjuntos,
  atenciones,
  auditoria,
  cie10,
  citas,
  diagnosticos,
  especialidades,
  fichasClinicas,
  medicos,
  pacientes,
  type SignosVitales,
} from "~/db/schema";
import { normalizarBusqueda } from "~/db/cie10-basico";
import { registrarAuditoria } from "./auditoria.server";

export { edad, imc } from "./clinico";

export type Medico = typeof medicos.$inferSelect;
export type Atencion = typeof atenciones.$inferSelect;

/** Horas que dura un acceso excepcional declarado. */
const HORAS_ACCESO_EXCEPCIONAL = 12;

export async function medicoDeUsuario(db: Db, userId: string): Promise<Medico> {
  const [medico] = await db.select().from(medicos).where(eq(medicos.userId, userId));
  if (!medico) throw new Response("El usuario no está asociado a un médico", { status: 403 });
  return medico;
}

/**
 * Ley 20.584: la ficha solo la ven quienes participan en la atención. Un médico
 * accede si tiene o tuvo una cita con el paciente o lo atendió. Si no, debe
 * declarar un motivo (acceso excepcional), que queda en la auditoría y dura
 * unas horas.
 */
export async function tipoAcceso(
  db: Db,
  medico: Medico,
  userId: string,
  pacienteId: string,
): Promise<"tratante" | "excepcional" | null> {
  const [cita] = await db
    .select({ id: citas.id })
    .from(citas)
    .where(and(eq(citas.medicoId, medico.id), eq(citas.pacienteId, pacienteId), ne(citas.estado, "cancelada")))
    .limit(1);
  if (cita) return "tratante";

  const [atencion] = await db
    .select({ id: atenciones.id })
    .from(atenciones)
    .innerJoin(fichasClinicas, eq(fichasClinicas.id, atenciones.fichaId))
    .where(and(eq(atenciones.medicoId, medico.id), eq(fichasClinicas.pacienteId, pacienteId)))
    .limit(1);
  if (atencion) return "tratante";

  const [excepcional] = await db
    .select({ id: auditoria.id })
    .from(auditoria)
    .where(
      and(
        eq(auditoria.userId, userId),
        eq(auditoria.accion, "acceso_excepcional"),
        eq(auditoria.entidad, "ficha"),
        eq(auditoria.entidadId, pacienteId),
        gt(auditoria.creadoEn, new Date(Date.now() - HORAS_ACCESO_EXCEPCIONAL * 3_600_000)),
      ),
    )
    .limit(1);
  return excepcional ? "excepcional" : null;
}

export async function obtenerFicha(db: Db, pacienteId: string) {
  const [existente] = await db.select().from(fichasClinicas).where(eq(fichasClinicas.pacienteId, pacienteId));
  if (existente) return existente;
  const [nueva] = await db.insert(fichasClinicas).values({ pacienteId }).onConflictDoNothing().returning();
  return nueva ?? (await db.select().from(fichasClinicas).where(eq(fichasClinicas.pacienteId, pacienteId)))[0];
}

/** Historial completo: atenciones de todos los profesionales, con sus diagnósticos. */
export async function historial(db: Db, fichaId: string) {
  const filas = await db
    .select({
      atencion: atenciones,
      medico: { nombres: medicos.nombres, apellidos: medicos.apellidos },
      especialidad: especialidades.nombre,
    })
    .from(atenciones)
    .innerJoin(medicos, eq(medicos.id, atenciones.medicoId))
    .leftJoin(especialidades, eq(especialidades.id, atenciones.especialidadId))
    .where(eq(atenciones.fichaId, fichaId))
    .orderBy(desc(atenciones.fecha));
  const ids = filas.map((f) => f.atencion.id);
  const diags = ids.length
    ? await db.select().from(diagnosticos).where(inArray(diagnosticos.atencionId, ids)).orderBy(asc(diagnosticos.tipo))
    : [];
  const corregidas = new Set(filas.map((f) => f.atencion.corrigeA).filter(Boolean));
  return filas.map((f) => ({
    ...f,
    diagnosticos: diags.filter((d) => d.atencionId === f.atencion.id),
    corregida: corregidas.has(f.atencion.id),
  }));
}

export async function listarAdjuntos(db: Db, pacienteId: string) {
  return db.select().from(adjuntos).where(eq(adjuntos.pacienteId, pacienteId)).orderBy(desc(adjuntos.creadoEn));
}

export async function buscarCie10(db: Db, texto: string, limite = 12) {
  const q = normalizarBusqueda(texto.trim());
  if (q.length < 2) return [];
  return db
    .select({ codigo: cie10.codigo, descripcion: cie10.descripcion })
    .from(cie10)
    .where(or(ilike(cie10.codigo, `${q}%`), ilike(cie10.busqueda, `%${q}%`)))
    .orderBy(asc(cie10.codigo))
    .limit(limite);
}

// ─── Atenciones ─────────────────────────────────────────────────────────────

const numero = (min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined))
    .refine((v) => v === undefined || (!Number.isNaN(v) && v >= min && v <= max), `Debe estar entre ${min} y ${max}`);

export const esquemaAtencion = z.object({
  motivoConsulta: z.string().trim().min(2, "Indica el motivo de consulta"),
  anamnesis: z.string().trim().optional().transform((v) => v || null),
  examenFisico: z.string().trim().optional().transform((v) => v || null),
  indicaciones: z.string().trim().optional().transform((v) => v || null),
  plan: z.string().trim().optional().transform((v) => v || null),
  presionSistolica: numero(50, 260),
  presionDiastolica: numero(30, 160),
  frecuenciaCardiaca: numero(20, 250),
  frecuenciaRespiratoria: numero(5, 80),
  temperatura: numero(30, 45),
  saturacion: numero(50, 100),
  pesoKg: numero(0.5, 350),
  tallaCm: numero(30, 250),
  diagCodigo: z.array(z.string()),
  diagDescripcion: z.array(z.string()),
});

export type DatosAtencion = z.output<typeof esquemaAtencion>;

function signos(d: DatosAtencion): SignosVitales | null {
  const s: SignosVitales = {
    presionSistolica: d.presionSistolica,
    presionDiastolica: d.presionDiastolica,
    frecuenciaCardiaca: d.frecuenciaCardiaca,
    frecuenciaRespiratoria: d.frecuenciaRespiratoria,
    temperatura: d.temperatura,
    saturacion: d.saturacion,
    pesoKg: d.pesoKg,
    tallaCm: d.tallaCm,
  };
  const conValor = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined));
  return Object.keys(conValor).length ? conValor : null;
}

/** Diagnósticos del formulario: el primero es el principal. */
async function listaDiagnosticos(
  db: Db,
  d: DatosAtencion,
): Promise<{ filas: { descripcion: string; codigo: string | null }[] } | { error: string }> {
  const filas = d.diagDescripcion
    .map((descripcion, i) => ({ descripcion: descripcion.trim(), codigo: d.diagCodigo[i]?.trim() || null }))
    .filter((x) => x.descripcion);
  // Si viene un código, debe existir en el catálogo.
  const codigos = filas.map((f) => f.codigo).filter((c): c is string => !!c);
  if (codigos.length) {
    const validos = new Set((await db.select({ codigo: cie10.codigo }).from(cie10).where(inArray(cie10.codigo, codigos))).map((c) => c.codigo));
    const invalido = codigos.find((c) => !validos.has(c));
    if (invalido) return { error: `El código CIE-10 "${invalido}" no existe en el catálogo` };
  }
  return { filas };
}

/**
 * Crea o actualiza un borrador y opcionalmente lo firma. Una vez firmada, la
 * base de datos impide modificarla (trigger): solo se puede corregir creando
 * una atención nueva vinculada (`corrigeA`).
 */
export async function guardarAtencion(
  db: Db,
  request: Request,
  p: {
    medico: Medico;
    userId: string;
    pacienteId: string;
    atencionId?: string | null;
    citaId?: string | null;
    corrigeA?: string | null;
    datos: DatosAtencion;
    firmar: boolean;
  },
): Promise<{ atencionId: string } | { error: string }> {
  const diags = await listaDiagnosticos(db, p.datos);
  if ("error" in diags) return { error: diags.error };
  if (p.firmar && diags.filas.length === 0) return { error: "Para firmar, registra al menos un diagnóstico" };

  const ficha = await obtenerFicha(db, p.pacienteId);
  const valores = {
    motivoConsulta: p.datos.motivoConsulta,
    anamnesis: p.datos.anamnesis,
    examenFisico: p.datos.examenFisico,
    indicaciones: p.datos.indicaciones,
    plan: p.datos.plan,
    signosVitales: signos(p.datos),
  };

  let atencionId = p.atencionId ?? null;
  if (atencionId) {
    const [actual] = await db.select().from(atenciones).where(eq(atenciones.id, atencionId));
    if (!actual || actual.fichaId !== ficha.id) return { error: "La atención no existe" };
    if (actual.medicoId !== p.medico.id) return { error: "Solo quien la redactó puede editar este borrador" };
    if (actual.estado === "firmada") return { error: "La atención ya está firmada; agrega una corrección" };
    await db.update(atenciones).set(valores).where(eq(atenciones.id, atencionId));
    await db.delete(diagnosticos).where(eq(diagnosticos.atencionId, atencionId));
  } else {
    let citaId: string | null = null;
    let especialidadId: string | null = null;
    if (p.citaId) {
      const [cita] = await db.select().from(citas).where(eq(citas.id, p.citaId));
      if (cita && cita.medicoId === p.medico.id && cita.pacienteId === p.pacienteId) {
        const [yaRegistrada] = await db.select({ id: atenciones.id }).from(atenciones).where(eq(atenciones.citaId, cita.id));
        if (!yaRegistrada) citaId = cita.id;
        especialidadId = cita.especialidadId;
      }
    }
    if (p.corrigeA) {
      const [original] = await db.select().from(atenciones).where(eq(atenciones.id, p.corrigeA));
      if (!original || original.fichaId !== ficha.id || original.estado !== "firmada") return { error: "La atención a corregir no es válida" };
      if (original.medicoId !== p.medico.id) return { error: "Solo quien firmó la atención puede corregirla" };
      especialidadId = original.especialidadId;
    }
    const [nueva] = await db
      .insert(atenciones)
      .values({ ...valores, fichaId: ficha.id, medicoId: p.medico.id, citaId, especialidadId, corrigeA: p.corrigeA ?? null })
      .returning({ id: atenciones.id });
    atencionId = nueva.id;
  }

  if (diags.filas.length) {
    await db.insert(diagnosticos).values(
      diags.filas.map((d, i) => ({ atencionId: atencionId!, codigoCie10: d.codigo, descripcion: d.descripcion, tipo: i === 0 ? ("principal" as const) : ("secundario" as const) })),
    );
  }

  if (p.firmar) {
    const [firmada] = await db
      .update(atenciones)
      .set({ estado: "firmada", firmadaEn: new Date() })
      .where(and(eq(atenciones.id, atencionId), eq(atenciones.estado, "borrador")))
      .returning();
    if (firmada?.citaId) {
      await db.update(citas).set({ estado: "atendida" }).where(and(eq(citas.id, firmada.citaId), inArray(citas.estado, ["agendada", "confirmada"])));
    }
  }

  await registrarAuditoria(db, request, {
    usuarioId: p.userId,
    accion: p.firmar ? (p.corrigeA ? "firmar_correccion" : "firmar_atencion") : "guardar_borrador",
    entidad: "ficha",
    entidadId: p.pacienteId,
    detalle: { atencionId },
  });
  return { atencionId };
}

export async function pacientePorId(db: Db, id: string) {
  const [p] = await db.select().from(pacientes).where(eq(pacientes.id, id));
  return p;
}
