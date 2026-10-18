import { and, asc, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { clinica } from "~/config/clinica";
import type { Db } from "~/db/client";
import {
  citas,
  conversacionesWhatsapp,
  especialidades,
  medicos,
  mensajesWhatsapp,
  notificaciones,
  pacientes,
  whatsappSimulados,
} from "~/db/schema";
import { enSegundoPlano, type ContextoApp } from "~/lib/contexto";
import { fechaLocal, formatearFechaHora, formatearHora, formatearPesos, sumarDias } from "~/lib/fechas";
import { normalizarRut } from "~/lib/rut";
import { normalizarTelefono } from "~/lib/telefono";
import { procesarCola } from "../avisos/cola.server";
import { enviarCargaWhatsapp } from "../avisos/envio.server";
import { buscarCupos, crearCita, ultimoDiaAgendable } from "../citas.server";
import { asegurarCuentaPaciente, obtenerOCrearPaciente, type Paciente } from "../pacientes.server";
import { anularConDevolucion } from "../pagos.server";
import { aCarga, diaCorto, diaHoraCorto, ID, leerOpcion, nombreValido, type Respuesta } from "./bot";

/**
 * Bot de WhatsApp: el paciente agenda, ve y anula sus horas conversando.
 *
 * - Se identifica a la persona por su celular. Un número nuevo pasa antes por
 *   un registro breve (RUT, nombre, apellidos y aceptación de avisos).
 * - La reserva no guarda avance: cada botón o fila lleva en su identificador
 *   lo que hace falta (ver `bot.ts`).
 * - Toda hora se revalida en el servidor (`crearCita`) y toda acción sobre una
 *   cita exige que sea del paciente identificado por ese celular.
 */

const VIGENCIA_REGISTRO_MS = 30 * 60_000;
/** Cuántos días hacia adelante se buscan horas al armar la lista de días. */
const DIAS_BUSQUEDA = 21;

export type Entrada = {
  /** Teléfono tal como lo entrega Meta, solo dígitos ("56912345678"). */
  telefono: string;
  /** Texto libre que escribió la persona. */
  texto?: string;
  /** Identificador del botón o fila que tocó. */
  opcion?: string;
};

/** El bot responde solo si la clínica tiene activos WhatsApp y el bot. */
export function botActivo(): boolean {
  return clinica.modulos.whatsapp && clinica.modulos.botWhatsapp;
}

const texto = (t: string): Respuesta => ({ tipo: "texto", texto: t });
const enlaceWeb = (app: ContextoApp) => `${app.env.APP_URL.replace(/\/$/, "")}/agendar`;

function menu(intro: string): Respuesta {
  return {
    tipo: "botones",
    texto: intro,
    botones: [
      { id: ID.menu("agendar"), titulo: "Agendar hora" },
      { id: ID.menu("horas"), titulo: "Mis horas" },
      { id: ID.menu("ayuda"), titulo: "Ayuda" },
    ],
  };
}

const saludo = (nombre: string) => menu(`Hola ${nombre}, soy el asistente de ${clinica.nombre}. ¿Qué necesitas?`);

const volverAlMenu = (t: string, agendar = false): Respuesta => ({
  tipo: "botones",
  texto: t,
  botones: [...(agendar ? [{ id: ID.menu("agendar"), titulo: "Agendar hora" }] : []), { id: ID.menu("main"), titulo: "Menú principal" }],
});

// ─── Punto de entrada ───────────────────────────────────────────────────────

/** Decide qué responder a un mensaje. No envía nada. */
export async function responderBot(app: ContextoApp, entrada: Entrada): Promise<Respuesta[]> {
  const telefono = normalizarTelefono(entrada.telefono) ?? `+${entrada.telefono.replace(/\D/g, "")}`;
  const [paciente] = await app.db
    .select()
    .from(pacientes)
    .where(and(eq(pacientes.telefono, telefono), isNull(pacientes.tutorId)))
    .orderBy(asc(pacientes.creadoEn))
    .limit(1);
  return paciente ? conversar(app, paciente, entrada) : registrar(app, telefono, entrada);
}

/** Responde y envía. Si algo falla, la persona recibe un aviso en vez de silencio. */
export async function atenderMensaje(app: ContextoApp, entrada: Entrada): Promise<void> {
  let respuestas: Respuesta[];
  try {
    respuestas = await responderBot(app, entrada);
  } catch (error) {
    console.error("El bot de WhatsApp falló", error);
    respuestas = [texto(`Tuvimos un problema. Intenta de nuevo en unos minutos o llámanos al ${clinica.telefono}.`)];
  }
  for (const r of respuestas) {
    const para = `+${entrada.telefono.replace(/\D/g, "")}`;
    try {
      const envio = await enviarCargaWhatsapp(app.env, para, aCarga(r));
      if (envio.simulado) await app.db.insert(whatsappSimulados).values({ telefono: para, contenido: r });
    } catch (error) {
      console.error("No se pudo responder por WhatsApp", error);
      break;
    }
  }
}

/** Marca un mensaje como atendido. Devuelve false si ya se había atendido (Meta reintenta). */
export async function marcarMensajeAtendido(db: Db, id: string): Promise<boolean> {
  const nuevo = await db.insert(mensajesWhatsapp).values({ id }).onConflictDoNothing().returning({ id: mensajesWhatsapp.id });
  return nuevo.length > 0;
}

/** Borra lo que ya no sirve: mensajes atendidos, mensajes simulados y registros a medias. */
export async function limpiarBotWhatsapp(db: Db): Promise<void> {
  const hace3Dias = new Date(Date.now() - 3 * 86_400_000);
  const hace1Dia = new Date(Date.now() - 86_400_000);
  await db.delete(mensajesWhatsapp).where(lt(mensajesWhatsapp.creadoEn, hace3Dias));
  await db.delete(whatsappSimulados).where(lt(whatsappSimulados.creadoEn, hace3Dias));
  await db.delete(conversacionesWhatsapp).where(lt(conversacionesWhatsapp.actualizadoEn, hace1Dia));
}

// ─── Registro de un número nuevo ────────────────────────────────────────────

const RUT_YA_REGISTRADO = (app: ContextoApp) =>
  texto(
    `Ese RUT ya está registrado y, por seguridad, no podemos usarlo desde este número. ` +
      `Puedes agendar desde ${enlaceWeb(app)} o llamarnos al ${clinica.telefono}.`,
  );

const PEDIR_RUT = "¿Cuál es tu RUT? Por ejemplo: 12.345.678-5";

async function registrar(app: ContextoApp, telefono: string, entrada: Entrada): Promise<Respuesta[]> {
  const { db } = app;
  const [conv] = await db.select().from(conversacionesWhatsapp).where(eq(conversacionesWhatsapp.telefono, telefono));
  const vigente = !!conv && Date.now() - conv.actualizadoEn.getTime() < VIGENCIA_REGISTRO_MS;

  const guardar = (paso: string, datos: NonNullable<typeof conv>["datos"] = {}) =>
    db
      .insert(conversacionesWhatsapp)
      .values({ telefono, paso, datos, actualizadoEn: new Date() })
      .onConflictDoUpdate({ target: conversacionesWhatsapp.telefono, set: { paso, datos, actualizadoEn: new Date() } });
  const olvidar = () => db.delete(conversacionesWhatsapp).where(eq(conversacionesWhatsapp.telefono, telefono));

  if (!vigente) {
    await guardar("rut");
    return [texto(`Hola, soy el asistente de ${clinica.nombre}. Para ayudarte con tus horas primero necesito registrarte.\n\n${PEDIR_RUT}`)];
  }

  const escrito = (entrada.texto ?? "").trim();
  const datos = conv.datos;

  switch (conv.paso) {
    case "rut": {
      const rut = normalizarRut(escrito);
      if (!rut) return [texto(`Ese RUT no es válido. Escríbelo con su dígito verificador.\n\n${PEDIR_RUT}`)];
      const [existente] = await db.select({ id: pacientes.id }).from(pacientes).where(eq(pacientes.rut, rut));
      if (existente) {
        await olvidar();
        return [RUT_YA_REGISTRADO(app)];
      }
      await guardar("nombres", { rut });
      return [texto("¿Cuál es tu nombre? Escribe solo tus nombres, sin apellidos.")];
    }
    case "nombres": {
      const nombres = nombreValido(escrito);
      if (!nombres) return [texto("No pude entender tu nombre. Escríbelo solo con letras, por ejemplo: María José.")];
      await guardar("apellidos", { ...datos, nombres });
      return [texto("¿Y tus apellidos?")];
    }
    case "apellidos": {
      const apellidos = nombreValido(escrito);
      if (!apellidos) return [texto("No pude entender tus apellidos. Escríbelos solo con letras, por ejemplo: Díaz Pérez.")];
      await guardar("consentimiento", { ...datos, apellidos });
      return [preguntaDeConsentimiento(datos.nombres)];
    }
    case "consentimiento": {
      const opcion = leerOpcion(entrada.opcion);
      if (opcion?.tipo !== "registro") return [preguntaDeConsentimiento(datos.nombres)];
      await olvidar();
      if (!opcion.acepta) {
        return [texto(`Sin tu aceptación no podemos agendar por este medio. Puedes agendar desde ${enlaceWeb(app)} o llamarnos al ${clinica.telefono}.`)];
      }
      if (!datos.rut || !datos.nombres || !datos.apellidos) return [texto(`Empecemos de nuevo.\n\n${PEDIR_RUT}`)];
      const { paciente, creado } = await obtenerOCrearPaciente(
        db,
        { rut: datos.rut, nombres: datos.nombres, apellidos: datos.apellidos, telefono },
        { consentimiento: true },
      );
      // Otra persona registró ese RUT mientras tanto: no se usa.
      if (!creado) return [RUT_YA_REGISTRADO(app)];
      return [menu(`Listo, ${paciente.nombres.split(" ")[0]}, quedaste registrado. ¿Qué necesitas?`)];
    }
    default:
      await guardar("rut");
      return [texto(PEDIR_RUT)];
  }
}

function preguntaDeConsentimiento(nombres?: string): Respuesta {
  return {
    tipo: "botones",
    texto:
      `Gracias${nombres ? `, ${nombres.split(" ")[0]}` : ""}. ¿Aceptas recibir por WhatsApp la confirmación y los recordatorios de tus horas? ` +
      "Los mensajes no incluyen información clínica.",
    botones: [
      { id: ID.registro(true), titulo: "Acepto" },
      { id: ID.registro(false), titulo: "No acepto" },
    ],
  };
}

// ─── Paciente ya registrado ─────────────────────────────────────────────────

async function conversar(app: ContextoApp, paciente: Paciente, entrada: Entrada): Promise<Respuesta[]> {
  const nombre = paciente.nombres.split(" ")[0];
  const opcion = leerOpcion(entrada.opcion);
  if (!opcion) return [saludo(nombre)];

  switch (opcion.tipo) {
    case "menu":
      if (opcion.valor === "main") return [menu("¿Qué necesitas?")];
      if (opcion.valor === "ayuda") {
        return [
          volverAlMenu(
            `Puedes llamarnos al ${clinica.telefono} o escribirnos a ${clinica.email}.\nHorario de atención: ${clinica.horarioAtencion}.\nDirección: ${clinica.direccion}.`,
          ),
        ];
      }
      if (opcion.valor === "horas") return misHoras(app, paciente);
      // Agendar: antes, la aceptación de avisos si aún no la dio.
      if (!paciente.consentimientoContactoEn) {
        return [
          {
            tipo: "botones",
            texto: "Antes de agendar: ¿aceptas recibir por WhatsApp la confirmación y los recordatorios de tus horas? Los mensajes no incluyen información clínica.",
            botones: [
              { id: ID.consentimiento(true), titulo: "Acepto" },
              { id: ID.consentimiento(false), titulo: "No acepto" },
            ],
          },
        ];
      }
      return listaEspecialidades(app);
    case "consentimiento":
      if (!opcion.acepta) return [volverAlMenu(`Entendido. Sin tu aceptación no podemos agendar por este medio; puedes agendar desde ${enlaceWeb(app)}.`)];
      await app.db.update(pacientes).set({ consentimientoContactoEn: new Date() }).where(eq(pacientes.id, paciente.id));
      return listaEspecialidades(app);
    case "registro":
      return [menu("¿Qué necesitas?")];
    case "especialidad":
      return listaDias(app, opcion.especialidadId);
    case "dia":
      return listaHoras(app, opcion.especialidadId, opcion.fecha);
    case "hora":
      return pedirConfirmacion(app, opcion.especialidadId, opcion.medicoId, opcion.epoch);
    case "confirmar":
      return reservar(app, paciente, opcion.especialidadId, opcion.medicoId, opcion.epoch);
    case "cita":
      return detalleCita(app, paciente, opcion.citaId);
    case "anular":
      return pedirConfirmacionAnular(app, paciente, opcion.citaId);
    case "anularSeguro":
      return anular(app, paciente, opcion.citaId);
  }
}

// ─── Agendar ────────────────────────────────────────────────────────────────

async function listaEspecialidades(app: ContextoApp): Promise<Respuesta[]> {
  const lista = await app.db.select().from(especialidades).where(eq(especialidades.activa, true)).orderBy(asc(especialidades.nombre)).limit(10);
  if (lista.length === 0) return [volverAlMenu(`Por ahora no hay especialidades disponibles. Llámanos al ${clinica.telefono}.`)];
  return [
    {
      tipo: "lista",
      texto: "¿Para qué especialidad quieres tu hora?",
      boton: "Ver especialidades",
      seccion: "Especialidades",
      filas: lista.map((e) => ({
        id: ID.especialidad(e.id),
        titulo: e.nombre,
        descripcion: `${e.duracionMinutos} min · ${formatearPesos(e.precio)}`,
      })),
    },
  ];
}

async function listaDias(app: ContextoApp, especialidadId: string): Promise<Respuesta[]> {
  const [esp] = await app.db.select().from(especialidades).where(eq(especialidades.id, especialidadId));
  if (!esp?.activa) return [volverAlMenu("Esa especialidad ya no está disponible.", true)];

  const hoy = fechaLocal(new Date());
  const hasta = [ultimoDiaAgendable(), sumarDias(hoy, DIAS_BUSQUEDA)].sort()[0];
  const { cupos } = await buscarCupos(app.db, { especialidadId, desde: hoy, hasta });

  const porDia = new Map<string, number>();
  for (const c of cupos) {
    const dia = fechaLocal(c.inicio);
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }
  if (porDia.size === 0) {
    return [
      volverAlMenu(
        `No hay horas disponibles de ${esp.nombre} en los próximos días. Puedes inscribirte en la lista de espera desde ${enlaceWeb(app).replace("/agendar", "/lista-espera")} o llamarnos al ${clinica.telefono}.`,
        true,
      ),
    ];
  }
  return [
    {
      tipo: "lista",
      texto: `Horas de ${esp.nombre}. Elige el día:`,
      boton: "Ver días",
      seccion: "Días disponibles",
      filas: [...porDia].slice(0, 10).map(([dia, n]) => ({
        id: ID.dia(especialidadId, dia),
        titulo: diaCorto(dia),
        descripcion: n === 1 ? "1 hora disponible" : `${n} horas disponibles`,
      })),
    },
  ];
}

async function listaHoras(app: ContextoApp, especialidadId: string, fecha: string): Promise<Respuesta[]> {
  const hoy = fechaLocal(new Date());
  if (fecha < hoy || fecha > ultimoDiaAgendable()) return listaDias(app, especialidadId);
  const [esp] = await app.db.select().from(especialidades).where(eq(especialidades.id, especialidadId));
  if (!esp?.activa) return [volverAlMenu("Esa especialidad ya no está disponible.", true)];

  const { cupos, medicos: lista } = await buscarCupos(app.db, { especialidadId, desde: fecha, hasta: fecha });
  if (cupos.length === 0) return [texto("Ese día ya no tiene horas disponibles."), ...(await listaDias(app, especialidadId))];

  const nombreMedico = new Map(lista.map((m) => [m.id, `${m.nombres} ${m.apellidos}`]));
  const nota = cupos.length > 10 ? ` Te muestro las primeras 10 de ${cupos.length}.` : "";
  return [
    {
      tipo: "lista",
      texto: `${esp.nombre}, ${diaCorto(fecha)}. Elige la hora:${nota}`,
      boton: "Ver horas",
      seccion: "Horas disponibles",
      filas: cupos.slice(0, 10).map((c) => ({
        id: ID.hora(especialidadId, c.medicoId, Math.floor(c.inicio.getTime() / 1000)),
        titulo: formatearHora(c.inicio),
        descripcion: `${nombreMedico.get(c.medicoId) ?? "Médico"} · ${formatearPesos(esp.precio)}`,
      })),
    },
  ];
}

async function cupoVigente(app: ContextoApp, especialidadId: string, medicoId: string, epoch: number) {
  const inicio = new Date(epoch * 1000);
  const fecha = fechaLocal(inicio);
  const { cupos } = await buscarCupos(app.db, { especialidadId, medicoId, desde: fecha, hasta: fecha });
  return cupos.find((c) => c.inicio.getTime() === inicio.getTime()) ?? null;
}

async function pedirConfirmacion(app: ContextoApp, especialidadId: string, medicoId: string, epoch: number): Promise<Respuesta[]> {
  const inicio = new Date(epoch * 1000);
  const [[esp], [medico], cupo] = await Promise.all([
    app.db.select().from(especialidades).where(eq(especialidades.id, especialidadId)),
    app.db.select().from(medicos).where(eq(medicos.id, medicoId)),
    cupoVigente(app, especialidadId, medicoId, epoch),
  ]);
  if (!cupo || !esp || !medico) {
    return [texto("Esa hora ya no está disponible."), ...(await listaHoras(app, especialidadId, fechaLocal(inicio)))];
  }
  return [
    {
      tipo: "botones",
      texto:
        `Tu hora:\n${esp.nombre} con ${medico.nombres} ${medico.apellidos}\n${formatearFechaHora(inicio)}\n` +
        `Valor: ${formatearPesos(esp.precio)}, se paga en la clínica.\n\n¿La reservo?`,
      botones: [
        { id: ID.confirmar(especialidadId, medicoId, epoch), titulo: "Confirmar" },
        { id: ID.menu("agendar"), titulo: "Elegir otra" },
      ],
    },
  ];
}

/** La confirmación y la anulación se contestan en el chat: se omite el mismo aviso por plantilla. */
async function omitirAvisoWhatsapp(db: Db, citaId: string, tipo: "confirmacion" | "cancelacion") {
  await db
    .update(notificaciones)
    .set({ estado: "omitida", error: "Respondido en la conversación" })
    .where(and(eq(notificaciones.citaId, citaId), eq(notificaciones.canal, "whatsapp"), eq(notificaciones.tipo, tipo), eq(notificaciones.estado, "pendiente")));
}

async function reservar(app: ContextoApp, paciente: Paciente, especialidadId: string, medicoId: string, epoch: number): Promise<Respuesta[]> {
  const inicio = new Date(epoch * 1000);
  const resultado = await crearCita(app.db, { pacienteId: paciente.id, medicoId, especialidadId, inicio, canal: "whatsapp" });
  if ("error" in resultado) return [volverAlMenu(resultado.error, true)];

  await asegurarCuentaPaciente(app.db, paciente);
  await omitirAvisoWhatsapp(app.db, resultado.citaId, "confirmacion");
  enSegundoPlano(app, procesarCola(app.db, app.env));

  const [[esp], [medico]] = await Promise.all([
    app.db.select().from(especialidades).where(eq(especialidades.id, especialidadId)),
    app.db.select().from(medicos).where(eq(medicos.id, medicoId)),
  ]);
  return [
    {
      tipo: "botones",
      texto:
        `Listo, ${paciente.nombres.split(" ")[0]}. Tu hora quedó reservada:\n${esp.nombre} con ${medico.nombres} ${medico.apellidos}\n${formatearFechaHora(inicio)}\n` +
        `Dirección: ${clinica.direccion}\n\nLlega 15 minutos antes con tu cédula de identidad. Te recordaremos por WhatsApp antes de la hora.`,
      botones: [
        { id: ID.menu("horas"), titulo: "Mis horas" },
        { id: ID.menu("main"), titulo: "Menú principal" },
      ],
    },
  ];
}

// ─── Mis horas y anular ─────────────────────────────────────────────────────

const VIGENTES = ["agendada", "confirmada"] as const;

async function misHoras(app: ContextoApp, paciente: Paciente): Promise<Respuesta[]> {
  const filas = await app.db
    .select({ cita: citas, especialidad: especialidades.nombre, medico: { nombres: medicos.nombres, apellidos: medicos.apellidos } })
    .from(citas)
    .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
    .innerJoin(medicos, eq(medicos.id, citas.medicoId))
    .where(and(eq(citas.pacienteId, paciente.id), inArray(citas.estado, [...VIGENTES]), gt(citas.inicio, new Date())))
    .orderBy(asc(citas.inicio))
    .limit(10);
  if (filas.length === 0) return [volverAlMenu("No tienes horas próximas.", true)];
  return [
    {
      tipo: "lista",
      texto: `Tienes ${filas.length === 1 ? "1 hora próxima" : `${filas.length} horas próximas`}. Elige una para ver el detalle o anularla:`,
      boton: "Ver mis horas",
      seccion: "Mis horas",
      filas: filas.map((f) => ({
        id: ID.cita(f.cita.id),
        titulo: diaHoraCorto(f.cita.inicio),
        descripcion: `${f.especialidad} · ${f.medico.nombres} ${f.medico.apellidos}`,
      })),
    },
  ];
}

type FilaCita = { cita: typeof citas.$inferSelect; especialidad: string; medico: { nombres: string; apellidos: string } };

/** Carga una cita vigente del paciente. Una cita ajena se trata como inexistente. */
async function citaDelPaciente(
  app: ContextoApp,
  paciente: Paciente,
  citaId: string,
): Promise<{ error: string; fila?: undefined } | { fila: FilaCita; error?: undefined }> {
  const [fila] = await app.db
    .select({ cita: citas, especialidad: especialidades.nombre, medico: { nombres: medicos.nombres, apellidos: medicos.apellidos } })
    .from(citas)
    .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
    .innerJoin(medicos, eq(medicos.id, citas.medicoId))
    .where(and(eq(citas.id, citaId), eq(citas.pacienteId, paciente.id)));
  if (!fila) return { error: "No encontramos esa hora." };
  if (!(VIGENTES as readonly string[]).includes(fila.cita.estado) || fila.cita.inicio <= new Date()) {
    return { error: `Tu hora del ${formatearFechaHora(fila.cita.inicio)} ya no se puede modificar.` };
  }
  return { fila };
}

const describir = (f: { cita: { inicio: Date }; especialidad: string; medico: { nombres: string; apellidos: string } }) =>
  `${f.especialidad} con ${f.medico.nombres} ${f.medico.apellidos}\n${formatearFechaHora(f.cita.inicio)}`;

async function detalleCita(app: ContextoApp, paciente: Paciente, citaId: string): Promise<Respuesta[]> {
  const r = await citaDelPaciente(app, paciente, citaId);
  if (!r.fila) return [volverAlMenu(r.error, true)];
  return [
    {
      tipo: "botones",
      texto: `Tu hora:\n${describir(r.fila)}\nDirección: ${clinica.direccion}`,
      botones: [
        { id: ID.anular(citaId), titulo: "Anular esta hora" },
        { id: ID.menu("horas"), titulo: "Volver" },
      ],
    },
  ];
}

async function pedirConfirmacionAnular(app: ContextoApp, paciente: Paciente, citaId: string): Promise<Respuesta[]> {
  const r = await citaDelPaciente(app, paciente, citaId);
  if (!r.fila) return [volverAlMenu(r.error, true)];
  return [
    {
      tipo: "botones",
      texto: `¿Seguro que quieres anular esta hora?\n${describir(r.fila)}`,
      botones: [
        { id: ID.anularSeguro(citaId), titulo: "Sí, anular" },
        { id: ID.menu("main"), titulo: "No, mantenerla" },
      ],
    },
  ];
}

async function anular(app: ContextoApp, paciente: Paciente, citaId: string): Promise<Respuesta[]> {
  const r = await citaDelPaciente(app, paciente, citaId);
  if (!r.fila) return [volverAlMenu(r.error, true)];

  const resultado = await anularConDevolucion(app, citaId, "Anulada por el paciente vía WhatsApp");
  if ("error" in resultado) return [volverAlMenu(resultado.error, true)];

  await omitirAvisoWhatsapp(app.db, citaId, "cancelacion");
  enSegundoPlano(app, procesarCola(app.db, app.env));

  const devolucion =
    resultado.devolucion === "realizada"
      ? " Te devolveremos el pago a tu tarjeta."
      : resultado.devolucion === "no_corresponde"
        ? " Por anular con poca anticipación, el pago no se devuelve."
        : "";
  return [volverAlMenu(`Tu hora del ${formatearFechaHora(r.fila.cita.inicio)} fue anulada.${devolucion} Gracias por avisarnos: así otra persona puede usarla.`, true)];
}
