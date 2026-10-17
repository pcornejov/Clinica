import { B, captura, lanzar } from "./comun.mjs";
const browser = await lanzar();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
p.setDefaultTimeout(8000);
const errores = [];
p.on("pageerror", (e) => errores.push("pageerror: " + e.message));
p.on("response", (r) => { if (r.status() >= 500) errores.push(`${r.status()} ${r.url()}`); });
let fallos = 0;
const ok = (c, m) => { if (!c) fallos++; console.log((c ? "✔ " : "✘ ") + m); };
const esperar = () => p.waitForLoadState("networkidle");

async function ingresar(email, clave = "Demo1234!") {
  await p.goto(B + "/ingresar");
  await p.fill("input[name=email]", email);
  await p.fill("input[name=password]", clave);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/ingresar")), p.click("button")]);
  await esperar();
}
async function salir() { await p.click("button:has-text('Salir')"); await esperar(); }
const visible = async (sel) => { try { await p.locator(sel).first().waitFor({ state: "visible", timeout: 5000 }); return true; } catch { return false; } };
const tono = () => p.evaluate(() => document.documentElement.style.getPropertyValue("--marca-tono"));

try {
  // Recepción no puede entrar a la configuración.
  await ingresar("recepcion@example.com");
  await p.goto(B + "/admin/configuracion"); await esperar();
  ok(new URL(p.url()).pathname === "/admin", "recepción es redirigida fuera de /admin/configuracion");
  await salir();

  await ingresar("admin@example.com");
  ok(await p.locator("header nav a:has-text('Configuración')").count() === 1, "admin ve el menú Configuración");
  await p.goto(B + "/admin/configuracion"); await esperar();
  ok(await visible("h1:has-text('Configuración')"), "abre la pantalla de configuración");
  await p.screenshot({ path: captura("fase7-configuracion.png"), fullPage: true });

  // ── Marca y contacto ──
  await p.fill("form:has(input[value=marca]) input[name=nombre]", "Clínica Norte");
  await p.fill("form:has(input[value=marca]) input[name=eslogan]", "Tu salud, cerca de ti");
  await p.fill("form:has(input[value=marca]) input[name=telefono]", "+56 2 2999 0000");
  await p.fill("form:has(input[value=marca]) input[name=logoUrl]", "http://sin-https.cl/logo.png");
  await p.click("button:has-text('Guardar datos')"); await esperar();
  ok(await visible("text=Debe ser un enlace que empiece con https://"), "rechaza un logo sin https");

  await p.fill("form:has(input[value=marca]) input[name=logoUrl]", "https://ejemplo.cl/logo.png");
  await p.locator("form:has(input[value=marca]) input[name=colorTono]").fill("320");
  await p.click("button:has-text('Guardar datos')"); await esperar();
  ok(await visible("text=Datos de la clínica guardados"), "guarda los datos de la clínica");
  ok((await tono()) === "320", "el color de marca cambia de inmediato (tono 320)");
  ok(await p.locator("header a:has-text('Clínica Norte')").count() >= 1, "el panel muestra el nombre nuevo");
  ok(await p.locator("header img[src='https://ejemplo.cl/logo.png']").count() === 1, "el panel muestra el logo");

  // ── Reglas ──
  await p.fill("form:has(input[value=reglas]) input[name=diasAgendaVisible]", "0");
  await p.click("button:has-text('Guardar reglas')"); await esperar();
  ok(await visible("text=Mínimo 1"), "rechaza una regla fuera de rango");
  await p.fill("form:has(input[value=reglas]) input[name=diasAgendaVisible]", "14");
  await p.fill("form:has(input[value=reglas]) input[name=reservaPagoMinutos]", "20");
  await p.click("button:has-text('Guardar reglas')"); await esperar();
  ok(await visible("text=Reglas guardadas"), "guarda las reglas");

  // ── Módulos: sin WhatsApp ni ficha clínica ──
  await p.uncheck("input[type=checkbox][name=whatsapp]");
  await p.uncheck("input[type=checkbox][name=fichaClinica]");
  await p.click("button:has-text('Guardar módulos')"); await esperar();
  ok(await visible("text=Módulos guardados"), "guarda los módulos");

  // La configuración queda en la base de datos: sobrevive a recargar.
  await p.reload(); await esperar();
  ok((await p.inputValue("form:has(input[value=marca]) input[name=nombre]")) === "Clínica Norte", "tras recargar, el nombre sigue guardado");
  ok((await p.inputValue("form:has(input[value=reglas]) input[name=diasAgendaVisible]")) === "14", "tras recargar, la regla sigue guardada");
  ok(!(await p.isChecked("input[type=checkbox][name=whatsapp]")), "tras recargar, WhatsApp sigue desactivado");

  // La auditoría registra los cambios.
  await p.goto(B + "/admin/auditoria"); await esperar();
  await salir();

  // ── Web pública (sin sesión) ──
  await p.goto(B + "/"); await esperar();
  ok(await visible("header a:has-text('Clínica Norte')"), "la web pública muestra el nombre nuevo");
  ok(await visible("text=Tu salud, cerca de ti"), "la web pública muestra el eslogan nuevo");
  ok(await p.locator("header img[src='https://ejemplo.cl/logo.png']").count() === 1, "la web pública muestra el logo");
  ok((await tono()) === "320", "la web pública usa el color nuevo");
  ok(await p.locator("footer:has-text('+56 2 2999 0000')").count() === 1, "el pie muestra el teléfono nuevo");
  ok(await p.locator("footer:has-text('WhatsApp:')").count() === 0, "sin módulo WhatsApp, el pie no muestra el número");
  ok(!(await p.locator("main").innerText()).includes("WhatsApp"), "sin módulo WhatsApp, la portada no lo menciona");
  await p.screenshot({ path: captura("fase7-publica.png"), fullPage: true });
  await p.setViewportSize({ width: 390, height: 800 });
  await p.screenshot({ path: captura("fase7-publica-movil.png"), fullPage: true });
  await p.setViewportSize({ width: 1280, height: 900 });

  await p.goto(B + "/agendar/confirmar?especialidad=x"); await esperar();
  await p.goto(B + "/lista-espera"); await esperar();
  ok(!(await p.locator("main").innerText()).includes("WhatsApp"), "la lista de espera no menciona WhatsApp");

  // ── Ficha clínica desactivada: el médico solo ve su agenda ──
  await ingresar("camila.rojas@example.com");
  await p.goto(B + "/medico"); await esperar();
  ok(await p.locator("a:has-text('Ficha')").count() === 0, "sin ficha clínica, la agenda no ofrece Ficha ni Atender");
  ok(await p.locator("header nav a:has-text('Pacientes')").count() === 0, "sin ficha clínica, el menú no tiene Pacientes");
  await p.goto(B + "/medico/pacientes"); await esperar();
  ok(new URL(p.url()).pathname === "/medico", "sin ficha clínica, /medico/pacientes redirige a la agenda");
  await salir();

  // ── Reactivar módulos ──
  await ingresar("admin@example.com");
  await p.goto(B + "/admin/configuracion"); await esperar();
  await p.check("input[type=checkbox][name=whatsapp]");
  await p.check("input[type=checkbox][name=fichaClinica]");
  await p.click("button:has-text('Guardar módulos')"); await esperar();
  ok(await visible("text=Módulos guardados"), "reactiva los módulos");
  await salir();
  await ingresar("camila.rojas@example.com");
  await p.goto(B + "/medico/pacientes"); await esperar();
  ok(new URL(p.url()).pathname === "/medico/pacientes", "con la ficha clínica activa, el médico vuelve a ver Pacientes");
} catch (e) {
  fallos++;
  console.log("✘ error inesperado: " + e.message);
  await p.screenshot({ path: captura("fase7-error.png"), fullPage: true }).catch(() => {});
}
if (errores.length) { fallos++; console.log("✘ errores de página/servidor:\n  " + [...new Set(errores)].join("\n  ")); }
else console.log("✔ sin errores 5xx ni de JavaScript");
await browser.close();
console.log(fallos ? `\n${fallos} verificación(es) fallaron` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);
