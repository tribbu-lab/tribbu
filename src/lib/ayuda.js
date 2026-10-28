// src/lib/ayuda.js — Preguntas frecuentes ("Ayuda y soporte") de cada perfil:
// familias (PREGUNTAS_FRECUENTES), docentes (PREGUNTAS_DOCENTE) y el panel
// del colegio, administrador y Secretaría (PREGUNTAS_COLEGIO; las que tienen
// `soloAdmin` no las ve la Secretaría, como SOLO_ADMIN_COLEGIO del panel).
// Puro y compartido por web y mobile (@shared/ayuda): un solo texto para las
// dos. Cada pregunta puede llevar `ir` = a qué pantalla lleva el botón
// ({ web: tab de App.jsx, mobile: ruta de Expo Router, panel: `sec` del
// panel del colegio }). Elegir la lista con preguntasPara(rol).
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

export const PREGUNTAS_DOCENTE = [
  {
    tema: "Empezar",
    items: [
      {
        id: "doc-que",
        pregunta: "¿Qué puedo hacer en tribbu?",
        respuesta: "Ver a tus alumnos y sus familias, escribirles por Mensajes (de a una familia o a todo el curso), publicar avisos y eventos para tus cursos, pedir autorizaciones, hacer encuestas, ver los cumpleaños de tus alumnos y los cambios en la salida que avisan las familias. Tu cuenta la crea el colegio.",
        ir: { web: "alumnos", mobile: "/(tabs)/alumnos", label: "Ir a Alumnos" },
      },
      {
        id: "doc-cursos",
        pregunta: "Doy clase en varios cursos, ¿cómo veo cada uno?",
        respuesta: "Arriba de cada sección está el selector de cursos. En \"Todos\" ves lo de todos tus cursos juntos, cada cosa marcada con el nombre del curso. Elegí uno para ver solo lo suyo.",
      },
    ],
  },
  {
    tema: "Mensajes",
    items: [
      {
        id: "doc-familia",
        pregunta: "¿Cómo le escribo a la familia de un alumno?",
        respuesta: "En Comunicaciones → Mensajes tocá \"+ Nuevo\" y, en la pestaña Familias, elegí al alumno. Hay un chat por alumno: lo ven todos sus apoderados. Tu teléfono y tu mail no se comparten.",
        ir: { web: "mensajes", mobile: "/(tabs)/mensajes", label: "Ir a Mensajes" },
      },
      {
        id: "doc-curso",
        pregunta: "¿Cómo le mando un mensaje a todo el curso?",
        respuesta: "En Mensajes → \"+ Nuevo\" → Familias tocá \"A todo el curso\", elegí el curso, escribí el mensaje (podés sumar hasta 3 fotos) y enviá. Le llega a la familia de cada alumno en su chat con vos, con notificación. Si responden, la respuesta es privada: las demás familias no la ven.",
        ir: { web: "mensajes", mobile: "/(tabs)/mensajes", label: "Ir a Mensajes" },
      },
      {
        id: "doc-privacidad",
        pregunta: "¿Quién ve mis chats con las familias?",
        respuesta: "Los apoderados de ese alumno y vos. El colegio (Dirección y Secretaría) puede leerlos, pero no escribe en ellos. Las demás familias no los ven.",
      },
      {
        id: "doc-personal",
        pregunta: "¿Cómo le escribo a otra maestra, a Secretaría o a Dirección?",
        respuesta: "En Mensajes → \"+ Nuevo\" → Personal elegí a la persona, o tocá \"Crear un grupo del personal\". Las familias no ven estos chats.",
        ir: { web: "mensajes", mobile: "/(tabs)/mensajes", label: "Ir a Mensajes" },
      },
    ],
  },
  {
    tema: "Publicar",
    items: [
      {
        id: "doc-aviso",
        pregunta: "¿Cómo publico un aviso para las familias?",
        respuesta: "En Comunicaciones → Avisos tocá \"+ Nuevo\", elegí el curso y escribí el aviso. A las familias les llega una notificación y podés ver quién lo leyó.",
        ir: { web: "recordatorios", mobile: "/(tabs)/recordatorios", label: "Ir a Avisos" },
      },
      {
        id: "doc-evento",
        pregunta: "¿Cómo cargo un evento en el calendario?",
        respuesta: "En Agenda → Calendario tocá \"+ Nuevo\" y elegí el curso, el día y el horario. Lo ven las familias del curso en su calendario.",
        ir: { web: "clases", mobile: "/(tabs)/calendario", label: "Ir a Calendario" },
      },
      {
        id: "doc-autorizacion",
        pregunta: "¿Cómo pido una autorización (salida, actividad)?",
        respuesta: "En Curso → Autorizaciones tocá \"+ Nuevo\", poné el título, la fecha de la salida y, si querés, hasta cuándo responder. Cada familia responde por su hijo y quién lo retira. Ves las respuestas y las podés exportar a Excel.",
        ir: { web: "autorizaciones", mobile: "/(tabs)/autorizaciones", label: "Ir a Autorizaciones" },
      },
      {
        id: "doc-encuesta",
        pregunta: "¿Cómo hago una encuesta a las familias?",
        respuesta: "En Curso → Encuestas tocá \"+ Nuevo\", escribí la pregunta y las opciones. Hay un voto por familia y ves los resultados al momento.",
        ir: { web: "encuestas", mobile: "/(tabs)/encuestas", label: "Ir a Encuestas" },
      },
    ],
  },
  {
    tema: "Mis cursos",
    items: [
      {
        id: "doc-alumnos",
        pregunta: "¿Dónde veo a mis alumnos y sus familias?",
        respuesta: "En Curso → Alumnos: la lista de cada curso con sus apoderados. Con \"Escribir a la familia\" abrís el chat con la familia de ese alumno.",
        ir: { web: "alumnos", mobile: "/(tabs)/alumnos", label: "Ir a Alumnos" },
      },
      {
        id: "doc-salidas",
        pregunta: "¿Cómo sé si un alumno se retira distinto a lo habitual?",
        respuesta: "En Curso → Cambios en la salida ves los avisos de las familias de tus cursos: día, horario y con quién se retira. Los recibe y los confirma la Secretaría del nivel; vos los ves para estar al tanto.",
        ir: { web: "salidas", mobile: "/(tabs)/salidas", label: "Ir a Cambios en la salida" },
      },
      {
        id: "doc-talleres",
        pregunta: "Doy un taller, ¿dónde veo a los inscriptos?",
        respuesta: "En Curso → Mis talleres ves los talleres que das, la lista de inscriptos y podés mandarles un aviso.",
        ir: { web: "talleres", mobile: "/(tabs)/talleres", label: "Ir a Mis talleres" },
      },
    ],
  },
  {
    tema: "Mi cuenta",
    items: [
      {
        id: "doc-notificaciones",
        pregunta: "No me llegan las notificaciones, ¿qué hago?",
        respuesta: "Las notificaciones llegan a la app del celular (no a la web). Fijate que tengas la app instalada y que tenga permiso para mandar notificaciones (Ajustes del celular → tribbu).",
      },
      {
        id: "doc-contrasena",
        pregunta: "¿Cómo cambio mi contraseña? ¿Y si me la olvidé?",
        respuesta: "Para cambiarla: Mi cuenta → Cambiar contraseña. Si te la olvidaste, en la pantalla de inicio tocá \"¿Olvidaste tu contraseña?\" y te mandamos un mail. Si tampoco tenés acceso al mail, pedile al colegio que te la cambie.",
        ir: { web: "cuenta", mobile: "/(tabs)/cuenta", label: "Ir a Mi cuenta" },
      },
      {
        id: "doc-datos",
        pregunta: "Me falta un curso o un alumno, ¿cómo lo corrijo?",
        respuesta: "Tus cursos salen de las clases que el colegio te asignó. Escribile a Secretaría o a Dirección por Mensajes → Personal y lo corrigen.",
        ir: { web: "mensajes", mobile: "/(tabs)/mensajes", label: "Ir a Mensajes" },
      },
    ],
  },
];

