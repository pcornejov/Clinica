import { z } from "zod";
import { casilla, textoOpcional } from "~/lib/formularios";

/** Datos editables de un médico (los usa el alta y la edición). */
export const esquemaMedico = z.object({
  nombres: z.string().trim().min(2, "Ingresa los nombres"),
  apellidos: z.string().trim().min(2, "Ingresa los apellidos"),
  email: z.email("Ingresa un correo válido").transform((v) => v.toLowerCase()),
  telefono: textoOpcional,
  registroSis: textoOpcional,
  biografia: textoOpcional,
  atiendeFonasa: casilla,
});
