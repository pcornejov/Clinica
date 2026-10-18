// Bot de WhatsApp: simula a Meta enviando webhooks firmados y lee lo que el bot respondió
// (sin credenciales de WhatsApp las respuestas quedan en la tabla whatsapp_simulados).
// Requiere WHATSAPP_APP_SECRET en .dev.vars (por defecto, "secreto-de-prueba-del-webhook").
import { createHmac } from "node:crypto";
import { B, sql } from "./comun.mjs";

const SECRETO = process.env.E2E_WHATSAPP_APP_SECRET ?? "secreto-de-prueba-del-webhook";
let fallos = 0;
const ok = (c, m) => { if (!c) fallos++; console.log((c ? "✔ " : "✘ ") + m); };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let contador = 0;
async function webhook(cuerpo, firma) {
  const texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  const f = firma ?? "sha256=" + createHmac("sha256", SECRETO).update(texto).digest("hex");
  return (await fetch(B + "/api/whatsapp", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": f }, body: texto })).status;
}
const mensaje = (from, e, id) => ({
  id: id ?? `wamid.e2e.${Date.now()}.${++contador}`,
  from,
  ...(e.texto != null
    ? { type: "text", text: { body: e.texto } }
    : { type: "interactive", interactive: e.lista ? { type: "list_reply", list_reply: { id: e.opcion, title: "x" } } : { type: "button_reply", button_reply: { id: e.opcion, title: "x" } } }),
});
const sobre = (m) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [m] } }] }] });

/** Envía un mensaje y devuelve lo que el bot respondió. */
async function conversar(from, entrada, id) {
  const antes = Number(sql("select coalesce(max(id),0) from whatsapp_simulados"));
  const estado = await webhook(sobre(mensaje(from, entrada, id)));
  if (estado !== 200) throw new Error(`webhook respondió ${estado}`);
  const filas = sql(`select contenido::text from whatsapp_simulados where telefono='+${from}' and id>${antes} order by id`);
  return filas ? filas.split("\n").map((l) => JSON.parse(l)) : [];
}
const toca = (from, id, lista = false) => conversar(from, { opcion: id, lista });
const titulos = (r) => (r.botones ?? []).map((b) => b.titulo);
const esperarSql = async (q, esperado, intentos = 20) => {
  for (let i = 0; i < intentos; i++) { if (sql(q) === esperado) return true; await esperar(500); }
  return false;
};

