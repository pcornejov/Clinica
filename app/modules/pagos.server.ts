import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { clinica } from "~/config/clinica";
import type { Db } from "~/db/client";
import { citas, pagos } from "~/db/schema";
import { programarAvisosCita } from "./avisos/programar.server";
import { anularCita, type ErrorCita } from "./citas.server";
import {
  commitAprobado,
  configWebpay,
  confirmarTransaccion,
  crearTransaccion,
  ordenDeCompra,
  reembolsar,
} from "./webpay.server";

type Servicios = { db: Db; env: Env };
export type Pago = typeof pagos.$inferSelect;
export type MedioCaja = "efectivo" | "tarjeta" | "transferencia" | "bono_fonasa" | "bono_isapre" | "convenio";

export const TEXTO_MEDIO: Record<string, string> = {
  webpay: "Webpay",
  mercadopago: "Mercado Pago",
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  bono_fonasa: "Bono Fonasa",
  bono_isapre: "Bono Isapre",
  convenio: "Convenio",
};

type Simulacion = { resultado: "aprobado" | "rechazado" };

/** Libera una hora retenida que no se pagó. */
async function liberarReserva(db: Db, citaId: string, motivo: string) {
  await db
    .update(citas)
    .set({ estado: "cancelada", canceladaEn: new Date(), motivoCancelacion: motivo, reservaExpiraEn: null })
    .where(and(eq(citas.id, citaId), eq(citas.estado, "pendiente_pago")));
}

/**
 * Crea la transacción en Webpay para una cita pendiente de pago.
 * `origen` es el dominio desde el que navega el paciente (para la URL de retorno).
 */
export async function iniciarPagoWebpay(
  { db, env }: Servicios,
  citaId: string,
  origen: string,
): Promise<{ token: string; url: string } | ErrorCita> {
  const [cita] = await db.select().from(citas).where(eq(citas.id, citaId));
  if (!cita || cita.estado !== "pendiente_pago") return { error: "Esta hora no está pendiente de pago." };
  if (cita.reservaExpiraEn && cita.reservaExpiraEn < new Date()) {
    await liberarReserva(db, cita.id, "Venció el plazo para pagar");
    return { error: "Venció el plazo para pagar esta hora. Por favor resérvala de nuevo." };
  }

  const config = configWebpay(env);
  const [pago] = await db
    .insert(pagos)
    .values({ citaId, medio: "webpay", estado: "pendiente", monto: cita.precio })
    .returning();
  const orden = ordenDeCompra(pago.id);
  try {
    const { token, url } = await crearTransaccion(config, {
      ordenCompra: orden,
      sesion: cita.id,
      monto: cita.precio,
      urlRetorno: `${origen}/pago/webpay/retorno`,
      origen,
    });
    await db
      .update(pagos)
      .set({ referenciaExterna: token, detalle: { ordenCompra: orden, modo: config.modo, url } })
      .where(eq(pagos.id, pago.id));
    return { token, url };
  } catch (error) {
    console.error("No se pudo crear la transacción Webpay", error);
    await db
      .update(pagos)
      .set({ estado: "rechazado", detalle: { ordenCompra: orden, modo: config.modo, error: String(error).slice(0, 300) } })
      .where(eq(pagos.id, pago.id));
    return { error: "No pudimos conectar con Webpay. Intenta de nuevo o elige pagar en la clínica." };
  }
}

export async function pagoPorToken(db: Db, token: string): Promise<Pago | undefined> {
  const [pago] = await db
    .select()
    .from(pagos)
    .where(and(eq(pagos.medio, "webpay"), eq(pagos.referenciaExterna, token)));
  return pago;
}

/** Simulador: guarda la decisión de la "pantalla de Webpay" para el commit. */
export async function registrarSimulacion(db: Db, token: string, resultado: Simulacion["resultado"]) {
  const pago = await pagoPorToken(db, token);
  if (!pago || pago.estado !== "pendiente") return null;
  await db
    .update(pagos)
    .set({ detalle: { ...(pago.detalle ?? {}), simulacion: { resultado } } })
    .where(eq(pagos.id, pago.id));
  return pago;
}

export type ResultadoRetorno =
  | { resultado: "pagado" | "rechazado" | "anulado" | "expirado" | "procesando"; citaId: string }
  | { resultado: "error" };

/**
 * Procesa la vuelta desde Webpay. Casos (según Transbank):
 * - `token_ws`: flujo normal (aprobado o rechazado) → se confirma (commit).
 * - `TBK_TOKEN`: el paciente anuló en el formulario de pago.
 * - Solo `TBK_ORDEN_COMPRA`: se agotó el tiempo en el formulario.
 * Es idempotente: si el pago ya se procesó, devuelve el mismo resultado.
 */
