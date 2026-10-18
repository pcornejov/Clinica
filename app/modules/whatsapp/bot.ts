/**
 * Piezas puras del bot de WhatsApp: identificadores de botones y listas,
 * mensajes con los límites de la API de Meta y validación de lo que escribe
 * el paciente. La lógica de la conversación está en `bot.server.ts`.
 */

// ─── Identificadores de botones y filas ─────────────────────────────────────
//
// Cada botón lleva en su identificador lo necesario para continuar, así el
// servidor no guarda el avance de la reserva. Todo identificador del bot
// empieza con "bot:" (los botones de las plantillas de recordatorio no).

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FECHA = "\\d{4}-\\d{2}-\\d{2}";

export const PREFIJO_BOT = "bot:";

export type OpcionMenu = "main" | "agendar" | "horas" | "ayuda";

export type Opcion =
  | { tipo: "menu"; valor: OpcionMenu }
  | { tipo: "registro"; acepta: boolean }
  | { tipo: "consentimiento"; acepta: boolean }
  | { tipo: "especialidad"; especialidadId: string }
  | { tipo: "dia"; especialidadId: string; fecha: string }
  | { tipo: "hora"; especialidadId: string; medicoId: string; epoch: number }
  | { tipo: "confirmar"; especialidadId: string; medicoId: string; epoch: number }
  | { tipo: "cita"; citaId: string }
  | { tipo: "anular"; citaId: string }
  | { tipo: "anularSeguro"; citaId: string };

export const ID = {
  menu: (v: OpcionMenu) => `bot:menu:${v}`,
  registro: (acepta: boolean) => `bot:reg:${acepta ? "si" : "no"}`,
  consentimiento: (acepta: boolean) => `bot:cons:${acepta ? "si" : "no"}`,
  especialidad: (e: string) => `bot:esp:${e}`,
  dia: (e: string, fecha: string) => `bot:dia:${e}:${fecha}`,
  hora: (e: string, m: string, epoch: number) => `bot:hora:${e}:${m}:${epoch}`,
  confirmar: (e: string, m: string, epoch: number) => `bot:ok:${e}:${m}:${epoch}`,
  cita: (c: string) => `bot:cita:${c}`,
  anular: (c: string) => `bot:anul:${c}`,
  anularSeguro: (c: string) => `bot:anulok:${c}`,
};

const PATRONES: [RegExp, (m: RegExpMatchArray) => Opcion][] = [
  [/^bot:menu:(main|agendar|horas|ayuda)$/, (m) => ({ tipo: "menu", valor: m[1] as OpcionMenu })],
  [/^bot:reg:(si|no)$/, (m) => ({ tipo: "registro", acepta: m[1] === "si" })],
  [/^bot:cons:(si|no)$/, (m) => ({ tipo: "consentimiento", acepta: m[1] === "si" })],
  [new RegExp(`^bot:esp:(${UUID})$`), (m) => ({ tipo: "especialidad", especialidadId: m[1] })],
  [new RegExp(`^bot:dia:(${UUID}):(${FECHA})$`), (m) => ({ tipo: "dia", especialidadId: m[1], fecha: m[2] })],
  [
    new RegExp(`^bot:hora:(${UUID}):(${UUID}):(\\d{9,11})$`),
    (m) => ({ tipo: "hora", especialidadId: m[1], medicoId: m[2], epoch: Number(m[3]) }),
  ],
  [
    new RegExp(`^bot:ok:(${UUID}):(${UUID}):(\\d{9,11})$`),
    (m) => ({ tipo: "confirmar", especialidadId: m[1], medicoId: m[2], epoch: Number(m[3]) }),
  ],
  [new RegExp(`^bot:cita:(${UUID})$`), (m) => ({ tipo: "cita", citaId: m[1] })],
  [new RegExp(`^bot:anul:(${UUID})$`), (m) => ({ tipo: "anular", citaId: m[1] })],
  [new RegExp(`^bot:anulok:(${UUID})$`), (m) => ({ tipo: "anularSeguro", citaId: m[1] })],
];

/** Interpreta un identificador recibido. Lo que no calza exactamente se descarta (viene de fuera). */
export function leerOpcion(id: string | undefined): Opcion | null {
  if (!id) return null;
  for (const [patron, armar] of PATRONES) {
    const m = id.match(patron);
    if (m) return armar(m);
  }
  return null;
}

// ─── Mensajes y límites de la API de Meta ───────────────────────────────────

export type Boton = { id: string; titulo: string };
export type Fila = { id: string; titulo: string; descripcion?: string };

export type Respuesta =
  | { tipo: "texto"; texto: string }
  | { tipo: "botones"; texto: string; botones: Boton[] }
  | { tipo: "lista"; texto: string; boton: string; seccion: string; filas: Fila[] };

/** Recorta con puntos suspensivos para no pasarse del límite de la API. */
export function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1).trimEnd()}…`;
}

/** Cuerpo del mensaje a enviar a la API de Meta, respetando sus límites. */
export function aCarga(r: Respuesta): Record<string, unknown> {
  if (r.tipo === "texto") return { type: "text", text: { body: r.texto.slice(0, 4000) } };

  const cuerpo = { text: r.texto.slice(0, 1024) };
  if (r.tipo === "botones") {
    return {
      type: "interactive",
      interactive: {
        type: "button",
        body: cuerpo,
        action: {
          buttons: r.botones.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: recortar(b.titulo, 20) } })),
        },
      },
    };
  }
  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: cuerpo,
      action: {
        button: recortar(r.boton, 20),
        sections: [
          {
            title: recortar(r.seccion, 24),
            rows: r.filas.slice(0, 10).map((f) => ({
              id: f.id,
              title: recortar(f.titulo, 24),
              ...(f.descripcion ? { description: recortar(f.descripcion, 72) } : {}),
            })),
          },
        ],
      },
    },
  };
}

// ─── Fechas cortas para filas y botones ─────────────────────────────────────

const ZONA = "America/Santiago";

function partes(instante: Date) {
  const f = new Intl.DateTimeFormat("es-CL", { timeZone: ZONA, weekday: "short", day: "numeric", month: "short" });
  const p = Object.fromEntries(f.formatToParts(instante).map((x) => [x.type, x.value.replace(/\./g, "")]));
  const dia = p.weekday.charAt(0).toUpperCase() + p.weekday.slice(1);
  return `${dia} ${p.day} ${p.month}`;
}

/** "2026-10-19" → "Lun 19 oct". */
export function diaCorto(fecha: string): string {
  return partes(new Date(`${fecha}T12:00:00Z`));
}

/** Instante → "Lun 19 oct, 09:30" (hora de Chile). */
export function diaHoraCorto(instante: Date): string {
  const hora = new Intl.DateTimeFormat("es-CL", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false }).format(instante);
  return `${partes(instante)}, ${hora}`;
}

// ─── Lo que escribe el paciente ─────────────────────────────────────────────

/** Nombre o apellidos: solo letras, espacios, guion y apóstrofo. Devuelve el texto con mayúsculas iniciales, o null. */
export function nombreValido(texto: string | undefined): string | null {
  const limpio = (texto ?? "").replace(/\s+/g, " ").trim();
  if (limpio.length < 2 || limpio.length > 60) return null;
  if (!/^[\p{L}][\p{L}\s'’-]*$/u.test(limpio)) return null;
  return limpio
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toUpperCase())
    .replace(/(?<=\s)(De|Del|La|Las|Los|Y)(?=\s)/g, (s) => s.toLowerCase());
}
