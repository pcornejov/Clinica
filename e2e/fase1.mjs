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
const visible = async (sel) => { try { await p.locator(sel).first().waitFor({ state: "visible", timeout: 5000 }); return true; } catch { return false; } };
async function salir() { await p.click("button:has-text('Salir')"); await esperar(); }

try {
  await ingresar("recepcion@example.com");
  await p.goto(B + "/admin/medicos"); await esperar();
  ok(new URL(p.url()).pathname === "/admin", "recepción es redirigida fuera de /admin/medicos");
  ok(await p.locator("header nav a:has-text('Médicos')").count() === 0, "recepción no ve el menú de mantenedores");
  await salir();

  await ingresar("admin@example.com");
  ok(await p.locator("header nav a:has-text('Especialidades')").count() === 1, "admin ve el menú de mantenedores");

  await p.goto(B + "/admin/especialidades"); await esperar();
  await p.click("summary:has-text('Nueva especialidad')");
  await p.fill("details[open] input[name=nombre]", "Oftalmología");
  await p.fill("details[open] input[name=precio]", "42000");
  await p.fill("details[open] textarea[name=descripcion]", "Salud visual y control de la vista.");
  await p.click("button:has-text('Crear especialidad')"); await esperar();
  ok(await visible("summary:has-text('Oftalmología')"), "especialidad Oftalmología creada");

  await p.waitForTimeout(500);
  ok(await p.locator("details[open] input[name=nombre]").inputValue() === "", "el formulario se limpia tras crear");
  await p.fill("details[open] input[name=nombre]", "Oftalmología");
  await p.fill("details[open] input[name=precio]", "1000");
  await p.click("details[open] button:has-text('Crear especialidad')"); await esperar();
  ok(await visible("text=Ya existe una especialidad con ese nombre"), "rechaza especialidad duplicada");

  await p.goto(B + "/admin/especialidades"); await esperar();
  await p.click("summary:has-text('Oftalmología')");
  await p.fill("details[open] input[name=precio]", "45000");
  await p.click("details[open] button:has-text('Guardar')"); await esperar();
  ok(await visible("text=Cambios guardados"), "edita el precio");

  await p.goto(B + "/admin/medicos/nuevo"); await esperar();
  await p.fill("input[name=nombres]", "Elena");
  await p.fill("input[name=apellidos]", "Prado Vidal");
  await p.fill("input[name=rut]", "12.345.678-9");
  await p.fill("input[name=email]", "elena.prado@example.com");
  await p.fill("input[name=password]", "Clave2026!");
  await p.click("button:has-text('Crear médico')"); await esperar();
  ok(await visible("text=RUT inválido"), "rechaza RUT con dígito verificador incorrecto");
  ok(await visible("text=Elige al menos una especialidad"), "exige al menos una especialidad");

  await p.fill("input[name=rut]", "12.345.678-5");
  await p.check("label:has-text('Oftalmología') input");
  await p.fill("input[name=password]", "Clave2026!");
  await p.click("button:has-text('Crear médico')");
  await p.waitForURL(/\/admin\/medicos\/[0-9a-f-]{36}/); await esperar();
  ok(await visible("text=Médico creado"), "médico creado y redirige a su ficha");
  const urlMedico = p.url().split("?")[0];

  await p.selectOption("select[name=diaSemana]", "1");
  await p.fill("input[name=horaInicio]", "09:00"); await p.fill("input[name=horaFin]", "13:00");
  await p.fill("input[name=duracionMinutos]", "20");
  await p.click("button:has-text('Agregar')"); await esperar();
  ok(await visible("li:has-text('Lunes')"), "agrega horario del lunes");
  await p.selectOption("select[name=diaSemana]", "1");
  await p.fill("input[name=horaInicio]", "12:00"); await p.fill("input[name=horaFin]", "15:00");
  await p.click("button:has-text('Agregar')"); await esperar();
  ok(await visible("text=Se cruza con otro horario"), "rechaza horario que se cruza");

  const hoy = new Date().toISOString().slice(0, 10);
  await p.goto(urlMedico); await esperar();
  await p.fill("input[name=inicio]", `${hoy}T00:00`); await p.fill("input[name=fin]", `${hoy}T23:59`);
  await p.click("button:has-text('Bloquear')"); await esperar();
  ok(await visible("text=Bloqueo creado"), "crea bloqueo de agenda");
  await p.click("li:has-text('→') >> button:has-text('Eliminar')"); await esperar();
  ok(await visible("text=Bloqueo eliminado"), "elimina bloqueo");

  await p.check("section:has-text('Especialidades') label:has-text('Medicina General') input");
  await p.uncheck("section:has-text('Especialidades') label:has-text('Oftalmología') input");
  await p.click("button:has-text('Guardar especialidades')"); await esperar();
  ok(await visible("text=tiene horarios"), "no deja quitar una especialidad con horarios");

  await p.click("button:has-text('Desactivar')"); await esperar();
  ok(await visible("text=Médico desactivado"), "desactiva al médico");
  await p.goto(B + "/medicos"); await esperar();
  ok(await p.locator("text=Elena Prado Vidal").count() === 0, "médico inactivo no aparece en la web pública");
  await p.goto(urlMedico); await esperar();
  await p.click("button:has-text('Activar')");
  await visible("text=Médico activado");
  await p.goto(B + "/medicos"); await esperar();
  ok(await p.locator("text=Elena Prado Vidal").count() === 1, "médico reactivado aparece en la web pública");

  await p.goto(B + "/admin/usuarios"); await esperar();
  await p.fill("section input[name=nombre]", "Marta Rivas");
  await p.fill("section input[name=email]", "marta.rivas@example.com");
  await p.fill("section input[name=password]", "Recep2026!");
  await p.click("section button:has-text('Crear')"); await esperar();
  ok(await visible("text=Usuario creado"), "crea usuario de recepción");
  await p.fill("tr:has-text('Marta Rivas') input[name=password]", "NuevaClave2026!");
  await p.click("tr:has-text('Marta Rivas') button:has-text('Cambiar')"); await esperar();
  ok(await visible("text=Contraseña actualizada"), "cambia la contraseña de un usuario");
  await salir();
  await ingresar("marta.rivas@example.com", "NuevaClave2026!");
  ok(new URL(p.url()).pathname === "/admin", "la recepcionista ingresa con la contraseña nueva");
  await salir();
  await ingresar("elena.prado@example.com", "Clave2026!");
  ok(new URL(p.url()).pathname === "/medico", "el nuevo médico ingresa a su portal");
  await salir();

  await ingresar("admin@example.com");
  await p.goto(urlMedico); await esperar(); await p.screenshot({ path: captura("f1-medico.png"), fullPage: true });
  await p.goto(B + "/admin/medicos"); await esperar(); await p.screenshot({ path: captura("f1-medicos.png"), fullPage: true });
} catch (e) {
  fallos++; console.log("✘ EXCEPCIÓN: " + e.message.split("\n")[0]);
  await p.screenshot({ path: captura("f1-error.png"), fullPage: true });
}
console.log(errores.length ? "\nERRORES:\n" + errores.join("\n") : "\nSin errores 5xx ni de página");
console.log(fallos ? `\n${fallos} verificación(es) fallaron` : "\nTodo correcto");
await browser.close();
process.exit(fallos ? 1 : 0);