try {
  // ── Seguridad del webhook ──
  const cuerpo = JSON.stringify(sobre(mensaje("56956983825", { texto: "hola" })));
  ok((await webhook(cuerpo, "sha256=00")) === 401, "firma inválida: el webhook responde 401");
  ok((await webhook({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "read" }] } }] }] })) === 200, "un aviso de estado (sin mensajes) responde 200");

  // ── Paciente registrado: agendar ──
  const tel = "56956983825"; // paciente@example.com
  const [paciente, primerNombre] = sql("select id||'|'||split_part(nombres,' ',1) from pacientes where email='paciente@example.com'").split("|");
  let r = await conversar(tel, { texto: "hola" });
  ok(r.length === 1 && r[0].tipo === "botones" && titulos(r[0]).join() === "Agendar hora,Mis horas,Ayuda", "un saludo muestra el menú con 3 botones");
  ok(r[0].texto.includes(`Hola ${primerNombre},`), "saluda por el nombre del paciente");

  r = await conversar(tel, { texto: "quiero una hora por favor" });
  ok(r[0]?.tipo === "botones", "un texto libre también devuelve el menú");
  r = await toca(tel, "bot:menu:ayuda");
  ok(r[0]?.texto.includes("Horario de atención"), "Ayuda muestra horario y contacto");

  r = await toca(tel, "bot:menu:agendar");
  ok(r[0]?.tipo === "lista" && r[0].filas.length === 8, "Agendar lista las 8 especialidades");
  const esp = r[0].filas.find((f) => f.titulo === "Medicina General");
  r = await toca(tel, esp.id, true);
  ok(r[0]?.tipo === "lista" && r[0].filas.length >= 1 && r[0].filas.length <= 10, "al elegir especialidad, lista los días con horas (máx. 10)");
  ok(/hora(s)? disponible/.test(r[0].filas[0].descripcion), "cada día indica cuántas horas hay");
  r = await toca(tel, r[0].filas[0].id, true);
  ok(r[0]?.tipo === "lista" && /^\d\d:\d\d$/.test(r[0].filas[0].titulo), "al elegir un día, lista las horas (HH:MM)");
  const horaElegida = r[0].filas[0].id;
  r = await toca(tel, horaElegida, true);
  ok(r[0]?.tipo === "botones" && titulos(r[0]).join() === "Confirmar,Elegir otra" && r[0].texto.includes("Valor:"), "pide confirmar con el detalle y el valor");

  const citasAntes = Number(sql("select count(*) from citas where canal='whatsapp'"));
  const confirmar = r[0].botones[0].id;
  r = await toca(tel, confirmar);
  ok(r[0]?.texto.includes("quedó reservada"), "al confirmar, responde que la hora quedó reservada");
  ok(Number(sql("select count(*) from citas where canal='whatsapp'")) === citasAntes + 1, "se creó una cita con canal whatsapp");
  const citaId = sql(`select id from citas where canal='whatsapp' and paciente_id='${paciente}' order by creado_en desc limit 1`);
  ok(sql(`select estado from citas where id='${citaId}'`) === "agendada" && sql(`select modalidad_pago from citas where id='${citaId}'`) === "clinica", "la cita queda agendada, a pagar en la clínica");
  ok(sql(`select estado from notificaciones where cita_id='${citaId}' and canal='whatsapp' and tipo='confirmacion'`) === "omitida", "no se envía además la plantilla de confirmación por WhatsApp");
  ok(await esperarSql(`select estado from notificaciones where cita_id='${citaId}' and canal='email' and tipo='confirmacion'`, "enviada"), "el correo de confirmación sí se envía");

  // Doble reserva de la misma hora (otra persona o el mismo paciente)
  r = await toca(tel, confirmar);
  ok(/otra cita a esa misma hora|ya no está disponible|acaba de tomar/.test(r[0]?.texto ?? ""), "repetir la reserva de la misma hora no crea otra cita");
  ok(Number(sql("select count(*) from citas where canal='whatsapp'")) === citasAntes + 1, "sigue habiendo una sola cita nueva");

  // ── Mis horas y anular ──
  r = await toca(tel, "bot:menu:horas");
  const fila = r[0]?.filas?.find((f) => f.id === `bot:cita:${citaId}`);
  ok(!!fila, "Mis horas incluye la hora recién reservada");
  r = await toca(tel, fila.id, true);
  ok(titulos(r[0]).join() === "Anular esta hora,Volver", "el detalle ofrece anular o volver");
  r = await toca(tel, `bot:anul:${citaId}`);
  ok(titulos(r[0]).join() === "Sí, anular,No, mantenerla", "anular pide confirmación");
  ok(sql(`select estado from citas where id='${citaId}'`) === "agendada", "todavía no se anula");
  r = await toca(tel, `bot:anulok:${citaId}`);
  ok(r[0]?.texto.includes("fue anulada"), "al confirmar, la hora se anula");
  ok(sql(`select estado from citas where id='${citaId}'`) === "cancelada", "la cita queda cancelada en la base");
  ok(sql(`select estado from notificaciones where cita_id='${citaId}' and canal='whatsapp' and tipo='cancelacion'`) === "omitida", "no se envía además la plantilla de anulación por WhatsApp");
  ok(await esperarSql(`select estado from notificaciones where cita_id='${citaId}' and canal='email' and tipo='cancelacion'`, "enviada"), "el correo de anulación sí se envía");
  r = await toca(tel, `bot:anulok:${citaId}`);
  ok(r[0]?.texto.includes("ya no se puede modificar"), "anular dos veces la misma hora no hace nada");

  // ── Seguridad: citas de otras personas y datos manipulados ──
  const ajena = sql(`select c.id from citas c join pacientes p on p.id=c.paciente_id where p.telefono<>'+${tel}' and c.inicio>now() and c.estado in ('agendada','confirmada') limit 1`);
  if (ajena) {
    r = await toca(tel, `bot:cita:${ajena}`, true);
    ok(r[0]?.texto.includes("No encontramos esa hora"), "ver la cita de otra persona: no existe para este celular");
    await toca(tel, `bot:anul:${ajena}`);
    await toca(tel, `bot:anulok:${ajena}`);
    ok(["agendada", "confirmada"].includes(sql(`select estado from citas where id='${ajena}'`)), "anular la cita de otra persona no tiene efecto");
  } else {
    console.log("(aviso) no hay una cita futura de otra persona: se omite esa verificación");
  }
  r = await toca(tel, "bot:esp:00000000-0000-0000-0000-000000000000", true);
  ok(r[0]?.texto.includes("ya no está disponible"), "una especialidad inventada se rechaza");
  r = await toca(tel, "bot:dia:" + esp.id.slice(8) + ":2026-1x-45");
  ok(r[0]?.tipo === "botones" && titulos(r[0]).includes("Agendar hora"), "un identificador mal formado vuelve al menú");
  r = await toca(tel, "bot:dia:" + esp.id.slice(8) + ":2026-13-45", true);
  ok(r[0]?.tipo === "lista" && r[0].texto.includes("Elige el día"), "una fecha imposible vuelve a mostrar los días disponibles");
  r = await toca(tel, "bot:hora:" + esp.id.slice(8) + "'; drop table citas;--");
  ok(Number(sql("select count(*) from citas")) > 100, "un intento de inyección SQL no hace nada");

  // ── Mensajes duplicados (Meta reintenta) ──
  const idFijo = "wamid.e2e.duplicado.1";
  r = await conversar(tel, { texto: "hola" }, idFijo);
  const repetido = await conversar(tel, { texto: "hola" }, idFijo);
  ok(r.length === 1 && repetido.length === 0, "el mismo mensaje entregado dos veces se contesta una sola vez");

  // ── Número nuevo: registro ──
  const nuevo = "56911112222";
  const pacientes0 = Number(sql("select count(*) from pacientes"));
  r = await conversar(nuevo, { texto: "hola" });
  ok(r[0]?.texto.includes("RUT"), "un número desconocido recibe la petición de RUT");
  r = await conversar(nuevo, { texto: "123" });
  ok(r[0]?.texto.includes("no es válido"), "un RUT inválido se rechaza");
  r = await conversar(nuevo, { texto: "15.418.785-5" });
  ok(r[0]?.texto.includes("ya está registrado") && !r[0].texto.includes("Paciente"), "un RUT ya registrado no se puede usar y no revela datos");
  ok(Number(sql("select count(*) from pacientes")) === pacientes0 && sql("select count(*) from pacientes where telefono='+56911112222'") === "0", "no se modificó ni se creó ningún paciente");

  r = await conversar(nuevo, { texto: "hola" });
  ok(r[0]?.texto.includes("RUT"), "tras el rechazo, el registro vuelve a empezar");
  r = await conversar(nuevo, { texto: "11.111.111-1" });
  ok(r[0]?.texto.includes("nombre"), "con un RUT nuevo, pide el nombre");
  r = await conversar(nuevo, { texto: "juan123" });
  ok(r[0]?.texto.includes("No pude entender"), "un nombre con números se rechaza");
  r = await conversar(nuevo, { texto: "juan pablo" });
  ok(r[0]?.texto.includes("apellidos"), "luego pide los apellidos");
  r = await conversar(nuevo, { texto: "pérez soto" });
  ok(r[0]?.tipo === "botones" && titulos(r[0]).join() === "Acepto,No acepto", "luego pide aceptar los avisos");
  ok(sql("select count(*) from pacientes where rut='11111111-1'") === "0", "mientras no acepta, no se crea el paciente");
  r = await toca(nuevo, "bot:reg:si");
  ok(r[0]?.texto.includes("quedaste registrado") && titulos(r[0]).includes("Agendar hora"), "al aceptar, queda registrado y ve el menú");
  ok(sql("select nombres||'|'||apellidos||'|'||telefono||'|'||(consentimiento_contacto_en is not null) from pacientes where rut='11111111-1'") === "Juan Pablo|Pérez Soto|+56911112222|true", "el paciente se guardó con nombre, teléfono y consentimiento");
  r = await toca(nuevo, "bot:menu:agendar");
  ok(r[0]?.tipo === "lista", "el paciente recién registrado ya puede agendar");

  // Rechaza los avisos: no se registra
  const otro = "56933334444";
  await conversar(otro, { texto: "hola" });
  await conversar(otro, { texto: "22222222-2" });
  await conversar(otro, { texto: "ana" });
  await conversar(otro, { texto: "rojas" });
  r = await toca(otro, "bot:reg:no");
  ok(r[0]?.texto.includes("Sin tu aceptación") && sql("select count(*) from pacientes where rut='22222222-2'") === "0", "si no acepta los avisos, no se registra");

  // ── Módulo desactivado ──
  sql(`insert into configuracion_clinica (id, datos) values (1, '{"modulos":{"botWhatsapp":false}}') on conflict (id) do update set datos = excluded.datos`);
  await esperar(32_000); // la configuración se relee cada 30 s
  r = await conversar(tel, { texto: "hola" });
  ok(r.length === 0, "con el bot desactivado en Configuración, no responde");
} catch (e) {
  fallos++;
  console.log("✘ error inesperado: " + e.message);
}
console.log(fallos ? `\n${fallos} verificación(es) fallaron` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);
