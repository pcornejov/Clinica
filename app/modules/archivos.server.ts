/** Archivos de la ficha (exámenes, informes) en Cloudflare R2. */

export const TAMANO_MAXIMO = 10 * 1024 * 1024;

export function bucketArchivos(env: Env): R2Bucket | null {
  return (env as unknown as { ARCHIVOS?: R2Bucket }).ARCHIVOS ?? null;
}

/**
 * Tipo real del archivo según sus primeros bytes (no se confía en la extensión
 * ni en el tipo que declara el navegador). Solo PDF, PNG y JPEG.
 */
export function tipoReal(bytes: Uint8Array): "application/pdf" | "image/png" | "image/jpeg" | null {
  const empieza = (...firma: number[]) => firma.every((b, i) => bytes[i] === b);
  if (empieza(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (empieza(0xff, 0xd8, 0xff)) return "image/jpeg";
  return null;
}

/** Nombre seguro para mostrar y para la descarga. */
export function nombreSeguro(nombre: string): string {
  const limpio = nombre.normalize("NFC").replace(/[^\p{L}\p{N}._ -]/gu, "_").trim();
  return (limpio || "archivo").slice(0, 120);
}
