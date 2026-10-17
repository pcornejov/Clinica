import { useState } from "react";
import { data, Form } from "react-router";
import { z } from "zod";
import { Aviso, Boton, Campo, CampoTexto, Casilla, Seccion, type ResultadoAccion } from "~/components/formulario";
import { clinica } from "~/config/clinica";
import { esquemaMarca, esquemaReglas } from "~/config/esquema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { casilla, validar } from "~/lib/formularios";
import { requerirRol } from "~/lib/sesion.server";
import { registrarAuditoria } from "~/modules/auditoria.server";
import { guardarConfig } from "~/modules/configuracion.server";
import type { Route } from "./+types/configuracion";

export const middleware: Route.MiddlewareFunction[] = [requerirRol("admin")];

export function meta() {
  return [{ title: "Configuración · Administración" }];
}

export function loader() {
  return { config: structuredClone(clinica) };
}

const esquemaModulos = z.object({ pagoOnline: casilla, whatsapp: casilla, fichaClinica: casilla });

export async function action({ request, context }: Route.ActionArgs) {
  const { db } = context.get(contextoApp);
  const usuario = context.get(contextoUsuario);
  const formulario = await request.formData();
  const intencion = String(formulario.get("intent") ?? "");

  const guardar = async (seccion: string, cambios: Parameters<typeof guardarConfig>[2], mensaje: string) => {
    await guardarConfig(db, usuario.id, cambios);
    await registrarAuditoria(db, request, {
      usuarioId: usuario.id,
      accion: "actualizar",
      entidad: "configuracion",
      detalle: { seccion, cambios },
    });
    return data<ResultadoAccion>({ seccion, ok: mensaje });
  };

  if (intencion === "marca") {
    const r = validar(esquemaMarca, formulario);
    if (!r.ok) return data<ResultadoAccion>({ seccion: "marca", errores: r.errores }, { status: 400 });
    return guardar("marca", r.datos, "Datos de la clínica guardados");
  }
  if (intencion === "reglas") {
    const r = validar(esquemaReglas, formulario);
    if (!r.ok) return data<ResultadoAccion>({ seccion: "reglas", errores: r.errores }, { status: 400 });
    return guardar("reglas", { reglas: r.datos }, "Reglas guardadas");
  }
  if (intencion === "modulos") {
    const r = validar(esquemaModulos, formulario);
    if (!r.ok) return data<ResultadoAccion>({ seccion: "modulos", errores: r.errores }, { status: 400 });
    return guardar("modulos", { modulos: r.datos }, "Módulos guardados");
  }
  return data<ResultadoAccion>({ seccion: "", error: "Acción no válida" }, { status: 400 });
}

function Pie({ resultado, texto }: { resultado?: ResultadoAccion; texto: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {resultado?.ok && <Aviso tipo="ok">{resultado.ok}</Aviso>}
      {resultado?.error && <Aviso tipo="error">{resultado.error}</Aviso>}
      <Boton>{texto}</Boton>
    </div>
  );
}

