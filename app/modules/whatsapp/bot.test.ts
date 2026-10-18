import { describe, expect, it } from "vitest";
import { aCarga, diaCorto, diaHoraCorto, ID, leerOpcion, nombreValido, recortar } from "./bot";

const E = "788bd0ba-23f8-4083-b335-afc3ed167e25";
const M = "69fcc1ec-7cc6-46a4-9a17-d157e53b5370";

describe("identificadores", () => {
  it("cada identificador se lee de vuelta", () => {
    expect(leerOpcion(ID.menu("agendar"))).toEqual({ tipo: "menu", valor: "agendar" });
    expect(leerOpcion(ID.registro(true))).toEqual({ tipo: "registro", acepta: true });
    expect(leerOpcion(ID.consentimiento(false))).toEqual({ tipo: "consentimiento", acepta: false });
    expect(leerOpcion(ID.especialidad(E))).toEqual({ tipo: "especialidad", especialidadId: E });
    expect(leerOpcion(ID.dia(E, "2026-10-19"))).toEqual({ tipo: "dia", especialidadId: E, fecha: "2026-10-19" });
    expect(leerOpcion(ID.hora(E, M, 1792413000))).toEqual({ tipo: "hora", especialidadId: E, medicoId: M, epoch: 1792413000 });
    expect(leerOpcion(ID.confirmar(E, M, 1792413000))).toEqual({ tipo: "confirmar", especialidadId: E, medicoId: M, epoch: 1792413000 });
    expect(leerOpcion(ID.cita(E))).toEqual({ tipo: "cita", citaId: E });
    expect(leerOpcion(ID.anular(E))).toEqual({ tipo: "anular", citaId: E });
    expect(leerOpcion(ID.anularSeguro(E))).toEqual({ tipo: "anularSeguro", citaId: E });
  });

  it("descarta lo que no calza exactamente", () => {
    expect(leerOpcion(undefined)).toBeNull();
    expect(leerOpcion("CONFIRMAR:abc.firma")).toBeNull();
    expect(leerOpcion("bot:menu:otra")).toBeNull();
    expect(leerOpcion("bot:esp:no-es-uuid")).toBeNull();
    expect(leerOpcion(`bot:esp:${E}:extra`)).toBeNull();
    expect(leerOpcion(`bot:dia:${E}:2026-10-19' OR 1=1`)).toBeNull();
    expect(leerOpcion(`xbot:esp:${E}`)).toBeNull();
  });

  it("el identificador más largo cabe en los 200 caracteres de Meta", () => {
    expect(ID.hora(E, M, 1792413000).length).toBeLessThan(200);
  });
});

describe("recortar", () => {
  it("no toca lo que cabe y recorta con puntos suspensivos", () => {
    expect(recortar("Cardiología", 24)).toBe("Cardiología");
    const r = recortar("Una especialidad con un nombre larguísimo", 24);
    expect(r.length).toBeLessThanOrEqual(24);
    expect(r.endsWith("…")).toBe(true);
  });
});

describe("aCarga", () => {
  it("texto simple", () => {
    expect(aCarga({ tipo: "texto", texto: "Hola" })).toEqual({ type: "text", text: { body: "Hola" } });
  });

  it("botones: máximo 3 y títulos de hasta 20 caracteres", () => {
    const c = aCarga({
      tipo: "botones",
      texto: "¿Qué necesitas?",
      botones: [1, 2, 3, 4].map((n) => ({ id: `bot:menu:main${n}`, titulo: "Un título demasiado largo para WhatsApp" })),
    }) as { interactive: { type: string; action: { buttons: { reply: { title: string } }[] } } };
    expect(c.interactive.type).toBe("button");
    expect(c.interactive.action.buttons).toHaveLength(3);
    for (const b of c.interactive.action.buttons) expect(b.reply.title.length).toBeLessThanOrEqual(20);
  });

  it("lista: máximo 10 filas, títulos de 24 y descripciones de 72", () => {
    const filas = Array.from({ length: 14 }, (_, i) => ({
      id: `bot:esp:${i}`,
      titulo: "Título muy pero muy largo de fila",
      descripcion: "d".repeat(100),
    }));
    const c = aCarga({ tipo: "lista", texto: "Elige", boton: "Ver especialidades disponibles", seccion: "Especialidades de la clínica", filas }) as {
      interactive: { action: { button: string; sections: { title: string; rows: { title: string; description: string }[] }[] } };
    };
    const { button, sections } = c.interactive.action;
    expect(button.length).toBeLessThanOrEqual(20);
    expect(sections[0].title.length).toBeLessThanOrEqual(24);
    expect(sections[0].rows).toHaveLength(10);
    for (const f of sections[0].rows) {
      expect(f.title.length).toBeLessThanOrEqual(24);
      expect(f.description.length).toBeLessThanOrEqual(72);
    }
  });
});

describe("fechas cortas", () => {
  it("día corto", () => {
    expect(diaCorto("2026-10-19")).toBe("Lun 19 oct");
  });

  it("día y hora en horario de Chile", () => {
    // 12:30 UTC del 19 de octubre de 2026 = 09:30 en Chile (UTC-3 en horario de verano).
    expect(diaHoraCorto(new Date("2026-10-19T12:30:00Z"))).toBe("Lun 19 oct, 09:30");
  });
});

describe("nombreValido", () => {
  it("acepta nombres y los deja con mayúsculas iniciales", () => {
    expect(nombreValido("  maría   josé ")).toBe("María José");
    expect(nombreValido("Díaz Pérez")).toBe("Díaz Pérez");
    expect(nombreValido("o'higgins")).toBe("O'Higgins");
    expect(nombreValido("ana-lucía")).toBe("Ana-Lucía");
  });

  it("deja las partículas en minúscula salvo al inicio", () => {
    expect(nombreValido("DE LA CRUZ")).toBe("De la Cruz");
    expect(nombreValido("juan de la cruz")).toBe("Juan de la Cruz");
  });

  it("rechaza números, símbolos y largos fuera de rango", () => {
    expect(nombreValido("")).toBeNull();
    expect(nombreValido("a")).toBeNull();
    expect(nombreValido("Juan123")).toBeNull();
    expect(nombreValido("Juan <script>")).toBeNull();
    expect(nombreValido("12345678-5")).toBeNull();
    expect(nombreValido("x".repeat(61))).toBeNull();
    expect(nombreValido(undefined)).toBeNull();
  });
});
