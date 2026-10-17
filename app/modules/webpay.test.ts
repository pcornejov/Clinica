import { describe, expect, it } from "vitest";
import { commitAprobado, configWebpay, confirmarTransaccion, crearTransaccion, ordenDeCompra } from "./webpay.server";

const simulado = configWebpay({ TRANSBANK_MODO: "simulado" } as unknown as Env);

describe("webpay", () => {
  it("la orden de compra respeta el máximo de 26 caracteres de Transbank", () => {
    const orden = ordenDeCompra("3f2b8c1e-4d5a-4e6f-9a7b-1c2d3e4f5a6b");
    expect(orden).toHaveLength(26);
    expect(orden).toMatch(/^C[0-9a-f]+$/);
  });

  it("usa las credenciales públicas de integración por defecto", () => {
    const config = configWebpay({ TRANSBANK_MODO: "integracion" } as unknown as Env);
    expect(config.codigoComercio).toBe("597055555532");
  });

  it("exige credenciales propias en producción", () => {
    expect(() => configWebpay({ TRANSBANK_MODO: "produccion" } as unknown as Env)).toThrow(/TRANSBANK_CODIGO_COMERCIO/);
  });

  it("en modo simulado crea un token y apunta al simulador propio", async () => {
    const t = await crearTransaccion(simulado, { ordenCompra: "C1", sesion: "s", monto: 1000, urlRetorno: "x", origen: "https://clinica.test" });
    expect(t.url).toBe("https://clinica.test/pago/simulador");
    expect(t.token).toMatch(/^sim[0-9a-f]{32}$/);
  });

  it("el commit simulado responde con la misma forma que Transbank", async () => {
    const base = { monto: 25000, ordenCompra: "C1", sesion: "s" };
    const ok = await confirmarTransaccion(simulado, "sim1", { resultado: "aprobado", ...base });
    const malo = await confirmarTransaccion(simulado, "sim1", { resultado: "rechazado", ...base });
    expect(commitAprobado(ok)).toBe(true);
    expect(ok.amount).toBe(25000);
    expect(ok.card_detail?.card_number).toBe("6623");
    expect(commitAprobado(malo)).toBe(false);
  });

  it("un commit con response_code 0 pero estado distinto no se considera aprobado", () => {
    expect(commitAprobado({ status: "FAILED", response_code: 0, amount: 1, buy_order: "", session_id: "" })).toBe(false);
  });
});
