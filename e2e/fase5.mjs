import { B, captura, lanzar, sql, temporal } from "./comun.mjs";
import { writeFileSync } from "node:fs";

const browser = await lanzar();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
p.setDefaultTimeout(10000);
p.on("dialog", (d) => d.accept());
const errores = [];
p.on("pageerror", (e) => errores.push("pageerror: " + e.message));
p.on("response", (r) => { if (r.status() >= 500) errores.push(`${r.status()} ${r.url()}`); });
let fallos = 0;
const ok = (c, m) => { if (!c) fallos++; console.log((c ? "✔ " : "✘ ") + m); };
const visible = async (sel, t = 8000) => { try { await p.locator(sel).first().waitFor({ state: "visible", timeout: t }); return true; } catch { return false; } };
async function ingresar(email) {
  await p.goto(B + "/ingresar");
  await p.fill("input[name=email]", email); await p.fill("input[name=password]", "Demo1234!");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/ingresar")), p.click("button")]);
}
async function salir() { await p.click("button:has-text('Salir')"); await p.waitForLoadState("networkidle"); }

try {
  // Datos: una cita futura agendada de la Dra. Rojas, cuyo paciente tiene alergia registrada.
  const medicoId = sql(`select id from medicos where email like 'camila.rojas%'`);
  const [citaId, pacienteId, fecha, nombre] = sql(`select c.id || '|' || c.paciente_id || '|' || to_char(c.inicio at time zone 'America/Santiago','YYYY-MM-DD') || '|' || p.nombres || ' ' || p.apellidos from citas c join pacientes p on p.id=c.paciente_id where c.medico_id='${medicoId}' and c.estado in ('agendada','confirmada') and c.inicio > now() order by c.inicio limit 1`).split("|");
  sql(`update fichas_clinicas set alergias='Penicilina' where paciente_id='${pacienteId}'`);

  // ── Accesos: recepción y administración no ven fichas ──────────────────
  await ingresar("recepcion@example.com");
  await p.goto(`${B}/medico/pacientes/${pacienteId}`); await p.waitForLoadState("networkidle");
  ok(!p.url().includes("/medico/"), "recepción no puede abrir fichas clínicas");
  const r = await ctx.request.get(`${B}/medico/cie10?q=lumb`, { maxRedirects: 0 });
  ok(r.status() === 302, "recepción tampoco accede al buscador clínico");
  await salir();

  // ── Médico: agenda → atender ────────────────────────────────────────────
  await ingresar("camila.rojas@example.com");
  await p.goto(`${B}/medico?fecha=${fecha}`); await p.waitForLoadState("networkidle");
  const fila = p.locator(`div.rounded-xl:has-text('${nombre}')`).first();
  ok(await fila.locator("text=Alergias: Penicilina").isVisible(), "la agenda del médico muestra las alergias del paciente");
  await fila.locator("a:has-text('Atender')").click(); await p.waitForURL(/\/atencion\?cita=/);
  ok(await visible("text=Alergias: Penicilina"), "el formulario de atención muestra las alergias");

  await p.fill("input[name=motivoConsulta]", "Dolor lumbar de 5 días");
  await p.fill("textarea[name=anamnesis]", "Dolor lumbar mecánico tras esfuerzo, sin irradiación.");
  await p.fill("input[name=presionSistolica]", "128"); await p.fill("input[name=presionDiastolica]", "82");
  await p.fill("input[name=pesoKg]", "70"); await p.fill("input[name=tallaCm]", "175");
  ok(await visible("text=IMC: 22.9"), "calcula el IMC al ingresar peso y talla");
  await p.fill("input[aria-label='Diagnóstico principal']", "lumbago");
  await p.click("button:has-text('M54.5')");
  ok(await p.locator("span.font-mono:has-text('M54.5')").count() === 1, "el buscador CIE-10 asigna el código al elegir un diagnóstico");
  await p.click("button:has-text('Agregar diagnóstico')");
  await p.fill("input[aria-label='Diagnóstico secundario 1']", "Contractura paravertebral");
  await p.fill("textarea[name=indicaciones]", "Paracetamol 1 g cada 8 horas por 5 días.\nCalor local. Evitar cargar peso.");
  await p.click("button:has-text('Guardar borrador')");
  await p.waitForURL(new RegExp(`/medico/pacientes/${pacienteId}`));
  ok(await visible("article:has-text('Borrador'):has-text('Dolor lumbar de 5 días')"), "guarda la atención como borrador");
  ok(sql(`select estado from citas where id='${citaId}'`) !== "atendida", "un borrador no marca la cita como atendida");

  await p.click("a:has-text('Continuar borrador')");
  ok(await p.locator("input[aria-label='Diagnóstico secundario 1']").inputValue() === "Contractura paravertebral", "el borrador conserva los diagnósticos");
  await p.click("button:has-text('Firmar atención')");
  await p.waitForURL(new RegExp(`/medico/pacientes/${pacienteId}`));
  const atencionId = sql(`select id from atenciones where cita_id='${citaId}'`);
  ok(await visible(`#atencion-${atencionId}:has-text('Firmada')`), "firma la atención");
  ok(sql(`select estado from citas where id='${citaId}'`) === "atendida", "al firmar, la cita queda como atendida");
  ok(sql(`select string_agg(coalesce(codigo_cie10,'-') || ':' || tipo, ',' order by tipo) from diagnosticos where atencion_id='${atencionId}'`) === "M54.5:principal,-:secundario", "guarda diagnóstico principal con código y secundario sin código");

  // Inmutabilidad: intentar editar la atención firmada
  const urlAtencion = `${B}/medico/pacientes/${pacienteId}/atencion`;
  const intento = await ctx.request.post(urlAtencion, { form: { atencionId, motivoConsulta: "alterado", diagDescripcion: "x", diagCodigo: "", intent: "firmar" }, maxRedirects: 0 });
  ok(intento.status() === 400 && sql(`select motivo_consulta from atenciones where id='${atencionId}'`) === "Dolor lumbar de 5 días", "una atención firmada no se puede modificar");

  // Imprimir indicaciones
  const pagina = await ctx.newPage();
  await pagina.goto(`${B}/medico/atenciones/${atencionId}/imprimir`);
  ok((await pagina.locator("body").innerText()).includes("Paracetamol 1 g cada 8 horas") && (await pagina.locator("body").innerText()).includes("Camila Rojas Fuentes"), "genera la hoja de indicaciones para imprimir");
  await pagina.screenshot({ path: captura("f5-imprimir.png"), fullPage: true });
  await pagina.close();

  // Corrección
  await p.locator(`#atencion-${atencionId} a:has-text('Agregar corrección')`).click();
  ok(await visible("text=quedará marcada como corregida"), "abre la corrección con el aviso legal");
  await p.fill("textarea[name=indicaciones]", "Paracetamol 1 g cada 8 horas por 5 días.\nCalor local. Kinesiología 10 sesiones.");
  await p.click("button:has-text('Firmar atención')");
  await p.waitForURL(new RegExp(`/medico/pacientes/${pacienteId}`));
  ok(await visible(`#atencion-${atencionId}:has-text('Corregida')`) && await visible("article:has-text('Corrección')"), "la original queda 'Corregida' y la nueva como 'Corrección', sin borrar nada");
  ok(sql(`select count(*) from atenciones where corrige_a='${atencionId}' and estado='firmada'`) === "1", "la corrección queda vinculada a la atención original");

  // Antecedentes
  await p.fill("textarea[name=medicamentosHabituales]", "Losartán 50 mg c/12 h");
  await p.click("button:has-text('Guardar antecedentes')");
  ok(await visible("text=Antecedentes guardados"), "edita los antecedentes");

  // Archivos
  writeFileSync(temporal("examen.pdf"), "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  writeFileSync(temporal("falso.pdf"), "<html><script>alert(1)</script></html>");
  await p.setInputFiles("input[name=archivo]", temporal("falso.pdf"));
  await p.click("button:has-text('Subir archivo')");
  ok(await visible("text=Solo se aceptan PDF, PNG o JPG"), "rechaza un archivo que dice ser PDF pero no lo es");
  await p.setInputFiles("input[name=archivo]", temporal("examen.pdf"));
  await p.click("button:has-text('Subir archivo')");
  ok(await visible("text=Archivo agregado a la ficha") && await visible("a:has-text('examen.pdf')"), "sube un examen en PDF a la ficha");
  const href = await p.locator("a:has-text('examen.pdf')").getAttribute("href");
  const descarga = await ctx.request.get(B + href);
  ok(descarga.status() === 200 && descarga.headers()["content-type"] === "application/pdf" && (await descarga.text()).startsWith("%PDF"), "descarga el archivo desde R2");
  await p.screenshot({ path: captura("f5-ficha.png"), fullPage: true });

  // ── Acceso excepcional ─────────────────────────────────────────────────
  const ajeno = sql(`select p.id from pacientes p where not exists (select 1 from citas c where c.paciente_id=p.id and c.medico_id='${medicoId}') limit 1`);
  await p.goto(`${B}/medico/pacientes/${ajeno}`);
  ok(await visible("text=Acceso excepcional a la ficha"), "la ficha de un paciente ajeno pide declarar un motivo");
  ok(await p.locator("text=Historial de atenciones").count() === 0, "sin motivo no se muestra ningún dato clínico");
  await p.fill("textarea[name=motivo]", "Interconsulta solicitada por el Dr. Muñoz");
  await p.click("button:has-text('Abrir ficha')");
  ok(await visible("text=Estás viendo esta ficha con acceso excepcional"), "con motivo declarado, abre la ficha marcada como excepcional");
  await salir();

  // ── Auditoría ──────────────────────────────────────────────────────────
  await ingresar("admin@example.com");
  await p.goto(`${B}/admin/auditoria?excepcionales=1`); await p.waitForLoadState("networkidle");
  ok(await visible("text=Motivo: Interconsulta solicitada por el Dr. Muñoz"), "la administración ve el acceso excepcional con su motivo");
  await p.goto(`${B}/admin/auditoria`); await p.waitForLoadState("networkidle");
  ok(await visible("td:has-text('Firmó corrección')") && await visible("td:has-text('Descargó archivo')") && await visible("td:has-text('Abrió la ficha')"), "la auditoría registra vistas, firmas y descargas");
  ok((await p.locator("body").innerText()).includes("Paracetamol") === false, "la auditoría no muestra contenido clínico");
  await p.screenshot({ path: captura("f5-auditoria.png"), fullPage: true });
  await p.goto(`${B}/medico/pacientes/${pacienteId}`); await p.waitForLoadState("networkidle");
  ok(!p.url().includes("/medico/pacientes"), "la administración no puede abrir fichas clínicas");
} catch (e) {
  fallos++; console.log("✘ EXCEPCIÓN: " + e.message.split("\n").slice(0, 3).join(" | "));
  await p.screenshot({ path: captura("f5-error.png"), fullPage: true });
}
console.log(errores.length ? "\nERRORES:\n" + [...new Set(errores)].join("\n") : "\nSin errores 5xx ni de página");
console.log(fallos ? `\n${fallos} verificación(es) fallaron` : "\nTodo correcto");
await browser.close();
process.exit(fallos ? 1 : 0);
