/**
 * Carga datos de demostración: especialidades, 15 médicos con horarios,
 * usuarios del personal, pacientes, citas e historial clínico de ejemplo.
 *
 * Uso: npm run db:seed   (lee DATABASE_URL desde .dev.vars o .env)
 */
import { config } from "dotenv";
import { count } from "drizzle-orm";
import { crearDb } from "../app/db/client";
import * as s from "../app/db/schema";
import { aInstante, diaSemanaLocal, fechaLocal, sumarDias } from "../app/lib/fechas";
import { hashPassword } from "../app/lib/password";
import { calcularDv } from "../app/lib/rut";

config({ path: [".dev.vars", ".env"], quiet: true });

export const PASSWORD_DEMO = "Demo1234!";
const DOMINIO = "example.com";

// Generador pseudoaleatorio con semilla, para que los datos sean reproducibles.
let semilla = 20261017;
function azar() {
  semilla = (semilla * 1103515245 + 12345) % 2 ** 31;
  return semilla / 2 ** 31;
}
const elegir = <T>(lista: readonly T[]) => lista[Math.floor(azar() * lista.length)];

let correlativoRut = 0;
function rutFicticio(base: number) {
  const cuerpo = base + correlativoRut++ * 7919;
  return `${cuerpo}-${calcularDv(cuerpo)}`;
}

