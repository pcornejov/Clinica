import { B, captura, lanzar, sql } from "./comun.mjs";
function dv(n) { let s = 0, m = 2; for (const d of String(n).split("").reverse()) { s += +d * m; m = m === 7 ? 2 : m + 1; } const r = 11 - (s % 11); return r === 11 ? "0" : r === 10 ? "K" : String(r); }
const rut = (n) => `${n}-${dv(n)}`;

const browser = await lanzar();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
p.setDefaultTimeout(10000);
const errores = [];
p.on("pageerror", (e) => errores.push("pageerror: " + e.message));
p.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text().slice(0, 200)); });
p.on("response", (r) => { if (r.status() >= 500) errores.push(`${r.status()} ${r.url()}`); });
let fallos = 0;
const ok = (c, m) => { if (!c) fallos++; console.log((c ? "✔ " : "✘ ") + m); };
const visible = async (sel, t = 6000) => { try { await p.locator(sel).first().waitFor({ state: "visible", timeout: t }); return true; } catch { return false; } };

async function buscar(especialidad) {
  await p.goto(B + "/agendar");
  await p.selectOption("select[name=especialidad]", { label: especialidad });
  await p.click("button:has-text('Buscar horas')");
  await p.waitForURL(/especialidad=/); await p.waitForLoadState("networkidle");
}
async function llenarParaMi(r, extra = {}) {
  await p.fill("input[name=rut]", r);
  await p.fill("input[name=nombres]", extra.nombres ?? "Prueba");
  await p.fill("input[name=apellidos]", extra.apellidos ?? "Automatizada");
  await p.selectOption("select[name=prevision]", "fonasa");
  await p.fill("input[name=email]", extra.email ?? "prueba@example.com");
  await p.fill("input[name=telefono]", "9 8765 4321");
  await p.check("input[name=consentimiento]");
}