export async function procesarRetornoWebpay(
  { db, env }: Servicios,
  p: { tokenWs?: string | null; tbkToken?: string | null; ordenCompra?: string | null },
): Promise<ResultadoRetorno> {
  const config = configWebpay(env);

  if (p.tbkToken || (!p.tokenWs && p.ordenCompra)) {
    const pago = p.tbkToken
      ? await pagoPorToken(db, p.tbkToken)
      : (await db.select().from(pagos).where(sql`${pagos.detalle}->>'ordenCompra' = ${p.ordenCompra}`))[0];
    if (!pago) return { resultado: "error" };
    if (pago.estado === "pendiente") {
      await db.update(pagos).set({ estado: "anulado" }).where(and(eq(pagos.id, pago.id), eq(pagos.estado, "pendiente")));
      await liberarReserva(db, pago.citaId, "Pago anulado por el paciente");
    }
    return { resultado: "anulado", citaId: pago.citaId };
  }

  if (!p.tokenWs) return { resultado: "error" };
  const pago = await pagoPorToken(db, p.tokenWs);
  if (!pago) return { resultado: "error" };
  if (pago.estado === "pagado") return { resultado: "pagado", citaId: pago.citaId };
  if (pago.estado === "reembolsado") return { resultado: "expirado", citaId: pago.citaId };
  if (pago.estado !== "pendiente") return { resultado: "rechazado", citaId: pago.citaId };

  // Se "toma" el pago antes de confirmarlo: si el paciente refresca la página
  // o Transbank repite el retorno, el segundo intento no vuelve a confirmar.
  const detalle = pago.detalle ?? {};
  const [tomado] = await db
    .update(pagos)
    .set({ detalle: { ...detalle, confirmando: true } })
    .where(and(eq(pagos.id, pago.id), eq(pagos.estado, "pendiente"), sql`coalesce(${pagos.detalle}->>'confirmando', 'false') <> 'true'`))
    .returning({ id: pagos.id });
  if (!tomado) return { resultado: "procesando", citaId: pago.citaId };

  const pendiente = and(eq(pagos.id, pago.id), eq(pagos.estado, "pendiente"));
  let respuesta;
  try {
    const simulacion = detalle.simulacion as Simulacion | undefined;
    respuesta = await confirmarTransaccion(
      config,
      p.tokenWs,
      simulacion && { ...simulacion, monto: pago.monto, ordenCompra: String(detalle.ordenCompra), sesion: pago.citaId },
    );
  } catch (error) {
    console.error("Commit de Webpay falló", error);
    await db.update(pagos).set({ estado: "rechazado", detalle: { ...detalle, error: String(error).slice(0, 300) } }).where(pendiente);
    await liberarReserva(db, pago.citaId, "No se pudo confirmar el pago");
    return { resultado: "rechazado", citaId: pago.citaId };
  }

  const detalleTarjeta = {
    ...detalle,
    codigoRespuesta: respuesta.response_code,
    autorizacion: respuesta.authorization_code,
    tarjeta: respuesta.card_detail?.card_number,
    tipoPago: respuesta.payment_type_code,
    cuotas: respuesta.installments_number,
  };

  if (!commitAprobado(respuesta) || respuesta.amount !== pago.monto) {
    await db.update(pagos).set({ estado: "rechazado", detalle: detalleTarjeta }).where(pendiente);
    await liberarReserva(db, pago.citaId, "Pago rechazado");
    return { resultado: "rechazado", citaId: pago.citaId };
  }

  await db.update(pagos).set({ estado: "pagado", pagadoEn: new Date(), detalle: detalleTarjeta }).where(pendiente);
  const [cita] = await db
    .update(citas)
    .set({ estado: "agendada", reservaExpiraEn: null })
    .where(and(eq(citas.id, pago.citaId), eq(citas.estado, "pendiente_pago")))
    .returning({ id: citas.id });

  if (!cita) {
    // La reserva venció mientras el paciente pagaba y la hora ya se liberó: se devuelve el dinero.
    try {
      await reembolsar(config, p.tokenWs, pago.monto);
      await db.update(pagos).set({ estado: "reembolsado" }).where(eq(pagos.id, pago.id));
    } catch (error) {
      console.error("Reembolso automático falló", error);
      await db.update(pagos).set({ detalle: { ...detalleTarjeta, reembolsoPendiente: true } }).where(eq(pagos.id, pago.id));
    }
    return { resultado: "expirado", citaId: pago.citaId };
  }

  await programarAvisosCita(db, pago.citaId, "confirmacion");
  return { resultado: "pagado", citaId: pago.citaId };
}