function sinAcentos(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const ESPECIALIDADES = [
  ["Medicina General", "medicina-general", "Evaluación integral, control de enfermedades crónicas y derivación a especialistas.", 30, 25000],
  ["Pediatría", "pediatria", "Atención de niños y adolescentes, controles de niño sano y vacunas.", 30, 30000],
  ["Ginecología", "ginecologia", "Salud de la mujer, controles preventivos y anticoncepción.", 30, 35000],
  ["Cardiología", "cardiologia", "Diagnóstico y tratamiento de enfermedades del corazón y la presión arterial.", 30, 40000],
  ["Dermatología", "dermatologia", "Enfermedades de la piel, cabello y uñas; control de lunares.", 20, 35000],
  ["Traumatología", "traumatologia", "Lesiones de huesos, articulaciones y músculos; dolor de espalda.", 30, 38000],
  ["Psicología", "psicologia", "Psicoterapia para adultos y adolescentes: ansiedad, estrés y ánimo.", 45, 30000],
  ["Nutrición", "nutricion", "Planes de alimentación personalizados y control de peso.", 45, 25000],
] as const;

type Slug = (typeof ESPECIALIDADES)[number][1];

// [nombres, apellidos, especialidades, turno]
// Turno "am" = lunes, miércoles, viernes y sábado en la mañana; martes y jueves en la tarde.
// Turno "pm" = lo inverso, sin sábado.
const MEDICOS: [string, string, Slug[], "am" | "pm"][] = [
  ["Camila", "Rojas Fuentes", ["medicina-general"], "am"],
  ["Andrés", "Muñoz Soto", ["medicina-general"], "pm"],
  ["Valentina", "Díaz Pérez", ["medicina-general"], "am"],
  ["Tomás", "Navarro Riquelme", ["medicina-general", "cardiologia"], "pm"],
  ["Javiera", "Contreras Silva", ["pediatria"], "am"],
  ["Felipe", "Morales Araya", ["pediatria"], "pm"],
  ["Constanza", "Herrera Vega", ["ginecologia"], "am"],
  ["Daniela", "Castro Núñez", ["ginecologia"], "pm"],
  ["Rodrigo", "Espinoza Torres", ["cardiologia"], "am"],
  ["Francisca", "Tapia Reyes", ["dermatologia"], "pm"],
  ["Matías", "Sepúlveda Lagos", ["traumatologia"], "am"],
  ["Sebastián", "Vargas Pino", ["traumatologia"], "pm"],
  ["Catalina", "Fuentes Ortiz", ["psicologia"], "am"],
  ["Ignacio", "Bravo Cárdenas", ["psicologia"], "pm"],
  ["Antonia", "Gutiérrez Molina", ["nutricion"], "am"],
];

const PACIENTES: [string, string, string, "F" | "M", (typeof s.prevision.enumValues)[number]][] = [
  ["María José", "González Pizarro", "1985-03-12", "F", "fonasa"],
  ["Juan Pablo", "Ramírez Lillo", "1978-11-02", "M", "isapre"],
  ["Fernanda", "Soto Carrasco", "1992-07-25", "F", "isapre"],
  ["Diego", "Alarcón Vidal", "2016-05-09", "M", "fonasa"],
  ["Paula", "Medina Orellana", "1969-01-30", "F", "fonasa"],
  ["Cristóbal", "Figueroa Pinto", "2001-09-14", "M", "particular"],
  ["Isidora", "Jara Valenzuela", "1995-12-03", "F", "isapre"],
  ["Hernán", "Salazar Gallardo", "1957-06-18", "M", "fonasa"],
  ["Martina", "Cortés Aguilera", "2019-02-21", "F", "isapre"],
  ["Gonzalo", "Vera Sandoval", "1988-08-08", "M", "fonasa"],
  ["Rocío", "Miranda Toro", "1999-04-16", "F", "fonasa"],
  ["Luis", "Paredes Ibáñez", "1972-10-27", "M", "isapre"],
];

// Pacientes adicionales generados combinando nombres y apellidos frecuentes.
const NOMBRES_F = ["Sofía", "Florencia", "Agustina", "Emilia", "Josefa", "Trinidad", "Amanda", "Carolina", "Macarena", "Claudia"];
const NOMBRES_M = ["Benjamín", "Vicente", "Joaquín", "Lucas", "Maximiliano", "Nicolás", "Pablo", "Ricardo", "Álvaro", "Jorge"];
const APELLIDOS = ["González", "Muñoz", "Rojas", "Díaz", "Pérez", "Soto", "Silva", "Contreras", "López", "Martínez", "Sepúlveda", "Morales", "Rodríguez", "Araya", "Fuentes"];
for (let i = 0; i < 48; i++) {
  const sexo = i % 2 === 0 ? "F" : "M";
  const nombre = (sexo === "F" ? NOMBRES_F : NOMBRES_M)[Math.floor(i / 2) % 10];
  const apellidos = `${APELLIDOS[(i * 7) % APELLIDOS.length]} ${APELLIDOS[(i * 11 + 3) % APELLIDOS.length]}`;
  const anio = 1950 + ((i * 13) % 70);
  const fecha = `${anio}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`;
  PACIENTES.push([nombre, apellidos, fecha, sexo, (["fonasa", "fonasa", "isapre", "particular"] as const)[i % 4]]);
}

const MOTIVOS = [
  "Control",
  "Dolor de cabeza recurrente",
  "Tos y fiebre",
  "Dolor lumbar",
  "Control de presión arterial",
  "Revisión de exámenes",
  "Molestias estomacales",
  "Chequeo preventivo",
];

const DIAGNOSTICOS: [string, string][] = [
  ["J06.9", "Infección aguda de las vías respiratorias superiores, no especificada"],
  ["I10", "Hipertensión esencial (primaria)"],
  ["M54.5", "Lumbago no especificado"],
  ["R51", "Cefalea"],
  ["K30", "Dispepsia"],
  ["Z00.0", "Examen médico general"],
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (en .dev.vars o .env)");
  const { db, cerrar } = crearDb(url);

  try {
    const [{ n }] = await db.select({ n: count() }).from(s.especialidades);
    if (n > 0) {
      console.log("La base de datos ya tiene datos. Usa `npm run db:reset` para empezar de cero.");
      return;
    }

    const hashDemo = await hashPassword(PASSWORD_DEMO);
    async function crearUsuario(nombre: string, email: string, rol: s.RolUsuario) {
      const id = crypto.randomUUID();
      await db.insert(s.user).values({ id, name: nombre, email, role: rol, emailVerified: true });
      await db.insert(s.account).values({
        id: crypto.randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: hashDemo,
      });
      return id;
    }

    // Personal
    await crearUsuario("Administración Demo", `admin@${DOMINIO}`, "admin");
    await crearUsuario("Recepción Demo", `recepcion@${DOMINIO}`, "recepcion");

    // Especialidades
    const especialidades = await db
      .insert(s.especialidades)
      .values(
        ESPECIALIDADES.map(([nombre, slug, descripcion, duracionMinutos, precio]) => ({
          nombre,
          slug,
          descripcion,
          duracionMinutos,
          precio,
        })),
      )
      .returning();
    const espPorSlug = new Map(especialidades.map((e) => [e.slug, e]));

    // Médicos con usuario y horarios
    const medicos: { id: string; especialidadId: string; duracion: number }[] = [];
    for (const [nombres, apellidos, slugs, turno] of MEDICOS) {
      const email = `${sinAcentos(nombres)}.${sinAcentos(apellidos.split(" ")[0])}@${DOMINIO}`;
      const userId = await crearUsuario(`${nombres} ${apellidos}`, email, "medico");
      const principal = espPorSlug.get(slugs[0])!;
      const [medico] = await db
        .insert(s.medicos)
        .values({
          userId,
          rut: rutFicticio(10_200_000),
          nombres,
          apellidos,
          email,
          telefono: `+569${Math.floor(10_000_000 + azar() * 89_999_999)}`,
          registroSis: String(100_000 + Math.floor(azar() * 800_000)),
          biografia: `Profesional de ${slugs.map((x) => espPorSlug.get(x)!.nombre.toLowerCase()).join(" y ")} con más de ${5 + Math.floor(azar() * 15)} años de experiencia.`,
        })
        .returning();
      await db
        .insert(s.medicoEspecialidades)
        .values(slugs.map((x) => ({ medicoId: medico.id, especialidadId: espPorSlug.get(x)!.id })));

      const manana = { horaInicio: "09:00", horaFin: "13:00" };
      const tarde = { horaInicio: "14:00", horaFin: "18:00" };
      const bloques =
        turno === "am"
          ? [[1, manana], [2, tarde], [3, manana], [4, tarde], [5, manana], [6, manana]] as const
          : [[1, tarde], [2, manana], [3, tarde], [4, manana], [5, tarde]] as const;
      await db.insert(s.horariosMedico).values(
        bloques.map(([diaSemana, b]) => ({
          medicoId: medico.id,
          especialidadId: principal.id,
          diaSemana,
          ...b,
          duracionMinutos: principal.duracionMinutos,
          vigenteDesde: sumarDias(fechaLocal(new Date()), -120),
        })),
      );
      medicos.push({ id: medico.id, especialidadId: principal.id, duracion: principal.duracionMinutos });
    }

    // Pacientes (el primero tiene cuenta para probar el portal del paciente)
    const pacientes = [];
    for (const [i, [nombres, apellidos, fechaNacimiento, sexo, prevision]] of PACIENTES.entries()) {
      const email = `${sinAcentos(nombres.split(" ")[0])}.${sinAcentos(apellidos.split(" ")[0])}${i}@${DOMINIO}`;
      const userId =
        i === 0 ? await crearUsuario(`${nombres} ${apellidos}`, `paciente@${DOMINIO}`, "paciente") : null;
      const [p] = await db
        .insert(s.pacientes)
        .values({
          userId,
          rut: rutFicticio(prevision === "fonasa" ? 15_300_000 : 17_100_000),
          nombres,
          apellidos,
          fechaNacimiento,
          sexo,
          email: i === 0 ? `paciente@${DOMINIO}` : email,
          telefono: `+569${Math.floor(10_000_000 + azar() * 89_999_999)}`,
          prevision,
          isapre: prevision === "isapre" ? elegir(["Colmena", "Cruz Blanca", "Banmédica", "Consalud"]) : null,
        })
        .returning();
      pacientes.push(p);
    }

    // Fichas clínicas
    const fichas = await db
      .insert(s.fichasClinicas)
      .values(
        pacientes.map((p, i) => ({
          pacienteId: p.id,
          grupoSanguineo: elegir(["O+", "O+", "A+", "B+", "AB+", "O-"]),
          alergias: i % 3 === 0 ? "Penicilina" : "No refiere",
          enfermedadesCronicas: i % 4 === 1 ? "Hipertensión arterial" : i % 4 === 2 ? "Asma" : "No refiere",
          medicamentosHabituales: i % 4 === 1 ? "Losartán 50 mg cada 12 horas" : null,
          antecedentesQuirurgicos: i % 5 === 0 ? "Apendicectomía (2010)" : null,
          antecedentesFamiliares: i % 2 === 0 ? "Padre con diabetes tipo 2" : null,
        })),
      )
      .returning();
    const fichaPorPaciente = new Map(fichas.map((f) => [f.pacienteId, f]));

    /** Horarios de inicio disponibles de un médico en una fecha según su horario semanal. */
    const horariosPorMedico = new Map<string, (typeof s.horariosMedico.$inferSelect)[]>();
    for (const h of await db.select().from(s.horariosMedico)) {
      horariosPorMedico.set(h.medicoId, [...(horariosPorMedico.get(h.medicoId) ?? []), h]);
    }
    function cuposDelDia(medicoId: string, fecha: string): Date[] {
      const dia = diaSemanaLocal(aInstante(fecha, "12:00"));
      const cupos: Date[] = [];
      for (const h of horariosPorMedico.get(medicoId) ?? []) {
        if (h.diaSemana !== dia) continue;
        let t = aInstante(fecha, h.horaInicio.slice(0, 5));
        const fin = aInstante(fecha, h.horaFin.slice(0, 5));
        while (t.getTime() + h.duracionMinutos * 60_000 <= fin.getTime()) {
          cupos.push(t);
          t = new Date(t.getTime() + h.duracionMinutos * 60_000);
        }
      }
      return cupos;
    }

    // Citas: historial (últimos 90 días) + agenda de los próximos 7 días.
    const hoy = fechaLocal(new Date());
    const ahora = Date.now();
    let totalCitas = 0;
    let totalAtenciones = 0;

    for (let offset = -90; offset <= 7; offset++) {
      const fecha = sumarDias(hoy, offset);
      for (const medico of medicos) {
        const cupos = cuposDelDia(medico.id, fecha);
        if (cupos.length === 0) continue;
        // Más ocupación en la agenda próxima; historial más disperso.
        const ocupacion = offset >= 0 ? 0.4 : 0.035;
        for (const inicio of cupos) {
          if (azar() > ocupacion) continue;
          const paciente = elegir(pacientes);
          const fin = new Date(inicio.getTime() + medico.duracion * 60_000);
          const pasada = fin.getTime() < ahora;
          const estado: s.EstadoCita = pasada
            ? azar() < 0.88 ? "atendida" : "no_asistio"
            : azar() < 0.5 ? "confirmada" : "agendada";
          const precio = especialidades.find((e) => e.id === medico.especialidadId)!.precio;
          const motivo = elegir(MOTIVOS);

          const [cita] = await db
            .insert(s.citas)
            .values({
              pacienteId: paciente.id,
              medicoId: medico.id,
              especialidadId: medico.especialidadId,
              inicio,
              fin,
              estado,
              canal: elegir(["web", "web", "web", "recepcion", "whatsapp"] as const),
              modalidadPago: azar() < 0.6 ? "online" : "clinica",
              precio,
              motivoConsulta: motivo,
            })
            .returning();
          totalCitas++;

          if (cita.modalidadPago === "online" || estado === "atendida") {
            await db.insert(s.pagos).values({
              citaId: cita.id,
              proveedor: cita.modalidadPago === "online" ? elegir(["webpay", "mercadopago"] as const) : "clinica",
              estado: "pagado",
              monto: precio,
              referenciaExterna: `demo-${cita.id.slice(0, 8)}`,
            });
          }

          if (estado === "atendida") {
            const [diagCodigo, diagTexto] = elegir(DIAGNOSTICOS);
            const [atencion] = await db
              .insert(s.atenciones)
              .values({
                fichaId: fichaPorPaciente.get(paciente.id)!.id,
                medicoId: medico.id,
                citaId: cita.id,
                especialidadId: medico.especialidadId,
                fecha: inicio,
                motivoConsulta: motivo,
                anamnesis: `Paciente consulta por ${motivo.toLowerCase()}. Evolución de ${1 + Math.floor(azar() * 10)} días.`,
                examenFisico: "Paciente en buen estado general, vigil, orientado. Sin hallazgos de urgencia.",
                signosVitales: {
                  presionSistolica: 110 + Math.floor(azar() * 35),
                  presionDiastolica: 65 + Math.floor(azar() * 25),
                  frecuenciaCardiaca: 60 + Math.floor(azar() * 35),
                  temperatura: Math.round((36.2 + azar() * 1.6) * 10) / 10,
                  saturacion: 95 + Math.floor(azar() * 5),
                },
                indicaciones: "Reposo relativo, hidratación abundante. Control en 2 semanas o antes si empeora.",
                estado: "firmada",
                firmadaEn: fin,
              })
              .returning();
            await db.insert(s.diagnosticos).values({
              atencionId: atencion.id,
              codigoCie10: diagCodigo,
              descripcion: diagTexto,
            });
            totalAtenciones++;
          }
        }
      }
    }

    console.log(`✔ ${especialidades.length} especialidades, ${medicos.length} médicos, ${pacientes.length} pacientes`);
    console.log(`✔ ${totalCitas} citas, ${totalAtenciones} atenciones registradas`);
    console.log(`\nUsuarios demo (contraseña: ${PASSWORD_DEMO})`);
    console.log(`  admin@${DOMINIO}       → administración`);
    console.log(`  recepcion@${DOMINIO}   → recepción`);
    console.log(`  camila.rojas@${DOMINIO} → médico (y los demás médicos: nombre.apellido@${DOMINIO})`);
    console.log(`  paciente@${DOMINIO}    → paciente`);
  } finally {
    await cerrar();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
