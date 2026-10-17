/**
 * Carga datos de demostración: especialidades, 15 médicos con horarios,
 * usuarios del personal, pacientes, citas e historial clínico de ejemplo.
 *
 * Uso: npm run db:seed   (lee DATABASE_URL desde .dev.vars o .env)
 */
import { config } from "dotenv";
import { count, eq } from "drizzle-orm";
import { crearDb } from "../app/db/client";
import * as s from "../app/db/schema";
import { aInstante, diaSemanaLocal, fechaLocal, sumarDias } from "../app/lib/fechas";
import { hashPassword } from "../app/lib/password";
import { calcularDv } from "../app/lib/rut";
import { CIE10_BASICO, normalizarBusqueda } from "../app/db/cie10-basico";

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

type Caso = { motivo: string; codigo: string; diagnostico: string; anamnesis: string; indicaciones: string };

/** Casos coherentes por especialidad para el historial demo. */
const CASOS: Record<Slug, Caso[]> = {
  "medicina-general": [
    { motivo: "Tos y fiebre", codigo: "J06.9", diagnostico: "Infección aguda de las vías respiratorias superiores, no especificada", anamnesis: "Cuadro de 3 días de tos seca, odinofagia y fiebre hasta 38,2 °C. Sin disnea.", indicaciones: "Paracetamol 1 g cada 8 horas si hay fiebre o dolor. Hidratación abundante. Consultar si presenta dificultad respiratoria." },
    { motivo: "Control de presión arterial", codigo: "I10", diagnostico: "Hipertensión esencial (primaria)", anamnesis: "Paciente hipertenso en tratamiento. Refiere buena adherencia. Sin cefalea ni dolor torácico.", indicaciones: "Mantener tratamiento. Dieta baja en sal. Control de presión en domicilio y nuevo control en 3 meses." },
    { motivo: "Molestias estomacales", codigo: "K30", diagnostico: "Dispepsia", anamnesis: "Ardor epigástrico postprandial de 2 semanas. Sin vómitos ni baja de peso.", indicaciones: "Omeprazol 20 mg en ayunas por 4 semanas. Evitar comidas copiosas, café y alcohol." },
    { motivo: "Chequeo preventivo", codigo: "Z00.0", diagnostico: "Examen médico general", anamnesis: "Asintomático. Consulta para examen preventivo anual.", indicaciones: "Exámenes de sangre en ayunas: perfil lipídico, glicemia y hemograma. Control con resultados." },
    { motivo: "Dolor de cabeza recurrente", codigo: "G44.2", diagnostico: "Cefalea debida a tensión", anamnesis: "Cefalea opresiva bilateral vespertina, asociada a estrés laboral. Sin signos de alarma.", indicaciones: "Ibuprofeno 400 mg cada 8 horas por máximo 3 días si hay dolor. Higiene del sueño y pausas activas." },
  ],
  pediatria: [
    { motivo: "Control de niño sano", codigo: "Z00.1", diagnostico: "Control de salud de rutina del niño", anamnesis: "Control de rutina. Buen incremento ponderal. Desarrollo acorde a la edad.", indicaciones: "Alimentación variada. Vacunas al día según calendario. Próximo control en 6 meses." },
    { motivo: "Fiebre y tos", codigo: "J06.9", diagnostico: "Infección aguda de las vías respiratorias superiores, no especificada", anamnesis: "Fiebre de 2 días hasta 38,5 °C, rinorrea y tos. Buena ingesta de líquidos.", indicaciones: "Paracetamol según peso cada 6 horas si hay fiebre. Aseo nasal con suero. Consultar si respira con dificultad." },
    { motivo: "Diarrea", codigo: "A09", diagnostico: "Diarrea y gastroenteritis de presunto origen infeccioso", anamnesis: "Deposiciones líquidas desde ayer, sin sangre. Bien hidratado.", indicaciones: "Sales de rehidratación oral después de cada deposición. Dieta liviana. Consultar si no tolera líquidos." },
  ],
  ginecologia: [
    { motivo: "Control ginecológico anual", codigo: "Z01.4", diagnostico: "Examen ginecológico (general) (de rutina)", anamnesis: "Control anual. Ciclos regulares. Sin molestias.", indicaciones: "Papanicolaou tomado; se informará resultado. Mamografía según edad. Control en 1 año." },
    { motivo: "Consejería en anticoncepción", codigo: "Z30.0", diagnostico: "Consejo y asesoramiento general sobre la anticoncepción", anamnesis: "Consulta por opciones de anticoncepción. Sin contraindicaciones.", indicaciones: "Se explican alternativas. Iniciar método elegido el primer día de la menstruación. Control en 3 meses." },
    { motivo: "Dolor menstrual", codigo: "N94.6", diagnostico: "Dismenorrea, no especificada", anamnesis: "Dolor pélvico los primeros dos días del ciclo, que limita sus actividades.", indicaciones: "Ibuprofeno 400 mg cada 8 horas desde el inicio del dolor. Ecografía pélvica. Control con resultado." },
  ],
  cardiologia: [
    { motivo: "Control de hipertensión", codigo: "I10", diagnostico: "Hipertensión esencial (primaria)", anamnesis: "Hipertensión en tratamiento. Presiones en domicilio sobre la meta.", indicaciones: "Ajuste de tratamiento antihipertensivo. Registro de presión en domicilio. Control en 1 mes." },
    { motivo: "Palpitaciones", codigo: "I48", diagnostico: "Fibrilación y aleteo auricular", anamnesis: "Episodios de palpitaciones irregulares de minutos de duración.", indicaciones: "Holter de 24 horas y ecocardiograma. Evitar estimulantes. Control con resultados." },
    { motivo: "Colesterol alto", codigo: "E78.0", diagnostico: "Hipercolesterolemia pura", anamnesis: "Exámenes recientes con colesterol LDL elevado. Sin síntomas.", indicaciones: "Dieta baja en grasas saturadas y actividad física 150 minutos a la semana. Perfil lipídico en 3 meses." },
  ],
  dermatologia: [
    { motivo: "Acné", codigo: "L70.0", diagnostico: "Acné vulgar", anamnesis: "Lesiones comedonianas y pápulas en cara de 1 año de evolución.", indicaciones: "Limpieza facial dos veces al día. Tratamiento tópico nocturno. Protector solar diario. Control en 2 meses." },
    { motivo: "Control de lunares", codigo: "D22.9", diagnostico: "Nevo melanocítico, sitio no especificado", anamnesis: "Consulta para revisión de lunares. Sin cambios recientes referidos.", indicaciones: "Lesiones de aspecto benigno a la dermatoscopía. Fotoprotección. Autoexamen mensual. Control anual." },
    { motivo: "Picazón en la piel", codigo: "L20.9", diagnostico: "Dermatitis atópica, no especificada", anamnesis: "Placas eccematosas en pliegues con prurito intenso nocturno.", indicaciones: "Hidratación de la piel dos veces al día. Crema indicada en lesiones por 7 días. Evitar jabones perfumados." },
  ],
  traumatologia: [
    { motivo: "Dolor lumbar", codigo: "M54.5", diagnostico: "Lumbago no especificado", anamnesis: "Dolor lumbar mecánico tras esfuerzo, sin irradiación ni déficit neurológico.", indicaciones: "Paracetamol 1 g cada 8 horas por 5 días. Calor local. Evitar cargar peso. Kinesiología si persiste." },
    { motivo: "Esguince de tobillo", codigo: "S93.4", diagnostico: "Esguince y torcedura del tobillo", anamnesis: "Inversión forzada del tobillo derecho jugando fútbol. Aumento de volumen lateral.", indicaciones: "Reposo, hielo 20 minutos cada 4 horas, vendaje y elevación. Control en 10 días." },
    { motivo: "Dolor de rodilla", codigo: "M17.9", diagnostico: "Gonartrosis, no especificada", anamnesis: "Dolor de rodilla al subir escaleras de meses de evolución.", indicaciones: "Bajar de peso, ejercicios de fortalecimiento de cuádriceps. Radiografía de rodillas. Control con resultado." },
  ],
  psicologia: [
    { motivo: "Ansiedad", codigo: "F41.1", diagnostico: "Trastorno de ansiedad generalizada", anamnesis: "Preocupación persistente, tensión muscular e insomnio de inicio de 6 meses.", indicaciones: "Psicoterapia semanal. Técnicas de respiración diafragmática diarias. Próxima sesión en 1 semana." },
    { motivo: "Estrés laboral", codigo: "F43.2", diagnostico: "Trastornos de adaptación", anamnesis: "Sintomatología ansiosa y anímica asociada a cambios laborales recientes.", indicaciones: "Psicoterapia quincenal. Registro de situaciones gatillantes. Higiene del sueño." },
  ],
  nutricion: [
    { motivo: "Control de peso", codigo: "E66.9", diagnostico: "Obesidad, no especificada", anamnesis: "Consulta para baja de peso. Alimentación con alto consumo de ultraprocesados.", indicaciones: "Plan de alimentación entregado. Aumentar verduras y agua. Actividad física 30 minutos diarios. Control en 1 mes." },
    { motivo: "Orientación alimentaria", codigo: "Z71.3", diagnostico: "Consulta y supervisión de la dieta", anamnesis: "Busca mejorar sus hábitos de alimentación.", indicaciones: "Pauta de alimentación saludable. Planificar comidas semanales. Control en 2 meses." },
  ],
};

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

    // Catálogo CIE-10 básico
    await db.insert(s.cie10).values(
      CIE10_BASICO.map(([codigo, descripcion]) => ({ codigo, descripcion, busqueda: normalizarBusqueda(`${codigo} ${descripcion}`) })),
    );

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
          atiendeFonasa: azar() < 0.7,
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
          consentimientoContactoEn: new Date(),
          isapre: prevision === "isapre" ? elegir(["Colmena", "Cruz Blanca", "Banmédica", "Consalud"]) : null,
        })
        .returning();
      pacientes.push(p);
    }

    // La paciente demo (con cuenta) tiene a su hija como carga familiar.
    await db
      .update(s.pacientes)
      .set({ tutorId: pacientes[0].id, apellidos: "González Cortés" })
      .where(eq(s.pacientes.id, pacientes[8].id));

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
          const slug = especialidades.find((e) => e.id === medico.especialidadId)!.slug as Slug;
          // Pediatría atiende niños y ginecología, mujeres.
          const candidatos =
            slug === "pediatria"
              ? pacientes.filter((p) => (p.fechaNacimiento ?? "") >= "2008-01-01")
              : slug === "ginecologia"
                ? pacientes.filter((p) => p.sexo === "F" && (p.fechaNacimiento ?? "") < "2010-01-01")
                : pacientes.filter((p) => (p.fechaNacimiento ?? "") < "2010-01-01");
          const paciente = elegir(candidatos.length ? candidatos : pacientes);
          const caso = elegir(CASOS[slug]);
          const fin = new Date(inicio.getTime() + medico.duracion * 60_000);
          const pasada = fin.getTime() < ahora;
          const estado: s.EstadoCita = pasada
            ? azar() < 0.88 ? "atendida" : "no_asistio"
            : azar() < 0.5 ? "confirmada" : "agendada";
          const precio = especialidades.find((e) => e.id === medico.especialidadId)!.precio;
          const motivo = caso.motivo;

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
              medio:
                cita.modalidadPago === "online"
                  ? elegir(["webpay", "mercadopago"] as const)
                  : paciente.prevision === "fonasa"
                    ? "bono_fonasa"
                    : paciente.prevision === "isapre"
                      ? "bono_isapre"
                      : elegir(["efectivo", "tarjeta"] as const),
              estado: "pagado",
              monto: precio,
              pagadoEn: cita.modalidadPago === "online" ? new Date(inicio.getTime() - 2 * 86_400_000) : inicio,
              referenciaExterna: `demo-${cita.id.slice(0, 8)}`,
            });
          }

          if (estado === "atendida") {
            const [diagCodigo, diagTexto] = [caso.codigo, caso.diagnostico];
            const [atencion] = await db
              .insert(s.atenciones)
              .values({
                fichaId: fichaPorPaciente.get(paciente.id)!.id,
                medicoId: medico.id,
                citaId: cita.id,
                especialidadId: medico.especialidadId,
                fecha: inicio,
                motivoConsulta: motivo,
                anamnesis: caso.anamnesis,
                examenFisico: "Paciente en buen estado general, vigil, orientado. Sin hallazgos de urgencia.",
                signosVitales: {
                  presionSistolica: 110 + Math.floor(azar() * 35),
                  presionDiastolica: 65 + Math.floor(azar() * 25),
                  frecuenciaCardiaca: 60 + Math.floor(azar() * 35),
                  temperatura: Math.round((36.2 + azar() * 1.6) * 10) / 10,
                  saturacion: 95 + Math.floor(azar() * 5),
                },
                indicaciones: caso.indicaciones,
              })
              .returning();
            await db.insert(s.diagnosticos).values({
              atencionId: atencion.id,
              codigoCie10: diagCodigo,
              descripcion: diagTexto,
            });
            // Igual que en la app: primero los diagnósticos, después se firma.
            await db.update(s.atenciones).set({ estado: "firmada", firmadaEn: fin }).where(eq(s.atenciones.id, atencion.id));
            totalAtenciones++;
          }
        }
      }
    }

    // Lista de espera: dos pacientes esperando hora en dermatología.
    const dermatologia = espPorSlug.get("dermatologia")!;
    await db.insert(s.listaEspera).values(
      [pacientes[3], pacientes[6]].map((p) => ({
        pacienteId: p.id,
        especialidadId: dermatologia.id,
        desde: hoy,
        hasta: sumarDias(hoy, 21),
      })),
    );

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
