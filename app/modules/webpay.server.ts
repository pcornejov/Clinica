/**
 * Cliente de Webpay Plus (Transbank), API REST v1.2.
 *
 * Modos (variable TRANSBANK_MODO):
 * - "integracion": ambiente de pruebas de Transbank con las credenciales
 *   públicas de prueba. Tarjetas de prueba: VISA 4051 8856 0044 6623 (aprobada),
 *   Mastercard 5186 0595 5959 0568 (rechazada); RUT 11.111.111-1, clave 123.
 * - "produccion": requiere el código de comercio y la llave secreta de la clínica.
 * - "simulado": no contacta a Transbank. Una pantalla propia imita el
 *   formulario de pago y vuelve a la clínica igual que Webpay. Sirve para
 *   demos cuando Transbank no es accesible (su firewall bloquea algunos
 *   servidores).
 */

export type ModoWebpay = "integracion" | "produccion" | "simulado";

const URL_BASE = {
  integracion: "https://webpay3gint.transbank.cl",
  produccion: "https://webpay3g.transbank.cl",
} as const;

/** Credenciales públicas del ambiente de integración (publicadas por Transbank). */
const CREDENCIALES_INTEGRACION = {
  codigoComercio: "597055555532",
  llave: "579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C",
};

const RUTA = "/rswebpaytransaction/api/webpay/v1.2/transactions";

export type RespuestaCommit = {
  status: string;
  response_code: number;
  amount: number;
  buy_order: string;
  session_id: string;
  authorization_code?: string;
  payment_type_code?: string;
  installments_number?: number;
  card_detail?: { card_number?: string };
  transaction_date?: string;
};

export function commitAprobado(r: RespuestaCommit): boolean {
  return r.response_code === 0 && r.status === "AUTHORIZED";
}

export type ConfigWebpay = {
  modo: ModoWebpay;
  codigoComercio: string;
  llave: string;
};

export function configWebpay(env: Env): ConfigWebpay {
  const modo = (["integracion", "produccion", "simulado"] as const).find((m) => m === env.TRANSBANK_MODO) ?? "simulado";
  if (modo === "produccion") {
    const e = env as unknown as { TRANSBANK_CODIGO_COMERCIO?: string; TRANSBANK_LLAVE?: string };
    if (!e.TRANSBANK_CODIGO_COMERCIO || !e.TRANSBANK_LLAVE) {
      throw new Error("Faltan TRANSBANK_CODIGO_COMERCIO y TRANSBANK_LLAVE para producción");
    }
    return { modo, codigoComercio: e.TRANSBANK_CODIGO_COMERCIO, llave: e.TRANSBANK_LLAVE };
  }
  return { modo, ...CREDENCIALES_INTEGRACION };
}

async function llamar<T>(config: ConfigWebpay, metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  if (config.modo === "simulado") throw new Error("No se llama a Transbank en modo simulado");
  const respuesta = await fetch(`${URL_BASE[config.modo]}${RUTA}${ruta}`, {
    method: metodo,
    headers: {
      "Tbk-Api-Key-Id": config.codigoComercio,
      "Tbk-Api-Key-Secret": config.llave,
      "Content-Type": "application/json",
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) throw new Error(`Transbank respondió ${respuesta.status}: ${texto.slice(0, 300)}`);
  return JSON.parse(texto) as T;
}

/** Crea la transacción. Devuelve el token y la URL a la que se envía al paciente. */
export async function crearTransaccion(
  config: ConfigWebpay,
  datos: { ordenCompra: string; sesion: string; monto: number; urlRetorno: string; origen: string },
): Promise<{ token: string; url: string }> {
  if (config.modo === "simulado") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const token = `sim${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    return { token, url: `${datos.origen}/pago/simulador` };
  }
  return llamar(config, "POST", "", {
    buy_order: datos.ordenCompra,
    session_id: datos.sesion,
    amount: datos.monto,
    return_url: datos.urlRetorno,
  });
}

/**
 * Confirma la transacción. Debe llamarse una sola vez cuando el paciente
 * vuelve con `token_ws`. En modo simulado, el resultado lo decidió la pantalla
 * del simulador y viene en `simulacion`.
 */
export async function confirmarTransaccion(
  config: ConfigWebpay,
  token: string,
  simulacion?: { resultado: "aprobado" | "rechazado"; monto: number; ordenCompra: string; sesion: string },
): Promise<RespuestaCommit> {
  if (config.modo === "simulado") {
    if (!simulacion) throw new Error("Transacción simulada sin resultado");
    const aprobado = simulacion.resultado === "aprobado";
    return {
      status: aprobado ? "AUTHORIZED" : "FAILED",
      response_code: aprobado ? 0 : -1,
      amount: simulacion.monto,
      buy_order: simulacion.ordenCompra,
      session_id: simulacion.sesion,
      authorization_code: aprobado ? "1213" : "000000",
      payment_type_code: "VN",
      installments_number: 0,
      card_detail: { card_number: aprobado ? "6623" : "0568" },
      transaction_date: new Date().toISOString(),
    };
  }
  return llamar(config, "PUT", `/${encodeURIComponent(token)}`);
}

/** Devuelve el dinero (anulación total). */
export async function reembolsar(config: ConfigWebpay, token: string, monto: number): Promise<{ type: string }> {
  if (config.modo === "simulado") return { type: "NULLIFIED" };
  return llamar(config, "POST", `/${encodeURIComponent(token)}/refunds`, { amount: monto });
}

/** Orden de compra: máximo 26 caracteres según Transbank. */
export function ordenDeCompra(pagoId: string): string {
  return `C${pagoId.replace(/-/g, "").slice(0, 25)}`;
}