export default function Configuracion({ loaderData, actionData }: Route.ComponentProps) {
  const c = loaderData.config;
  const resultado = actionData as ResultadoAccion | undefined;
  const de = (seccion: string) => (resultado?.seccion === seccion ? resultado : undefined);
  const [tono, setTono] = useState(c.colorTono);
  const [logo, setLogo] = useState(c.logoUrl);

  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>
      <p className="mt-1 text-sm text-slate-500">
        Lo que cambia entre clínicas: datos de contacto, marca, reglas de agenda y módulos activos. Los cambios se ven
        de inmediato en la web pública y en los avisos.
      </p>

      <div className="mt-6 space-y-6">
        <Seccion titulo="Datos y marca" descripcion="Se muestran en la web pública, los correos, los avisos y las indicaciones impresas.">
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="marca" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombre de la clínica" name="nombre" defaultValue={c.nombre} error={de("marca")?.errores?.nombre} required />
              <Campo etiqueta="Eslogan" name="eslogan" defaultValue={c.eslogan} error={de("marca")?.errores?.eslogan} />
            </div>
            <CampoTexto etiqueta="Descripción" name="descripcion" defaultValue={c.descripcion} error={de("marca")?.errores?.descripcion} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Dirección" name="direccion" defaultValue={c.direccion} error={de("marca")?.errores?.direccion} />
              <Campo etiqueta="Horario de atención" name="horarioAtencion" defaultValue={c.horarioAtencion} error={de("marca")?.errores?.horarioAtencion} />
              <Campo etiqueta="Teléfono" name="telefono" defaultValue={c.telefono} error={de("marca")?.errores?.telefono} />
              <Campo etiqueta="WhatsApp" name="whatsapp" defaultValue={c.whatsapp} error={de("marca")?.errores?.whatsapp} />
              <Campo etiqueta="Correo de contacto" name="email" type="email" defaultValue={c.email} error={de("marca")?.errores?.email} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Campo
                  etiqueta="Logo (enlace a una imagen)"
                  name="logoUrl"
                  defaultValue={c.logoUrl}
                  onChange={(e) => setLogo(e.target.value)}
                  placeholder="https://…/logo.png"
                  ayuda="Opcional. Debe empezar con https://"
                  error={de("marca")?.errores?.logoUrl}
                />
                {/^https:\/\/\S+$/.test(logo) && <img src={logo} alt="Vista previa del logo" className="mt-2 h-10 w-auto" />}
              </div>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Color de marca</span>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    name="colorTono"
                    min={0}
                    max={360}
                    value={tono}
                    onChange={(e) => setTono(Number(e.target.value))}
                    className="w-full accent-marca-600"
                  />
                  <span
                    className="h-8 w-8 shrink-0 rounded-lg border border-slate-200"
                    style={{ backgroundColor: `oklch(0.52 0.1 ${tono})` }}
                    aria-hidden
                  />
                </div>
                {de("marca")?.errores?.colorTono && <span className="mt-1 block text-xs text-rose-600">{de("marca")?.errores?.colorTono}</span>}
              </label>
            </div>
            <Pie resultado={de("marca")} texto="Guardar datos" />
          </Form>
        </Seccion>

        <Seccion titulo="Reglas de agenda" descripcion="Cómo se comporta el agendamiento, los pagos y los recordatorios.">
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="reglas" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo
                etiqueta="Anticipación mínima (horas)"
                name="anticipacionMinimaHoras"
                type="number"
                defaultValue={c.reglas.anticipacionMinimaHoras}
                ayuda="Con cuánta anticipación se puede agendar."
                error={de("reglas")?.errores?.anticipacionMinimaHoras}
              />
              <Campo
                etiqueta="Días de agenda visibles"
                name="diasAgendaVisible"
                type="number"
                defaultValue={c.reglas.diasAgendaVisible}
                ayuda="Cuántos días hacia adelante se ofrecen horas."
                error={de("reglas")?.errores?.diasAgendaVisible}
              />
              <Campo
                etiqueta="Devolución si anula con (horas)"
                name="cancelacionConDevolucionHoras"
                type="number"
                defaultValue={c.reglas.cancelacionConDevolucionHoras}
                ayuda="Anular con más anticipación devuelve el pago."
                error={de("reglas")?.errores?.cancelacionConDevolucionHoras}
              />
              <Campo
                etiqueta="Reserva mientras se paga (min)"
                name="reservaPagoMinutos"
                type="number"
                defaultValue={c.reglas.reservaPagoMinutos}
                ayuda="Tiempo que se retiene la hora en el pago online."
                error={de("reglas")?.errores?.reservaPagoMinutos}
              />
              <Campo
                etiqueta="Recordatorio (horas antes)"
                name="recordatorioHorasAntes"
                type="number"
                defaultValue={c.reglas.recordatorioHorasAntes}
                ayuda="Se aplica a las citas que se agenden desde ahora."
                error={de("reglas")?.errores?.recordatorioHorasAntes}
              />
            </div>
            <Pie resultado={de("reglas")} texto="Guardar reglas" />
          </Form>
        </Seccion>

        <Seccion titulo="Módulos" descripcion="Activa solo lo que esta clínica usa.">
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="modulos" />
            <div className="space-y-3">
              <Casilla etiqueta="Pago en línea (Webpay): el paciente puede pagar al reservar" name="pagoOnline" defaultChecked={c.modulos.pagoOnline} />
              <Casilla etiqueta="WhatsApp: avisos y botones de confirmación por WhatsApp" name="whatsapp" defaultChecked={c.modulos.whatsapp} />
              <Casilla etiqueta="Ficha clínica: portal médico con fichas y atenciones" name="fichaClinica" defaultChecked={c.modulos.fichaClinica} />
            </div>
            <p className="text-xs text-slate-400">
              Desactivar un módulo no borra datos: solo oculta la función. Con la ficha clínica desactivada, los médicos ven
              únicamente su agenda.
            </p>
            <Pie resultado={de("modulos")} texto="Guardar módulos" />
          </Form>
        </Seccion>
      </div>
    </>
  );
}
