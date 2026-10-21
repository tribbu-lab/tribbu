// src/lib/ayuda.js — Preguntas frecuentes de las familias ("Mi cuenta → Ayuda
// y soporte"). Puro y compartido por web y mobile (@shared/ayuda): un solo
// texto para las dos. Cada pregunta puede llevar `ir` = a qué pantalla lleva
// el botón ({ web: tab de App.jsx, mobile: ruta de Expo Router }).
// Si cambia cómo se hace algo en la app, actualizar acá.

export const PREGUNTAS_FRECUENTES = [
  {
    tema: "Empezar",
    items: [
      {
        id: "hijos",
        pregunta: "Tengo más de un hijo, ¿cómo veo lo de cada uno?",
        respuesta: "Arriba de cada sección está el selector \"Todos mis hijos ▾\". En \"Todos\" ves lo de todos los cursos juntos, cada cosa con el nombre y el color de tu hijo. Elegí uno para ver solo lo suyo. Ahí mismo podés cambiar el color de cada hijo.",
      },
      {
        id: "secciones",
        pregunta: "¿Qué hay en cada sección?",
        respuesta: "Hoy: lo que tenés pendiente, novedades, los próximos días y el menú. Agenda: calendario, horario y cumpleaños. Comunicaciones: avisos y mensajes. Curso: autorizaciones, colectas, encuestas, comedor, talleres, Marketplace, Lost & Found, información útil y contacto. Mi cuenta: tu perfil, notificaciones, contraseña y esta ayuda.",
      },
    ],
  },
  {
    tema: "Avisos y mensajes",
    items: [
      {
        id: "avisos",
        pregunta: "¿Dónde veo los avisos del colegio y del curso?",
        respuesta: "En Comunicaciones → Avisos. Arriba aparecen los importantes que todavía no leíste: tocá \"Ver comunicado\" para leerlo entero y \"Entendido\" cuando lo leíste. Los nuevos también aparecen en Hoy → Novedades.",
        ir: { web: "recordatorios", mobile: "/(tabs)/recordatorios", label: "Ir a Avisos" },
      },
      {
        id: "maestra",
        pregunta: "¿Cómo le escribo a la maestra o a Secretaría?",
        respuesta: "En Comunicaciones → Mensajes tocá \"+ Nuevo\" y elegí la pestaña Maestras o Secretaría. También desde Curso → Contacto → \"Escribir por tribbu\". Tu teléfono y tu mail no se comparten. Si la maestra todavía no usa tribbu, aparece como \"Todavía no usa tribbu\".",
        ir: { web: "mensajes", mobile: "/(tabs)/mensajes", label: "Ir a Mensajes" },
      },
      {
        id: "familias",
        pregunta: "¿Cómo le escribo a otra familia o armo un grupo?",
        respuesta: "En Mensajes → \"+ Nuevo\" → Familias elegís a quién escribirle. Ahí también podés \"Crear un grupo\" o escribirle \"A varias familias\" a la vez. La primera vez te vamos a pedir que aceptes las normas del chat. Si alguien te molesta, desde el chat lo podés bloquear o denunciar un mensaje.",
        ir: { web: "mensajes", mobile: "/(tabs)/mensajes", label: "Ir a Mensajes" },
      },
    ],
  },
  {
    tema: "Responder y pagar",
    items: [
      {
        id: "autorizacion",
        pregunta: "¿Cómo respondo una autorización (salida, actividad)?",
        respuesta: "Te aparece en Hoy como respuesta pendiente: tocá \"Responder autorización\". También está en Curso → Autorizaciones. Elegí si autorizás, quién lo retira y, si querés, dejá un comentario. Podés cambiar la respuesta mientras esté abierta.",
        ir: { web: "autorizaciones", mobile: "/(tabs)/autorizaciones", label: "Ir a Autorizaciones" },
      },
      {
        id: "colecta",
        pregunta: "¿Cómo pago una colecta?",
        respuesta: "En Curso → Colectas abrí la colecta y mirá los datos para pagar. Cuando transfieras, tocá \"Ya transferí\": le avisamos a quien la organiza y, cuando lo confirme, figura como pagada. El pago no se hace por la app.",
        ir: { web: "finanzas", mobile: "/(tabs)/finanzas", label: "Ir a Colectas" },
      },
      {
        id: "encuesta",
        pregunta: "¿Cómo voto en una encuesta?",
        respuesta: "En Curso → Encuestas tocá la opción que elegís. Hay un voto por familia y ves los resultados al momento.",
        ir: { web: "encuestas", mobile: "/(tabs)/encuestas", label: "Ir a Encuestas" },
      },
    ],
  },
  {
    tema: "Agenda",
    items: [
      {
        id: "cumple",
        pregunta: "¿Cómo confirmo si vamos a un cumpleaños?",
        respuesta: "Las invitaciones te aparecen en Hoy. También en Agenda → Cumpleaños: tocá \"Responder →\", decí si van y cuántos hermanos o adultos. Para festejar el de tu hijo tocá \"Crear festejo →\" al lado de su nombre.",
        ir: { web: "cumples", mobile: "/(tabs)/cumples", label: "Ir a Cumpleaños" },
      },
      {
        id: "calendario",
        pregunta: "¿Puedo ver el calendario del colegio en mi celular o en Google Calendar?",
        respuesta: "Sí. En Agenda → Calendario tocá el ícono de sincronizar y elegí el calendario del celular o Google Calendar. Los eventos nuevos y los cambios aparecen solos (Google a veces tarda unas horas en actualizarlos).",
        ir: { web: "clases", mobile: "/(tabs)/calendario", label: "Ir a Calendario" },
      },
      {
        id: "horario",
        pregunta: "¿Dónde veo el horario de clases y el menú del comedor?",
        respuesta: "El horario está en Agenda → Horario. El menú del día está en Hoy, y el de toda la semana o el mes en Curso → Comedor.",
        ir: { web: "horario", mobile: "/(tabs)/horario", label: "Ir a Horario" },
      },
    ],
  },
  {
    tema: "Comunidad",
    items: [
      {
        id: "marketplace",
        pregunta: "¿Cómo vendo o regalo algo en el Marketplace?",
        respuesta: "En Curso → Marketplace tocá \"+ Nuevo\", subí fotos, poné el precio (o \"Lo regalo\") y elegí si lo ve tu curso o todo el colegio. Quien esté interesado te escribe por Mensajes, sin ver tu teléfono ni tu mail. Si te interesa algo, tocá \"Me interesa\" y se abre el chat con quien lo publicó.",
        ir: { web: "marketplace", mobile: "/(tabs)/comunidad?sub=marketplace", label: "Ir al Marketplace" },
      },
      {
        id: "perdidos",
        pregunta: "Mi hijo perdió algo (o encontramos algo), ¿cómo aviso?",
        respuesta: "En Curso → Lost & Found publicá \"Perdí\" o \"Encontré\" con una foto. Si alguien encuentra algo parecido te avisamos. Cuando aparezca, marcalo como resuelto.",
        ir: { web: "perdidos", mobile: "/(tabs)/perdidos", label: "Ir a Lost & Found" },
      },
    ],
  },
  {
    tema: "Mi cuenta",
    items: [
      {
        id: "notificaciones",
        pregunta: "No me llegan las notificaciones, ¿qué hago?",
        respuesta: "Las notificaciones llegan a la app del celular (no a la web). Fijate que tengas la app instalada y que tenga permiso para mandar notificaciones (Ajustes del celular → tribbu). En Mi cuenta → Notificaciones elegís qué avisos automáticos querés recibir (recordatorios del día, resumen semanal, etc.).",
        ir: { web: "cuenta", mobile: "/(tabs)/cuenta", label: "Ir a Mi cuenta" },
      },
      {
        id: "contrasena",
        pregunta: "¿Cómo cambio mi contraseña? ¿Y si me la olvidé?",
        respuesta: "Para cambiarla: Mi cuenta → Cambiar contraseña. Si te la olvidaste, en la pantalla de inicio tocá \"¿Olvidaste tu contraseña?\" y te mandamos un mail para crear una nueva.",
        ir: { web: "cuenta", mobile: "/(tabs)/cuenta", label: "Ir a Mi cuenta" },
      },
      {
        id: "foto",
        pregunta: "¿Cómo pongo mi foto de perfil?",
        respuesta: "En Mi cuenta tocá el círculo con tus iniciales y elegí una foto.",
        ir: { web: "cuenta", mobile: "/(tabs)/cuenta", label: "Ir a Mi cuenta" },
      },
      {
        id: "datos",
        pregunta: "Falta un hijo o hay un dato mal (nombre, curso), ¿cómo lo corrijo?",
        respuesta: "Esos datos los carga el colegio. Escribile a Secretaría desde Mensajes y lo corrigen.",
        ir: { web: "mensajes", mobile: "/(tabs)/mensajes", label: "Ir a Mensajes" },
      },
    ],
  },
];

const normalizar = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Filtra por texto (sin acentos) en pregunta, respuesta y tema; deja los temas con resultados. */
export const buscarPreguntas = (q, lista = PREGUNTAS_FRECUENTES) => {
  const n = normalizar(q).trim();
  if (!n) return lista;
  const palabras = n.split(/\s+/);
  return lista
    .map((g) => ({ ...g, items: g.items.filter((p) => { const t = normalizar(`${g.tema} ${p.pregunta} ${p.respuesta}`); return palabras.every((w) => t.includes(w)); }) }))
    .filter((g) => g.items.length);
};
