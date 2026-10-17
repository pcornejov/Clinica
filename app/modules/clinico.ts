/** Cálculos clínicos simples, usados en el servidor y en el navegador. */

/** Edad en años a partir de "YYYY-MM-DD". */
export function edad(fechaNacimiento: string | null, hoy = new Date()): number | null {
  if (!fechaNacimiento) return null;
  const [a, m, d] = fechaNacimiento.split("-").map(Number);
  let anos = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) anos--;
  return anos;
}

/** IMC = peso / talla² (talla en metros). */
export function imc(pesoKg?: number, tallaCm?: number): number | null {
  if (!pesoKg || !tallaCm) return null;
  return Math.round((pesoKg / (tallaCm / 100) ** 2) * 10) / 10;
}
