/** Normaliza un teléfono chileno a formato E.164 (+569XXXXXXXX). Devuelve null si no es válido. */
export function normalizarTelefono(valor: string): string | null {
  const digitos = valor.replace(/\D/g, "");
  if (/^9\d{8}$/.test(digitos)) return `+56${digitos}`;
  if (/^569\d{8}$/.test(digitos)) return `+${digitos}`;
  if (/^562\d{8}$/.test(digitos)) return `+${digitos}`;
  if (/^2\d{8}$/.test(digitos)) return `+56${digitos}`;
  return null;
}

/** "+56912345678" → "+56 9 1234 5678" */
export function formatearTelefono(e164: string): string {
  const m = e164.match(/^\+56(9|2)(\d{4})(\d{4})$/);
  return m ? `+56 ${m[1]} ${m[2]} ${m[3]}` : e164;
}
