import { describe, expect, it } from "vitest";
import { construirAviso, textoWhatsapp, type DatosAviso } from "./plantillas";

const datos: DatosAviso = {
  clinica: { nombre: "Centro Médico Demo", direccion: "Av. Ejemplo 1234", telefono: "+56 2 2345 6789" },
  nombre: "Carla",
  especialidad: "Pediatría",
  medico: "Javiera Contreras Silva",
  fechaHora: "Martes, 3 de noviembre, 09:30",
  linkGestion: "https://clinica.test/cita/abc.firma",
  linkAgendar: "https://clinica.test/agendar",
  tokenGestion: "abc.firma",
};

describe("plantillas de avisos", () => {
  it("arma la confirmación por correo y WhatsApp con el link de gestión", () => {
    const aviso = construirAviso("confirmacion", datos);
    expect(aviso.email.asunto).toBe("Hora reservada: Martes, 3 de noviembre, 09:30");
    expect(aviso.email.html).toContain('href="https://clinica.test/cita/abc.firma"');
    expect(textoWhatsapp(aviso.whatsapp)).toBe(
      "Hola Carla, tu hora de Pediatría con Javiera Contreras Silva quedó reservada para el Martes, 3 de noviembre, 09:30. Para ver, cambiar o anular tu hora: https://clinica.test/cita/abc.firma",
    );
  });

  it("el recordatorio trae botones de confirmar y anular con el token firmado", () => {
    const { whatsapp } = construirAviso("recordatorio_24h", datos);
    expect(whatsapp.plantilla).toBe("cita_recordatorio");
    expect(whatsapp.botones?.map((b) => b.payload)).toEqual(["CONFIRMAR:abc.firma", "ANULAR:abc.firma"]);
  });

  it("indica para quién es la hora cuando el aviso va al tutor", () => {
    const { whatsapp, email } = construirAviso("confirmacion", { ...datos, paraQuien: "Tomás" });
    expect(whatsapp.parametros[1]).toBe("Pediatría (para Tomás)");
    expect(email.texto).toContain("Pediatría (para Tomás) con Javiera Contreras Silva");
  });

  it("escapa HTML en los datos", () => {
    const { email } = construirAviso("confirmacion", { ...datos, nombre: "<script>x</script>" });
    expect(email.html).not.toContain("<script>x");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("todas las plantillas usan todos sus parámetros", () => {
    for (const tipo of ["confirmacion", "recordatorio_24h", "reagendamiento", "cancelacion", "lista_espera"] as const) {
      expect(textoWhatsapp(construirAviso(tipo, datos).whatsapp)).not.toMatch(/\{\{\d+\}\}/);
    }
  });
});
