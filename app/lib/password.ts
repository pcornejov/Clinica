/**
 * Hash de contraseñas con PBKDF2 (Web Crypto nativo).
 *
 * El algoritmo por defecto de Better Auth (scrypt en JavaScript) consume
 * demasiada CPU para el límite del plan gratuito de Cloudflare Workers.
 * PBKDF2 corre de forma nativa; 100.000 iteraciones es el máximo que
 * permite Workers.
 */

const ITERACIONES = 100_000;
const encoder = new TextEncoder();

function aBase64(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

function desdeBase64(texto: string): Uint8Array {
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
}

async function derivar(password: string, sal: Uint8Array, iteraciones: number) {
  const clave = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: sal as BufferSource, iterations: iteraciones },
    clave,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(password, sal, ITERACIONES);
  return `pbkdf2-sha256$${ITERACIONES}$${aBase64(sal)}$${aBase64(hash)}`;
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const [algoritmo, iteraciones, sal, esperado] = hash.split("$");
  if (algoritmo !== "pbkdf2-sha256" || !iteraciones || !sal || !esperado) return false;
  const calculado = await derivar(password, desdeBase64(sal), Number(iteraciones));
  const esperadoBytes = desdeBase64(esperado);
  if (calculado.length !== esperadoBytes.length) return false;
  // Comparación en tiempo constante.
  let diferencia = 0;
  for (let i = 0; i < calculado.length; i++) diferencia |= calculado[i] ^ esperadoBytes[i];
  return diferencia === 0;
}