/** Pago vigente (pagado o pendiente) de cada cita. */
export async function pagosDeCitas(db: Db, citaIds: string[]): Promise<Map<string, Pago>> {
  if (citaIds.length === 0) return new Map();
  const filas = await db
    .select()
    .from(pagos)
    .where(and(inArray(pagos.citaId, citaIds), inArray(pagos.estado, ["pagado", "pendiente", "reembolsado"])))
    .orderBy(desc(pagos.creadoEn));
  const mapa = new Map<string, Pago>();
  for (const p of filas) if (!mapa.has(p.citaId) || p.estado === "pagado") mapa.set(p.citaId, p);
  return mapa;
}

/** ¿Corresponde devolución si se anula ahora? (según la regla de la clínica) */
export function anulacionConDevolucion(inicio: Date): boolean {
  return inicio.getTime() - Date.now() >= clinica.reglas.cancelacionConDevolucionHoras * 3_600_000;
}

/**
 * Anula la cita y, si se pagó con Webpay y corresponde según la regla de
 * cancelación (o si anula la clínica), devuelve el dinero.
 */
export async function anularConDevolucion(
  { db, env }: Servicios,
  citaId: string,
  motivo: string | null,
  opciones: { porLaClinica?: boolean } = {},
): Promise<{ ok: true; devolucion: "realizada" | "no_corresponde" | "pendiente" | null } | ErrorCita> {
  const [cita] = await db.select().from(citas).where(eq(citas.id, citaId));
  if (!cita) return { error: "La cita no existe." };
  const resultado = await anularCita(db, citaId, motivo);
  if ("error" in resultado) return resultado;

  const pago = (await pagosDeCitas(db, [citaId])).get(citaId);
  if (!pago || pago.medio !== "webpay" || pago.estado !== "pagado" || !pago.referenciaExterna) {
    return { ok: true, devolucion: null };
  }
  if (!opciones.porLaClinica && !anulacionConDevolucion(cita.inicio)) return { ok: true, devolucion: "no_corresponde" };

  try {
    await reembolsar(configWebpay(env), pago.referenciaExterna, pago.monto);
    await db.update(pagos).set({ estado: "reembolsado" }).where(eq(pagos.id, pago.id));
    return { ok: true, devolucion: "realizada" };
  } catch (error) {
    console.error("Devolución Webpay falló", error);
    await db.update(pagos).set({ detalle: { ...(pago.detalle ?? {}), reembolsoPendiente: true } }).where(eq(pagos.id, pago.id));
    return { ok: true, devolucion: "pendiente" };
  }
}

/** Cobro registrado en la caja de la clínica (bono, efectivo, tarjeta, etc.). */
export async function registrarPagoCaja(
  db: Db,
  datos: { citaId: string; medio: MedioCaja; monto: number; folio: string | null; usuarioId: string },
): Promise<{ ok: true } | ErrorCita> {
  const [cita] = await db.select().from(citas).where(eq(citas.id, datos.citaId));
  if (!cita) return { error: "La cita no existe." };
  if (cita.estado === "cancelada") return { error: "La cita está anulada." };
  const actual = (await pagosDeCitas(db, [cita.id])).get(cita.id);
  if (actual?.estado === "pagado") return { error: "Esta cita ya está pagada." };
  try {
    await db.insert(pagos).values({
      citaId: cita.id,
      medio: datos.medio,
      estado: "pagado",
      monto: datos.monto,
      referenciaExterna: datos.folio,
      registradoPor: datos.usuarioId,
      pagadoEn: new Date(),
      detalle: datos.folio ? { folio: datos.folio } : null,
    });
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505") return { error: "Ese folio ya fue registrado en otro pago." };
    throw error;
  }
  return { ok: true };
}

/** Cron: libera las horas retenidas cuyo plazo de pago venció. */
export async function liberarReservasVencidas(db: Db): Promise<number> {
  const vencidas = await db
    .update(citas)
    .set({ estado: "cancelada", canceladaEn: new Date(), motivoCancelacion: "Venció el plazo para pagar", reservaExpiraEn: null })
    .where(and(eq(citas.estado, "pendiente_pago"), lt(citas.reservaExpiraEn, new Date())))
    .returning({ id: citas.id });
  if (vencidas.length > 0) {
    await db
      .update(pagos)
      .set({ estado: "anulado" })
      .where(and(inArray(pagos.citaId, vencidas.map((c) => c.id)), eq(pagos.estado, "pendiente")));
  }
  return vencidas.length;
}
