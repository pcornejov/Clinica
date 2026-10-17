import { describe, expect, it } from "vitest";
import { crearTokenGestion, verificarTokenGestion } from "./token-gestion.server";

const ID = "3f2b8c1e-4d5a-4e6f-9a7b-1c2d3e4f5a6b";

describe("token de gestión", () => {
  it("acepta el token emitido y devuelve el id de la cita", async () => {
    const token = await crearTokenGestion(ID, "secreto");
    expect(await verificarTokenGestion(token, "secreto")).toBe(ID);
  });
  it("rechaza firmas alteradas, otro secreto u otra cita", async () => {
    const token = await crearTokenGestion(ID, "secreto");
    const otraCita = ID.replace("3f2b", "0000");
    expect(await verificarTokenGestion(token, "otro")).toBeNull();
    expect(await verificarTokenGestion(`${otraCita}.${token.split(".")[1]}`, "secreto")).toBeNull();
    expect(await verificarTokenGestion(`${token}x`, "secreto")).toBeNull();
    expect(await verificarTokenGestion("basura", "secreto")).toBeNull();
  });
});