export const PREGUNTAS_COLEGIO = [
  {
    tema: "Empezar",
    items: [
      {
        id: "col-secciones",
        pregunta: "¿Qué hay en cada sección del panel?",
        respuesta: "Inicio: lo que tenés para resolver, los próximos días y el colegio en números. Comunicación: comunicados, alertas, eventos, autorizaciones y cambios en la salida. Mensajes: lo que escriben las familias y los chats con el personal. Comunidad: talleres, Marketplace, Lost & Found, denuncias y adopción de la app. Personas: apoderados, alumnos, maestros y directivos. Colegio: cursos, materias, horarios, uniformes, menú, datos y membrete y promoción.",
        ir: { panel: "inicio", label: "Ir al Inicio" },
      },
      {
        id: "col-secretaria",
        pregunta: "¿Qué puede hacer una Secretaría (directivo por nivel)?",
        respuesta: "Lo mismo que el administrador pero solo en los cursos de sus niveles: comunicados, eventos, autorizaciones, alertas, cambios en la salida, horarios y clases, alumnos y familias (crear cuentas y cambiar contraseñas incluido), Room Parents, mensajes de las familias y talleres. No toca cursos, maestras, menú, uniformes, Marketplace ni los datos del colegio, ni crea otros directivos.",
      },
      {
        id: "col-para-resolver",
        pregunta: "¿Qué es \"Tenés N cosas para resolver\" del Inicio?",
        respuesta: "Lo que espera algo del colegio, lo más urgente primero: cambios en la salida sin ver, mensajes de familias sin responder, denuncias, inscripciones a talleres por aprobar, días sin menú, alumnos sin apoderado y cursos sin horario. Cada uno tiene un botón que te lleva a resolverlo.",
        ir: { panel: "inicio", label: "Ir al Inicio" },
      },
    ],
  },
  {
    tema: "Comunicación",
    items: [
      {
        id: "col-comunicado",
        pregunta: "¿Cómo mando un comunicado a todo el colegio, a un nivel o a algunos cursos?",
        respuesta: "En Comunicación → Comunicados tocá \"+ Nuevo\". Arriba elegís \"Todo el colegio\", un nivel o cursos sueltos. Podés darle formato, sumar el membrete y mandar notificación. Después ves cuántas familias lo leyeron.",
        ir: { panel: "comunicaciones", label: "Ir a Comunicados" },
      },
      {
        id: "col-alerta",
        pregunta: "¿Cuándo uso una alerta en vez de un comunicado?",
        respuesta: "Para lo urgente (suspensión de clases, un corte, un cambio de último momento): la alerta les llega con notificación a todas las familias y maestras de los cursos que elijas y aparece arriba de todo en su Inicio.",
        ir: { panel: "alertas", label: "Ir a Alertas" },
      },
      {
        id: "col-evento",
        pregunta: "¿Cómo cargo un evento para varios cursos?",
        respuesta: "En Comunicación → Eventos tocá \"+ Nuevo\" y elegí los cursos (o un nivel entero). Aparece en el calendario de esas familias. Desde ahí también corregís o borrás eventos que cargaron otros.",
        ir: { panel: "eventos", label: "Ir a Eventos" },
      },
      {
        id: "col-autorizacion",
        pregunta: "¿Cómo pido una autorización para una salida?",
        respuesta: "En Comunicación → Autorizaciones tocá \"+ Nuevo\" y elegí los cursos. Cada familia responde por hijo si autoriza, quién lo retira y un comentario. Ves cuántos respondieron, el detalle por alumno y lo exportás a Excel para el día de la salida.",
        ir: { panel: "autorizaciones", label: "Ir a Autorizaciones" },
      },
      {
        id: "col-salidas",
        pregunta: "Una familia avisó un cambio en la salida, ¿qué hago?",
        respuesta: "Le llega una notificación a la Secretaría del nivel del alumno (si el nivel no tiene Secretaría, al administrador). En Comunicación → Cambios en la salida ves el día, el horario, el motivo y con quién se retira. Tocá \"Marcar como visto\": a la familia le llega la confirmación. La maestra del curso también lo ve.",
        ir: { panel: "salidas", label: "Ir a Cambios en la salida" },
      },
    ],
  },
  {
    tema: "Mensajes",
    items: [
      {
        id: "col-mensajes-familias",
        pregunta: "¿Cómo respondo los mensajes de las familias?",
        respuesta: "En Mensajes → De familias están los chats que las familias le abren a Secretaría (uno por alumno). Respondés como \"Secretaría\", sin mostrar tu nombre ni tu teléfono. Ahí también ves, en solo lectura, los chats de las familias con las maestras.",
        ir: { panel: "mensajes_familias", label: "Ir a Mensajes de familias" },
      },
      {
        id: "col-mensajes-personal",
        pregunta: "¿Cómo hablo con las maestras y con otros directivos?",
        respuesta: "En Mensajes → Del personal escribís 1 a 1 o armás un grupo con maestras, Secretarías y Dirección. Las familias no ven estos chats.",
        ir: { panel: "mensajes_personal", label: "Ir a Mensajes del personal" },
      },
      {
        id: "col-denuncias",
        soloAdmin: true,
        pregunta: "Una familia denunció un mensaje, ¿qué hago?",
        respuesta: "Te llega una notificación y aparece en Comunidad → Denuncias. Ves solo el mensaje denunciado (nunca el resto de la conversación) y decidís si eliminás el mensaje o la marcás como resuelta.",
        ir: { panel: "denuncias", label: "Ir a Denuncias" },
      },
    ],
  },
  {
    tema: "Personas",
    items: [
      {
        id: "col-familia",
        pregunta: "¿Cómo creo la cuenta de una familia o le cambio la contraseña?",
        respuesta: "En Personas → Apoderados tocá \"+ Nuevo\", cargá el mail y vinculalo con sus hijos. Desde la misma pantalla le cambiás la contraseña si se la olvidó. La Secretaría puede hacerlo solo con familias de sus niveles.",
        ir: { panel: "usuarios", label: "Ir a Apoderados" },
      },
      {
        id: "col-room",
        pregunta: "¿Cómo nombro a un Room Parent?",
        respuesta: "En Personas → Apoderados abrí a la persona y tocá \"Hacer Room Parent\" en el curso que corresponda. Es por curso: alguien puede ser Room Parent en un curso y apoderado común en otro.",
        ir: { panel: "usuarios", label: "Ir a Apoderados" },
      },
      {
        id: "col-alumno",
        pregunta: "¿Cómo cargo o cambio de curso a un alumno?",
        respuesta: "En Personas → Alumnos agregás alumnos, los editás (nombre, curso y demás datos) y ves sus apoderados. Un alumno sin apoderado vinculado no le llega nada a nadie: aparece en el Inicio para que lo resuelvas.",
        ir: { panel: "alumnos", label: "Ir a Alumnos" },
      },
      {
        id: "col-maestra",
        soloAdmin: true,
        pregunta: "¿Cómo le doy acceso a tribbu a una maestra?",
        respuesta: "En Personas → Maestros abrí a la maestra y usá \"Acceso a Mensajes\": cargás su mail y una contraseña. Con esa cuenta ve sus cursos, les escribe a las familias y publica avisos, eventos, autorizaciones y encuestas. Sus cursos salen de las clases que tenga asignadas en Horarios.",
        ir: { panel: "maestros", label: "Ir a Maestros" },
      },
      {
        id: "col-directivo",
        soloAdmin: true,
        pregunta: "¿Cómo creo una Secretaría o un directivo por nivel?",
        respuesta: "En Personas → Directivos (en la web) elegís los niveles que tiene el colegio y creás la cuenta del directivo con sus niveles y su cargo (Secretaría, Dirección, Coordinación…). Ve y gestiona solo los cursos de esos niveles.",
        ir: { panel: "directivos", label: "Ir a Directivos" },
      },
    ],
  },
  {
    tema: "Colegio",
    items: [
      {
        id: "col-horarios",
        pregunta: "¿Cómo cargo el horario de cada curso?",
        respuesta: "En Colegio → Horarios elegís el curso y cargás cada clase con su materia, maestra, día y horario. Es el mismo horario que ven las familias en Agenda → Horario, y de ahí salen los cursos de cada maestra.",
        ir: { panel: "horarios", label: "Ir a Horarios" },
      },
      {
        id: "col-menu",
        soloAdmin: true,
        pregunta: "¿Cómo cargo el menú del comedor?",
        respuesta: "En Colegio → Menú subís el Excel del mes. Si el colegio tiene más de un nivel, elegís a qué niveles aplica. Después podés corregir un día puntual sin volver a subir todo.",
        ir: { panel: "menu", label: "Ir a Menú" },
      },
      {
        id: "col-promocion",
        soloAdmin: true,
        pregunta: "¿Cómo paso a los alumnos al año siguiente?",
        respuesta: "Primero duplicá los cursos para el año nuevo en Colegio → Cursos. Después, en Colegio → Promoción (en la web), pasás a los alumnos de cada curso al del año siguiente y marcás a quién no promueve.",
        ir: { panel: "cursos", label: "Ir a Cursos" },
      },
      {
        id: "col-adopcion",
        pregunta: "¿Cómo sé cuántas familias usan la app?",
        respuesta: "En Comunidad → Adopción ves, por curso, cuántas familias tienen la app (les llegan las notificaciones), sincronizaron el calendario y entraron en el último mes.",
        ir: { panel: "adopcion", label: "Ir a Adopción" },
      },
    ],
  },
  {
    tema: "Mi cuenta",
    items: [
      {
        id: "col-contrasena",
        pregunta: "¿Cómo cambio mi contraseña? ¿Y si me la olvidé?",
        respuesta: "Para cambiarla: Mi cuenta → Cambiar contraseña. Si te la olvidaste, en la pantalla de inicio tocá \"¿Olvidaste tu contraseña?\" y te mandamos un mail para crear una nueva.",
        ir: { panel: "cuenta", label: "Ir a Mi cuenta" },
      },
      {
        id: "col-soporte",
        pregunta: "Algo no funciona o tengo una duda que no está acá",
        respuesta: "Escribile al equipo de tribbu desde el botón de abajo. Te respondemos en este mismo chat y te avisamos con una notificación.",
      },
    ],
  },
];

/** La lista de cada perfil: familias, docente, o el panel (la Secretaría sin las `soloAdmin`). */
export function preguntasPara(rol) {
  if (rol === "docente") return PREGUNTAS_DOCENTE;
  if (rol === "colegio_admin" || rol === "super") return PREGUNTAS_COLEGIO;
  if (rol === "nivel_admin") {
    return PREGUNTAS_COLEGIO.map((g) => ({ ...g, items: g.items.filter((p) => !p.soloAdmin) })).filter((g) => g.items.length);
  }
  return PREGUNTAS_FRECUENTES;
}

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
