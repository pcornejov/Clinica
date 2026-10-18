import { B, captura, lanzar, sql } from "./comun.mjs";
function dv(n) { let s = 0, m = 2; for (const d of String(n).split("").reverse()) { s += +d * m; m = m === 7 ? 2 : m + 1; } const r = 11 - (s % 11); return r === 11 ? "0" : r === 10 ? "K" : String(r); }
const rut = (n) => `${n}-${dv(n)}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await lanzar();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
p.setDefaultTimeout(10000);
const errores = [];
p.on("pageerror", (e) => errores.push("pageerror: " + e.message));
p.on("response", (r) => { if (r.status() >= 500) errores.push(`${r.status()} ${r.url()}`); });
let fallos = 0;
const ok = (c, m) => { if (!c) fallos++; console.log((c ? "✔ " : "✘ ") + m); };
const visible = async (sel, t = 8000) => { try { await p.locator(sel).first().waitFor({ state: "visible", timeout: t }); return true; } catch { return false; } };
const esperarSql = async (q, esperado, intentos = 20) => { for (let i = 0; i < intentos; i++) { if (sql(q) === esperado) return true; await espera(300); } return false; };

let indice = 0;
async function reservar({ n, pago, especialidad = "Medicina General", email }) {
  await p.goto(B + "/agendar");
  await p.selectOption("select[name=especialidad]", { label: especialidad });
  await p.click("button:has-text('Buscar horas')"); await p.waitForURL(/especialidad=/); await p.waitForLoadState("networkidle");
  await p.locator("a[href*='/agendar/confirmar']").nth(indice++).click(); await p.waitForURL(/confirmar/);
  await p.fill("input[name=rut]", rut(n));
  await p.fill("input[name=nombres]", "Paga"); await p.fill("input[name=apellidos]", `Prueba ${n}`);
  await p.selectOption("select[name=prevision]", "isapre");
  await p.fill("input[name=email]", email ?? `pago${n}@example.com`); await p.fill("input[name=telefono]", "9 5555 " + String(n).slice(-4));
  await p.check("input[name=consentimiento]");
  if (pago === "webpay") await p.check("input[name=pago][value=webpay]");
}
const citaDeRut = (n) => sql(`select c.id from citas c join pacientes p on p.id=c.paciente_id where p.rut='${rut(n)}' order by c.creado_en desc limit 1`);

try {
  // ── 1. Pago aprobado ─────────────────────────────────────────────────────
  await reservar({ n: 22000001, pago: "webpay" });
  ok(await visible("button:has-text('Ir a pagar')"), "el botón cambia a 'Ir a pagar … con Webpay'");
  await p.click("button:has-text('Ir a pagar')");
  await p.waitForURL(/\/pago\/simulador/);
  ok(await visible("text=Simulador de pago"), "llega al formulario de pago (simulador) pasando por la redirección");
  const c1 = citaDeRut(22000001);
  ok(sql(`select estado from citas where id='${c1}'`) === "pendiente_pago", "mientras paga, la hora queda retenida como 'pendiente de pago'");
  await p.screenshot({ path: captura("f3-simulador.png"), fullPage: true });
  await p.click("button:has-text('Pagar con VISA')");
  await p.waitForURL(/\/cita\/.*pago=pagado/);
  ok(await visible("text=¡Pago recibido! Tu hora quedó reservada."), "pago aprobado: muestra la confirmación");
  ok(await visible("text=pagado con Webpay ···· 6623"), "la cita muestra el pago con los últimos dígitos de la tarjeta");
  ok(sql(`select c.estado || '|' || p.estado from citas c join pagos p on p.cita_id=c.id where c.id='${c1}'`) === "agendada|pagado", "cita agendada y pago registrado como pagado");
  const urlCita1 = p.url().split("?")[0];
  await p.screenshot({ path: captura("f3-cita-pagada.png"), fullPage: true });

  ok(await esperarSql(`select count(*) from notificaciones where cita_id='${c1}' and tipo='confirmacion' and estado='enviada'`, "2"),
    "se envían de inmediato la confirmación por correo y por WhatsApp");
  const correo = sql(`select cuerpo from notificaciones where cita_id='${c1}' and canal='email' and tipo='confirmacion'`);
  ok(correo.includes(`${B}/cita/`) && !/diagn/i.test(correo), "el correo trae el link para gestionar la hora y nada clínico");

  // Refrescar el retorno no cobra ni procesa dos veces
  const tokenWs = sql(`select referencia_externa from pagos where cita_id='${c1}'`);
  await p.goto(`${B}/pago/webpay/retorno?token_ws=${tokenWs}`);
  ok(p.url().includes("pago=pagado") && sql(`select count(*) from pagos where cita_id='${c1}' and estado='pagado'`) === "1", "volver a abrir el retorno no procesa el pago de nuevo");

  // ── 2. Pago rechazado ────────────────────────────────────────────────────
  await reservar({ n: 22000002, pago: "webpay" });
  await p.click("button:has-text('Ir a pagar')"); await p.waitForURL(/\/pago\/simulador/);
  await p.click("button:has-text('Mastercard')");
  await p.waitForURL(/pago=rechazado/);
  ok(await visible("text=El pago fue rechazado y la hora se liberó"), "pago rechazado: avisa y libera la hora");
  ok(sql(`select estado from citas where id='${citaDeRut(22000002)}'`) === "cancelada", "la cita del pago rechazado queda anulada");
  ok(sql(`select count(*) from notificaciones where cita_id='${citaDeRut(22000002)}'`) === "0", "una reserva no pagada no genera avisos");

  // ── 3. Pago anulado por el paciente ─────────────────────────────────────
  await reservar({ n: 22000003, pago: "webpay" });
  await p.click("button:has-text('Ir a pagar')"); await p.waitForURL(/\/pago\/simulador/);
  await p.click("button:has-text('Anular compra')");
  await p.waitForURL(/pago=anulado/);
  ok(await visible("text=Anulaste el pago y la hora se liberó."), "pago anulado en el formulario: libera la hora");

  // ── 4. La reserva vence mientras el paciente paga → devolución automática
  await reservar({ n: 22000004, pago: "webpay" });
  await p.click("button:has-text('Ir a pagar')"); await p.waitForURL(/\/pago\/simulador/);
  const c4 = citaDeRut(22000004);
  sql(`update citas set reserva_expira_en = now() - interval '1 minute' where id='${c4}'`);
  await fetch(`${B}/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*`);
  const liberada = await esperarSql(`select estado from citas where id='${c4}'`, "cancelada");
  ok(liberada, "el cron libera la hora cuando vence el plazo para pagar");
  // El paciente insiste desde una pestaña vieja: el simulador ya no acepta ese pago
  await p.reload();
  ok(await visible("text=Transacción no válida"), "un pago vencido ya no se puede completar");

  sql(`update citas set estado='pendiente_pago', reserva_expira_en=now()+interval '10 minutes', cancelada_en=null where id='${c4}'`);
  sql(`update pagos set estado='pendiente' where cita_id='${c4}'`);
  await p.reload();
  sql(`update citas set estado='cancelada' where id='${c4}'`); // vence justo mientras está en el formulario
  await p.click("button:has-text('Pagar con VISA')");
  await p.waitForURL(/pago=expirado/);
  ok(await visible("text=El plazo para pagar venció") && sql(`select estado from pagos where cita_id='${c4}'`) === "reembolsado",
    "si el pago llega después de liberada la hora, se devuelve automáticamente");

  // ── 5. Anular con más de 24 h: devolución ───────────────────────────────
  // La primera hora disponible puede quedar a menos de 24 h según cuándo se corra la prueba: se deja a 60 días.
  sql(`update citas set inicio = now() + interval '60 days', fin = now() + interval '60 days 30 minutes' where id='${c1}'`);
  await p.goto(urlCita1);
  await p.click("summary:has-text('Anular hora')");
  ok((await p.locator("text=el pago no se devuelve").count()) === 0, "con más de 24 h de anticipación no advierte pérdida del pago");
  await p.click("button:has-text('Sí, anular mi hora')");
  ok(await visible("text=te devolveremos el pago a tu tarjeta"), "al anular con más de 24 h, se devuelve el pago");
  ok(sql(`select estado from pagos where cita_id='${c1}'`) === "reembolsado", "el pago queda como devuelto");
  ok(await esperarSql(`select count(*) from notificaciones where cita_id='${c1}' and tipo='cancelacion' and estado='enviada'`, "2"), "se avisa la anulación por correo y WhatsApp");

  // ── 6. Anular con menos de 24 h: sin devolución ─────────────────────────
  await reservar({ n: 22000006, pago: "webpay" });
  await p.click("button:has-text('Ir a pagar')"); await p.waitForURL(/\/pago\/simulador/);
  await p.click("button:has-text('Pagar con VISA')"); await p.waitForURL(/pago=pagado/);
  const c6 = citaDeRut(22000006);
  sql(`update citas set inicio = x, fin = x + interval '30 minutes' from (select case when ((date_trunc('day', now() at time zone 'America/Santiago') + interval '21 hours 7 minutes') at time zone 'America/Santiago') > now() then ((date_trunc('day', now() at time zone 'America/Santiago') + interval '21 hours 7 minutes') at time zone 'America/Santiago') else ((date_trunc('day', now() at time zone 'America/Santiago') + interval '1 day 21 hours 7 minutes') at time zone 'America/Santiago') end as x) t where id='${c6}'`);
  await p.reload();
  await p.click("summary:has-text('Anular hora')");
  ok(await visible("text=el pago no se devuelve"), "con menos de 24 h advierte que el pago no se devuelve");
  await p.click("button:has-text('Sí, anular mi hora')");
  await visible("text=Tu hora fue anulada.");
  ok(sql(`select estado from pagos where cita_id='${c6}'`) === "pagado", "con menos de 24 h el pago no se devuelve");

  // ── 7. Recepción: cobro en caja, recordatorio y respuesta por WhatsApp ──
  await reservar({ n: 22000007, pago: "clinica" });
  await p.click("button:has-text('Confirmar reserva')"); await p.waitForURL(/\/cita\//);
  const c7 = citaDeRut(22000007);
  await reservar({ n: 22000008, pago: "clinica" });
  await p.click("button:has-text('Confirmar reserva')"); await p.waitForURL(/\/cita\//);
  const c8 = citaDeRut(22000008);

  await p.goto(B + "/ingresar");
  await p.fill("input[name=email]", "recepcion@example.com"); await p.fill("input[name=password]", "Demo1234!");
  await Promise.all([p.waitForURL(/\/admin/), p.click("button")]);
  const [medico7, fecha7] = sql(`select medico_id || '|' || to_char(inicio at time zone 'America/Santiago','YYYY-MM-DD') from citas where id='${c7}'`).split("|");
  await p.goto(`${B}/admin/agenda?medico=${medico7}&fecha=${fecha7}`); await p.waitForLoadState("networkidle");
  const fila = p.locator(`li:has-text('Prueba 22000007')`);
  await fila.locator("summary:has-text('Cobrar')").click();
  await fila.locator("select[name=medio]").selectOption("bono_fonasa");
  await fila.locator("button:has-text('Registrar pago')").click();
  ok(await visible("text=Ingresa el folio del bono"), "el bono exige folio");
  await p.locator(`li:has-text('Prueba 22000007') input[name=folio]`).fill("FOL-778899");
  await p.locator(`li:has-text('Prueba 22000007') button:has-text('Registrar pago')`).click();
  ok(await visible(`li:has-text('Prueba 22000007') >> text=Pagado · Bono Fonasa`), "recepción registra el pago con bono Fonasa");

  // Mismo folio en otra cita → rechazado
  const [medico8, fecha8] = sql(`select medico_id || '|' || to_char(inicio at time zone 'America/Santiago','YYYY-MM-DD') from citas where id='${c8}'`).split("|");
  await p.goto(`${B}/admin/agenda?medico=${medico8}&fecha=${fecha8}`); await p.waitForLoadState("networkidle");
  const fila8 = p.locator(`li:has-text('Prueba 22000008')`);
  await fila8.locator("summary:has-text('Cobrar')").click();
  await fila8.locator("select[name=medio]").selectOption("bono_fonasa");
  await fila8.locator("input[name=folio]").fill("FOL-778899");
  await fila8.locator("button:has-text('Registrar pago')").click();
  ok(await visible("text=Ese folio ya fue registrado en otro pago."), "no permite usar el mismo folio de bono dos veces");

  await fila8.locator("button:has-text('Recordar')").click();
  ok(await visible("text=Recordatorio enviado"), "recepción envía un recordatorio manual");
  ok(await esperarSql(`select count(*) from notificaciones where cita_id='${c8}' and tipo='recordatorio_24h' and estado='enviada'`, "2"), "el recordatorio sale por correo y WhatsApp");

  await p.goto(B + "/admin/avisos"); await p.waitForLoadState("networkidle");
  const aviso = p.locator("li:has-text('Recordatorio'):has-text('Prueba 22000008'):has-text('WhatsApp')");
  await aviso.locator("summary").click();
  ok(await visible("text=¿Asistirás? Responde con uno de los botones."), "el panel muestra el texto exacto del WhatsApp enviado");
  await aviso.locator("button:has-text('Confirmar asistencia')").click();
  ok(await visible("text=quedó confirmada"), "simular la respuesta 'Confirmar' confirma la cita y responde al paciente");
  ok(sql(`select estado from citas where id='${c8}'`) === "confirmada", "la cita queda confirmada");
  await p.screenshot({ path: captura("f4-avisos.png"), fullPage: true });

  await p.goto(`${B}/admin/caja?fecha=${sql(`select to_char(now() at time zone 'America/Santiago','YYYY-MM-DD')`)}`); await p.waitForLoadState("networkidle");
  ok(await visible("td:has-text('folio FOL-778899')") && await visible("text=Total del día"), "la caja del día muestra los cobros con su medio y folio");
  await p.screenshot({ path: captura("f3-caja.png"), fullPage: true });

  // ── 8. Webhook de WhatsApp sin firma válida ─────────────────────────────
  const verif = await ctx.request.get(`${B}/api/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=123`);
  const post = await ctx.request.post(`${B}/api/whatsapp`, { data: { entry: [] } });
  ok(verif.status() === 403 && post.status() === 401, "el webhook de WhatsApp rechaza verificaciones y mensajes sin firma válida");

  // ── 9. Lista de espera: el aviso de hora liberada sale solo por correo (la plantilla de WhatsApp no está aprobada en Meta)
  const derma = sql(`select id from especialidades where slug='dermatologia'`);
  indice = 0;
  await p.click("button:has-text('Salir')"); await p.waitForLoadState("networkidle");
  await reservar({ n: 22000009, pago: "clinica", especialidad: "Dermatología" });
  await p.click("button:has-text('Confirmar reserva')"); await p.waitForURL(/\/cita\//);
  await p.click("summary:has-text('Anular hora')"); await p.click("button:has-text('Sí, anular mi hora')");
  ok(await esperarSql(`select count(*) from notificaciones where tipo='lista_espera' and canal='email' and estado='enviada'`, "1"), "la persona en lista de espera recibe el aviso por correo");
  ok(await esperarSql(`select count(*) from notificaciones where tipo='lista_espera' and canal='whatsapp' and estado='omitida'`, "1"), "el aviso de lista de espera por WhatsApp se omite, no falla");
} catch (e) {
  fallos++; console.log("✘ EXCEPCIÓN: " + e.message.split("\n").slice(0, 3).join(" | "));
  await p.screenshot({ path: captura("f34-error.png"), fullPage: true });
}
console.log(errores.length ? "\nERRORES:\n" + [...new Set(errores)].join("\n") : "\nSin errores 5xx ni de página");
console.log(fallos ? `\n${fallos} verificación(es) fallaron` : "\nTodo correcto");
await browser.close();
process.exit(fallos ? 1 : 0);
