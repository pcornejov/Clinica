import { beforeEach, describe, expect, it } from "vitest";
import { aplicarConfig, canalesAviso, CONFIG_POR_DEFECTO, clinica } from "./clinica";

beforeEach(() => aplicarConfig());

describe("aplicarConfig", () => {
  it("sin datos deja los valores por defecto", () => {
    expect(clinica.nombre).toBe(CONFIG_POR_DEFECTO.nombre);
    expect(clinica.reglas.reservaPagoMinutos).toBe(15);
  });

  it("mezcla lo guardado con los valores por defecto", () => {
    aplicarConfig({ nombre: "Clínica Norte", reglas: { diasAgendaVisible: 45 }, modulos: { whatsapp: false } });
    expect(clinica.nombre).toBe("Clínica Norte");
    expect(clinica.reglas.diasAgendaVisible).toBe(45);
    expect(clinica.reglas.reservaPagoMinutos).toBe(15);
    expect(clinica.modulos).toEqual({ pagoOnline: true, whatsapp: false, botWhatsapp: true, fichaClinica: true });
  });

  it("mantiene la misma referencia, porque otros módulos la importan", () => {
    const antes = clinica;
    aplicarConfig({ nombre: "Otra" });
    expect(clinica).toBe(antes);
  });

  it("al aplicar de nuevo, lo que ya no está guardado vuelve al valor por defecto", () => {
    aplicarConfig({ nombre: "Temporal" });
    aplicarConfig({});
    expect(clinica.nombre).toBe(CONFIG_POR_DEFECTO.nombre);
  });

  it("no modifica los valores por defecto", () => {
    aplicarConfig({ reglas: { diasAgendaVisible: 99 } });
    expect(CONFIG_POR_DEFECTO.reglas.diasAgendaVisible).toBe(30);
  });
});

describe("canalesAviso", () => {
  it("menciona WhatsApp solo si el módulo está activo", () => {
    expect(canalesAviso()).toBe("correo y WhatsApp");
    aplicarConfig({ modulos: { whatsapp: false } });
    expect(canalesAviso()).toBe("correo");
  });
});
