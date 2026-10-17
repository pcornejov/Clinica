import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("verifica la contraseña correcta y rechaza la incorrecta", async () => {
    const hash = await hashPassword("Secreta123!");
    expect(hash.startsWith("pbkdf2-sha256$100000$")).toBe(true);
    expect(await verifyPassword({ hash, password: "Secreta123!" })).toBe(true);
    expect(await verifyPassword({ hash, password: "otra" })).toBe(false);
  });

  it("genera hashes distintos para la misma contraseña", async () => {
    expect(await hashPassword("abc")).not.toBe(await hashPassword("abc"));
  });

  it("rechaza hashes con formato desconocido", async () => {
    expect(await verifyPassword({ hash: "scrypt$xyz", password: "abc" })).toBe(false);
  });
});
