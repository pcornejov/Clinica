/**
 * Link para que el paciente gestione su cita (ver, anular, reagendar) sin
 * iniciar sesión, como el que llega en el correo de confirmación.
 *
 * El token es "<idCita>.<firma>", con la firma HMAC-SHA256 del id usando el
 * secreto de la aplicación: no se guarda nada en la base de datos y no se
 * puede adivinar el de otra cita.
 */

const encoder = new TextEncoder();

async function firma(citaId: string, secreto: string): Promise<string> {
  const clave = await crypto.subtle.importKey("raw", encoder.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", clave, encoder.encode(`cita:${citaId}`)));
  let binario = "";
  for (const b of bytes.slice(0, 18)) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function crearTokenGestion(citaId: string, secreto: string): Promise<string> {
  return `${citaId}.${await firma(citaId, secreto)}`;
}

/** Devuelve el id de la cita si el token es válido; si no, null. */
export async function verificarTokenGestion(token: string, secreto: string): Promise<string | null> {
  const [citaId, recibida] = token.split(".");
  if (!citaId || !recibida || !/^[0-9a-f-]{36}$/.test(citaId)) return null;
  const esperada = await firma(citaId, secreto);
  if (esperada.length !== recibida.length) return null;
  let diferencia = 0;
  for (let i = 0; i < esperada.length; i++) diferencia |= esperada.charCodeAt(i) ^ recibida.charCodeAt(i);
  return diferencia === 0 ? citaId : null;
}
