import { describe, expect, it } from "vitest";
import { esquemaGuardado, esquemaMarca, esquemaReglas } from "./esquema";

const marca = {
  nombre: "Clínica Norte",
  eslogan: "",
  descripcion: "",
  direccion: "",
  telefono: "",
  whatsapp: "",
  email: "",
  horarioAtencion: "",
  logoUrl: "",
  colorTono: "150",
};

describe("esquemaMarca", () => {
  it("acepta datos válidos y convierte el tono a número", () => {
    const r = esquemaMarca.parse(marca);
    expect(r.colorTono).toBe(150);
  });

  it("exige nombre", () => {
    expect(esquemaMarca.safeParse({ ...marca, nombre: " " }).success).toBe(false);
  });

  it("solo acepta logos con https", () => {
    expect(esquemaMarca.safeParse({ ...marca, logoUrl: "https://ejemplo.cl/logo.png" }).success).toBe(true);
    expect(esquemaMarca.safeParse({ ...marca, logoUrl: "http://ejemplo.cl/logo.png" }).success).toBe(false);
    expect(esquemaMarca.safeParse({ ...marca, logoUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("valida el correo solo si se ingresa", () => {
    expect(esquemaMarca.safeParse({ ...marca, email: "contacto@clinica.cl" }).success).toBe(true);
    expect(esquemaMarca.safeParse({ ...marca, email: "no-es-correo" }).success).toBe(false);
  });

  it("limita el tono a 0–360", () => {
    expect(esquemaMarca.safeParse({ ...marca, colorTono: "361" }).success).toBe(false);
    expect(esquemaMarca.safeParse({ ...marca, colorTono: "-1" }).success).toBe(false);
  });
});

describe("esquemaReglas", () => {
  const reglas = {
    anticipacionMinimaHoras: "2",
    diasAgendaVisible: "30",
    cancelacionConDevolucionHoras: "24",
    reservaPagoMinutos: "15",
    recordatorioHorasAntes: "24",
  };

  it("acepta valores válidos", () => {
    expect(esquemaReglas.parse(reglas).reservaPagoMinutos).toBe(15);
  });

  it("rechaza valores fuera de rango o no enteros", () => {
    expect(esquemaReglas.safeParse({ ...reglas, reservaPagoMinutos: "1" }).success).toBe(false);
    expect(esquemaReglas.safeParse({ ...reglas, diasAgendaVisible: "0" }).success).toBe(false);
    expect(esquemaReglas.safeParse({ ...reglas, anticipacionMinimaHoras: "1.5" }).success).toBe(false);
  });
});

describe("esquemaGuardado", () => {
  it("tolera configuraciones incompletas", () => {
    expect(esquemaGuardado.safeParse({}).success).toBe(true);
    expect(esquemaGuardado.safeParse({ nombre: "Solo nombre", reglas: { diasAgendaVisible: 45 } }).success).toBe(true);
  });

  it("rechaza valores corruptos", () => {
    expect(esquemaGuardado.safeParse({ reglas: { diasAgendaVisible: 9999 } }).success).toBe(false);
  });
});