try {
  // ── 1. Reserva web básica ────────────────────────────────────────────────
  await buscar("Medicina General");
  ok(await visible("a[href*='/agendar/confirmar']"), "muestra horas disponibles de Medicina General");
  const primera = p.locator("a[href*='/agendar/confirmar']").first();
  const urlConfirmar = B + (await primera.getAttribute("href"));
  await primera.click(); await p.waitForURL(/confirmar/);
  ok(await visible("text=Confirma tu hora"), "abre la confirmación");

  await llenarParaMi("12.345.678-9");
  await p.click("button:has-text('Confirmar reserva')");
  ok(await visible("text=RUT inválido"), "valida el RUT en la reserva");

  const rutNuevo = rut(21000001);
  await llenarParaMi(rutNuevo, { email: "nuevo.paciente@example.com" });
  await p.click("button:has-text('Confirmar reserva')");
  await p.waitForURL(/\/cita\//);
  ok(await visible("text=¡Listo! Tu hora quedó reservada."), "reserva creada y muestra la cita");
  const urlCita = p.url().split("?")[0];
  ok(sql(`select count(*) from "user" where email='nuevo.paciente@example.com' and role='paciente'`) === "1", "crea la cuenta del paciente automáticamente");

  // La misma hora ya no se ofrece
  await p.goto(urlConfirmar);
  ok(await visible("text=Esta hora ya no está disponible"), "la hora tomada ya no se puede reservar");

  // ── 2. Concurrencia: dos reservas simultáneas de la misma hora ──────────
  await buscar("Pediatría");
  const href = await p.locator("a[href*='/agendar/confirmar']").first().getAttribute("href");
  const formulario = (n) => ({ para: "mi", rut: rut(n), nombres: "Concurrente", apellidos: `Num ${n}`, prevision: "fonasa", email: `c${n}@example.com`, telefono: "912345678", consentimiento: "on" });
  const respuestas = await Promise.all([21000002, 21000003, 21000004].map((n) =>
    ctx.request.post(B + href, { form: formulario(n), maxRedirects: 0 })));
  const estados = respuestas.map((r) => r.status());
  ok(estados.filter((s) => s === 302).length === 1 && estados.filter((s) => s === 409).length === 2,
    `3 reservas simultáneas de la misma hora: solo 1 gana (estados ${estados.join(", ")})`);

  // ── 3. Reagendar ─────────────────────────────────────────────────────────
  await p.goto(urlCita);
  await p.click("a:has-text('Cambiar hora')"); await p.waitForLoadState("networkidle");
  ok(await visible("text=Cambia tu hora"), "abre la búsqueda para reagendar");
  const nueva = p.locator("a[href*='/reagendar?inicio=']").nth(2);
  await nueva.click(); await p.waitForURL(/reagendar\?/);
  await p.click("button:has-text('Confirmar cambio de hora')");
  ok(await visible("text=Tu hora fue cambiada."), "reagenda la hora");

  // ── 4. Anular ────────────────────────────────────────────────────────────
  await p.click("summary:has-text('Anular hora')");
  await p.click("button:has-text('Sí, anular mi hora')");
  ok(await visible("text=Tu hora fue anulada."), "anula la hora");
  ok(await p.locator("a:has-text('Cambiar hora')").count() === 0, "una hora anulada ya no se puede gestionar");

  // ── 5. Token inválido ────────────────────────────────────────────────────
  const tokenFalso = urlCita.replace(/\.[^.]+$/, ".firmafalsa123");
  ok((await p.goto(tokenFalso)).status() === 404, "un enlace con firma falsa no da acceso (404)");

  // ── 6. Reserva para un dependiente + portal del tutor con código ────────
  await buscar("Pediatría");
  await p.locator("a[href*='/agendar/confirmar']").nth(3).click(); await p.waitForURL(/confirmar/);
  await p.check("input[value=otro]");
  await p.fill("input[name=rut]", rut(26000001));
  await p.fill("input[name=nombres]", "Tomasito");
  await p.fill("input[name=apellidos]", "Tutor Prueba");
  await p.selectOption("select[name=prevision]", "isapre");
  await p.fill("input[name=tutorRut]", rut(14000001));
  await p.fill("input[name=tutorNombres]", "Carla");
  await p.fill("input[name=tutorApellidos]", "Tutor Prueba");
  await p.fill("input[name=tutorEmail]", "carla.tutor@example.com");
  await p.fill("input[name=tutorTelefono]", "+56 9 1111 2222");
  await p.check("input[name=consentimiento]");
  await p.click("button:has-text('Confirmar reserva')"); await p.waitForURL(/\/cita\//);
  ok(await visible("text=Hola, Tomasito"), "reserva para un hijo/a a cargo del tutor");
  ok(sql(`select count(*) from pacientes h join pacientes t on t.id=h.tutor_id where h.nombres='Tomasito' and t.email='carla.tutor@example.com'`) === "1", "el dependiente queda vinculado a su tutor");

  await p.goto(B + "/ingresar/paciente");
  await p.fill("input[name=email]", "carla.tutor@example.com");
  await p.click("button:has-text('Enviarme un código')");
  ok(await visible("text=Modo demo"), "envía el código (visible en modo demo)");
  const codigo = (await p.locator("p:has-text('Modo demo') strong").textContent()).trim();
  await p.fill("input[name=codigo]", "000000");
  await p.click("button:has-text('Ingresar')");
  ok(await visible("text=Código incorrecto o vencido"), "rechaza un código incorrecto");
  await p.fill("input[name=codigo]", codigo);
  await p.click("button:has-text('Ingresar')"); await p.waitForURL(/mi-cuenta/);
  ok(await visible("text=Tomasito Tutor Prueba"), "la tutora ve la cita de su hijo en Mi cuenta");
  await p.screenshot({ path: captura("f2-mi-cuenta.png"), fullPage: true });
  await p.click("button:has-text('Salir')"); await p.waitForLoadState("networkidle");

  // Un correo que no es de paciente: misma respuesta, sin código
  await p.goto(B + "/ingresar/paciente");
  await p.fill("input[name=email]", "admin@example.com");
  await p.click("button:has-text('Enviarme un código')");
  ok(await visible("text=Si admin@example.com tiene horas") && (await p.locator("text=Modo demo").count()) === 0, "no envía código a cuentas del personal ni revela si existen");

  // ── 7. RUT existente con otro correo: no se sobrescribe y se marca ──────
  await buscar("Medicina General");
  await p.locator("a[href*='/agendar/confirmar']").nth(5).click(); await p.waitForURL(/confirmar/);
  await llenarParaMi("15.418.785-5", { email: "intruso@example.com", nombres: "Otro", apellidos: "Nombre" });
  await p.click("button:has-text('Confirmar reserva')"); await p.waitForURL(/\/cita\//);
  ok(sql(`select email || '|' || nombres from pacientes where rut='15418785-5'`) === "paciente@example.com|María José", "un RUT existente no sobrescribe los datos registrados");
  ok(sql(`select count(*) from citas c join pacientes p on p.id=c.paciente_id where p.rut='15418785-5' and c.requiere_revision`) === "1", "la cita queda marcada 'Revisar datos'");

  // ── 8. Lista de espera: al anular, se avisa al primero ──────────────────
  await buscar("Dermatología");
  await p.locator("a[href*='/agendar/confirmar']").first().click(); await p.waitForURL(/confirmar/);
  await llenarParaMi(rut(21000009), { email: "derma@example.com" });
  await p.click("button:has-text('Confirmar reserva')"); await p.waitForURL(/\/cita\//);
  await p.click("summary:has-text('Anular hora')");
  await p.click("button:has-text('Sí, anular mi hora')");
  await visible("text=Tu hora fue anulada.");
  ok(sql(`select count(*) from lista_espera where estado='notificada'`) === "1", "al anular, se avisa a la primera persona en lista de espera");
  ok(sql(`select count(*) from notificaciones where tipo='lista_espera'`) === "2", "se genera el aviso de hora liberada por correo y WhatsApp");

  await p.goto(B + "/agendar/lista-espera?especialidad=" + sql(`select id from especialidades where slug='cardiologia'`));
  await p.fill("input[name=rut]", rut(21000010));
  await p.fill("input[name=nombres]", "Espera"); await p.fill("input[name=apellidos]", "Paciente");
  await p.fill("input[name=email]", "espera@example.com"); await p.fill("input[name=telefono]", "987654321");
  await p.selectOption("select[name=prevision]", "particular");
  await p.check("input[name=consentimiento]");
  await p.click("button:has-text('Inscribirme')");
  ok(await visible("text=Quedaste en la lista de espera"), "inscripción en lista de espera");

  // ── 9. Recepción ────────────────────────────────────────────────────────
  await p.goto(B + "/ingresar");
  await p.fill("input[name=email]", "recepcion@example.com"); await p.fill("input[name=password]", "Demo1234!");
  await Promise.all([p.waitForURL(/\/admin/), p.click("button")]);
  const medicoId = sql(`select id from medicos where email like 'camila.rojas%'`);
  const manana = sql(`select to_char((now() at time zone 'America/Santiago')::date + 1, 'YYYY-MM-DD')`);
  // próximo día hábil en que atiende la Dra. Rojas (turno am: lun-sáb)
  let fecha = manana;
  for (let i = 0; i < 7; i++) {
    const dow = sql(`select extract(dow from date '${fecha}')`);
    if (dow !== "0") break;
    fecha = sql(`select to_char(date '${fecha}' + 1, 'YYYY-MM-DD')`);
  }
  await p.goto(`${B}/admin/agenda?medico=${medicoId}&fecha=${fecha}`); await p.waitForLoadState("networkidle");
  ok(await visible("li:has-text('Libre')"), "recepción ve la agenda del día con horas libres");
  await p.locator("li:has-text('Libre') summary").first().click();
  const form = p.locator("ul details[open] form");
  await form.locator("input[name=rut]").fill("15.418.785-5");
  ok(await visible("text=Paciente registrado: María José González Pizarro"), "al escribir el RUT reconoce al paciente registrado");
  await form.locator("button:has-text('Agendar')").click();
  ok(await visible("text=Hora agendada para María José"), "recepción agenda una hora para un paciente existente");

  await p.click("summary:has-text('Agendar sobrecupo')");
  const sc = p.locator("details:has(> summary:has-text('Agendar sobrecupo')) form");
  await sc.locator("input[name=hora]").fill("09:00");
  await sc.locator("input[name=rut]").fill(rut(21000020));
  await sc.locator("input[name=nombres]").waitFor();
  await sc.locator("input[name=nombres]").fill("Sobre");
  await sc.locator("input[name=apellidos]").fill("Cupo");
  await sc.locator("button:has-text('Agendar sobrecupo')").click();
  ok(await visible("text=Hora agendada para Sobre Cupo"), "recepción agenda un sobrecupo encima de una hora ocupada");
  ok(await visible("text=Sobrecupo"), "el sobrecupo se distingue en la agenda");

  const filaAgendada = p.locator("li:has(button:has-text('Confirmar'))").first();
  await filaAgendada.locator("button:has-text('Confirmar')").click();
  ok(await visible("text=Cita actualizada"), "recepción confirma una cita");
  await p.screenshot({ path: captura("f2-agenda.png"), fullPage: true });

  await p.goto(B + "/admin/lista-espera"); await p.waitForLoadState("networkidle");
  ok(await visible("text=Avisado: hora liberada") && await visible("text=Espera Paciente"), "recepción ve la lista de espera con su estado");

  // Capturas públicas
  await p.goto(B + "/agendar?modo=express&especialidad=" + sql(`select id from especialidades where slug='traumatologia'`));
  await p.waitForLoadState("networkidle"); await p.screenshot({ path: captura("f2-express.png"), fullPage: true });
  await p.goto(B + "/agendar?especialidad=" + sql(`select id from especialidades where slug='medicina-general'`));
  await p.waitForLoadState("networkidle"); await p.screenshot({ path: captura("f2-buscar.png"), fullPage: true });
  const movil = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await movil.goto(urlConfirmar.replace(/inicio=[^&]+/, "inicio=" + encodeURIComponent(await p.locator("a[href*='/agendar/confirmar']").nth(4).getAttribute("href").then(h => new URLSearchParams(h.split("?")[1]).get("inicio")))));
  await movil.waitForLoadState("networkidle"); await movil.screenshot({ path: captura("f2-confirmar-movil.png"), fullPage: true });
} catch (e) {
  fallos++; console.log("✘ EXCEPCIÓN: " + e.message.split("\n").slice(0, 3).join(" | "));
  await p.screenshot({ path: captura("f2-error.png"), fullPage: true });
}
console.log(errores.length ? "\nERRORES:\n" + [...new Set(errores)].join("\n") : "\nSin errores 5xx, de consola ni de página");
console.log(fallos ? `\n${fallos} verificación(es) fallaron` : "\nTodo correcto");
await browser.close();
process.exit(fallos ? 1 : 0);
