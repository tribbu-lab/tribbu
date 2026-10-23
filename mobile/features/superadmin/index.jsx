// Super Admin (puerto RN de src/features/superadmin). Consola global de gestión:
// usuarios (alta/edición vía Edge Function manage-auth-user), cursos, maestros,
// alumnos, horarios, uniformes, contacto del colegio, alertas por curso y carga
// del menú. Las cargas masivas usan expo-document-picker + xlsx (mismo patrón
// que Comedor). Se usa TextInput para emoji/avatar (no hay EmojiPicker en mobile).
// El módulo de Códigos de invitación se sacó (2026-09-11) junto con el registro
// por código del login — ver CLAUDE.md.

import { useState, useEffect, useCallback } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLocalSearchParams } from "expo-router";
import { View, Text, Pressable, ScrollView, TextInput, Modal, Alert, KeyboardAvoidingView, StyleSheet, BackHandler, Switch } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsByCurso, getUserIdsParaAlerta } from "../../lib/push";
import { authAdminCreate, authAdminUpdate, authAdminFind } from "../../lib/authAdmin";
import { mensajeErrorAuth } from "@shared/erroresAuth";
import { fmtNombre, fmtF, fmtRangoHora, fmtLocalDate, sanitize, safeUrl, uuidLite, colorColegio } from "@shared/helpers";
import { T, ROL_LABEL } from "@shared/theme";
import { pickAndUploadImage } from "../../lib/media";
import { SignedImage } from "../../components/SignedImage";
import { Pill } from "../../components/Pill";
import { Spinner } from "../../components/Spinner";
import { ListToolbar } from "../../components/ListToolbar";
import { Paginador } from "../../components/Paginador";
import { DateField } from "../../components/DateField";
import { AdjuntosInput } from "../../components/Adjuntos";
import { useListControls } from "../../lib/useListControls";
import { useSession } from "../../context/Session";
import { UploadMenuExcel, Comedor } from "../comedor";
import { ChipLecturas, LecturasSheet } from "../../components/Lecturas";
import { AdopcionLista } from "../../components/Adopcion";
import { AutorizacionesColegio } from "../autorizaciones";
import { TalleresColegio } from "../talleres/colegio";
import { EventosColegio } from "../calendario";
import { BandejaSoporte, BandejaColegio, DenunciasColegio, SoporteColegioAdmin, Mensajes } from "../mensajes";
import { MateriasAdmin, ClasesMaestroEditor, cargarClasesMaestro, guardarClasesMaestro } from "./clases";
import { HorarioCurso, SemanaMaestra } from "../horarios";
import { unirLecturasPorFamilia } from "@shared/lecturas";
import { textoSecretaria, nombreNivel, nivelesParaGuardar, ordenarNiveles } from "@shared/niveles";
import { textoPlano } from "@shared/formato";
import { EditorFormato } from "../../components/EditorFormato";
import { DirectivosAdmin, MembreteAdmin } from "./directivos";
import { CursoListSelector, cursoSelectorStyles } from "../../components/CursoListSelector";
import { BotonNuevo } from "../../components/BotonNuevo";
import { EmptyState } from "../../components/EmptyState";
import { useNoLeidosPanel } from "../../lib/useNoLeidosPanel";
import { PestanasPanel } from "../../components/SubTabs";
import { CambiarPasswordModal } from "../auth";
import { BLUE } from "@shared/tokens";

// Mismas secciones que la web (src/features/superadmin, rediseño sobrio
// 2026-10-22): pocas secciones con íconos de línea y, adentro, pestañas
// (PestanasPanel). Promoción, Marketplace y Lost & Found no tienen pantalla
// acá (son web-only, ver CLAUDE.md), por eso no figuran.
const SECCIONES = [
  { id: "g_comunicacion", l: "Comunicación", icono: "email-outline", items: [
    { id: "comunicaciones", l: "Comunicados" },
    { id: "alertas", l: "Alertas" },
    { id: "eventos", l: "Eventos" },
    { id: "autorizaciones", l: "Autorizaciones" },
  ]},
  { id: "g_mensajes", l: "Mensajes", icono: "message-text-outline", items: [
    { id: "mensajes_familias", l: "De familias", soloColegioAdmin: true },
    { id: "mensajes_personal", l: "Del personal", soloColegioAdmin: true },
  ]},
  { id: "g_comunidad", l: "Comunidad", icono: "heart-outline", items: [
    { id: "talleres", l: "Talleres" },
    { id: "denuncias", l: "Denuncias" },
    { id: "adopcion", l: "Adopción" },
  ]},
  { id: "g_personas", l: "Personas", icono: "account-multiple-outline", items: [
    { id: "usuarios", l: "Apoderados" },
    { id: "alumnos", l: "Alumnos" },
    { id: "maestros", l: "Maestros" },
    { id: "directivos", l: "Directivos" },
  ]},
  { id: "g_colegio", l: "Colegio", icono: "school-outline", items: [
    { id: "cursos", l: "Cursos" },
    { id: "materias", l: "Materias" },
    { id: "horarios", l: "Horarios" },
    { id: "uniformes", l: "Uniformes" },
    { id: "menu", l: "Menú" },
    { id: "colegio", l: "Datos y membrete" },
  ]},
  { id: "g_plataforma", l: "Plataforma", icono: "earth", items: [
    { id: "soporte", l: "Soporte", soloSuper: true },
  ]},
];
const ICONO_PANTALLA = { horarios: "clock-outline", talleres: "palette-outline", adopcion: "chart-bar", soporte: "lifebuoy" };
// Pantallas sueltas, fuera de las secciones (abajo del inicio del panel).
const TITULO_SUELTA = { soporte_colegio: "Ayuda y soporte", cuenta: "Mi cuenta" };

// Fila de lista con ícono de línea (inicio del panel y Mi cuenta).
function Fila({ icono, label, onPress, primera, n = 0 }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fila, !primera && styles.filaBorde, pressed && { backgroundColor: "#F8FAFC" }]} accessibilityRole="button">
      <MaterialCommunityIcons name={icono} size={21} color="#475569" />
      <Text style={styles.filaTxt}>{label}</Text>
      {n > 0 ? (
        <View style={styles.globito}>
          <Text style={styles.globitoTxt}>{n > 99 ? "99+" : n}</Text>
        </View>
      ) : null}
      <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
    </Pressable>
  );

}
// Lo que es de todo el colegio: la Secretaría (por nivel) no lo ve (mismo criterio que la web).
// Materias no: la Secretaría administra las de sus niveles.
const SOLO_ADMIN_COLEGIO = new Set(["directivos", "maestros", "cursos", "uniformes", "denuncias", "colegio", "menu"]);
const COLORES = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#0EA5E9", "#14B8A6"];

// Selector de curso(s) en lista, no chips — con muchos cursos, los chips que
// wrappean se vuelven enormes e inmanejables. Único componente para este
// patrón (antes copy-pasteado en Comunicaciones/Maestros/Alumnos/Alertas/
// Horarios/Uniformes por separado): `multi` decide checkbox (varios) vs.
// checkmark de selección única.

const leerExcel = async () => {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "*/*"],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const b64 = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: "base64" });
  const wb = XLSX.read(b64, { type: "base64", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { raw: true });
};

export function SuperAdmin() {
  // colegio_admin: mismo panel, acotado a su colegio por RLS. Sin sección
  // "Plataforma" (no existe en mobile) y sin el toggle de Super Admin.
  // super: RLS no lo acota (ve todos los colegios), así que elige uno en el
  // selector de arriba y todo el panel se filtra en el cliente a ese colegio
  // — misma lógica que cargar() en la web. Antes mezclaba los datos de todos
  // los colegios y no podía crear cursos (usaba su colegio_id, que es null).
  const { esColegioAdmin, esSecretaria, usuario, logout } = useSession();
  const [cambiarPass, setCambiarPass] = useState(false);
  const miColegioId = usuario?.colegio_id ?? null;
  const [colegios, setColegios] = useState([]);
  const [colegioSel, setColegioSel] = useState(null);
  const [elegirColegio, setElegirColegio] = useState(false);
  const activeColegioId = esColegioAdmin ? miColegioId : colegioSel;
  const [sec, setSec] = useState(null);
  // Sin leer de Mensajes (familias / personal) y Ayuda: solo el staff del colegio.
  const noLeidos = useNoLeidosPanel(esColegioAdmin, sec);
  const [anoActual, setAnoActual] = useState(null); // colegios.año_lectivo_actual del colegio activo
  // Fuerza a <Comedor> (Menú) a recargar tras un upload de Excel — key
  // remontada en vez de exponer un callback nuevo en un componente que hoy
  // no toma props de recarga externa.
  const [menuRefreshKey, setMenuRefreshKey] = useState(0);
  // Menú por niveles (roles-por-nivel): niveles del colegio + para cuáles se carga (vacío = todos).
  const [colegioNiveles, setColegioNiveles] = useState([]);
  const [nombreColegio, setNombreColegio] = useState(""); // el colegio_admin no tiene la lista de colegios
  const [menuNiveles, setMenuNiveles] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [hijos, setHijos] = useState([]);
  const [maestros, setMaestros] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [verApod, setVerApod] = useState(null);

  // super: lista de colegios para el selector; arranca en el primero creado.
  useEffect(() => {
    if (esColegioAdmin) return;
    supabase.from("colegios").select("id,nombre").order("creado_en").then(({ data }) => {
      setColegios(data || []);
      setColegioSel((prev) => prev ?? data?.[0]?.id ?? null);
      if (!data?.length) setLoading(false); // sin colegios cargar() nunca corre
    });
  }, [esColegioAdmin]);

  const cargar = useCallback(async () => {
    // super sin colegio resuelto todavía: no hay nada que mostrar.
    if (!activeColegioId) return;
    setLoading(true);
    const [u, c, h, m, mc, col] = await Promise.all([
      supabase.from("usuarios").select("*, usuario_hijos(hijo_id), usuario_cursos(curso_id, rol)").order("id"),
      supabase.from("cursos").select("*").order("nombre"),
      supabase.from("hijos").select("*").order("id"),
      supabase.from("maestros").select("*").order("id"),
      supabase.from("maestro_cursos").select("*"),
      supabase.from("colegios").select("nombre, año_lectivo_actual, niveles").eq("id", activeColegioId).maybeSingle(),
    ]);
    setAnoActual(col.data?.año_lectivo_actual ?? null);
    setColegioNiveles(ordenarNiveles(col.data?.niveles));
    setNombreColegio(col.data?.nombre || "");
    // RLS ya acota todo para colegio_admin; para super este filtro es el que
    // separa un colegio de otro (ver el comentario de arriba).
    const cursosDelColegio = (c.data || []).filter((x) => x.colegio_id === activeColegioId);
    const cursoIdsSet = new Set(cursosDelColegio.map((x) => x.id));
    const hijosDelColegio = (h.data || []).filter((x) => cursoIdsSet.has(x.curso_id));
    const hijoIdsSet = new Set(hijosDelColegio.map((x) => x.id));
    const usuariosDelColegio = (u.data || []).filter(
      (x) =>
        x.colegio_id === activeColegioId ||
        x.usuario_cursos.some((r) => cursoIdsSet.has(r.curso_id)) ||
        x.usuario_hijos.some((r) => hijoIdsSet.has(r.hijo_id))
    );
    const mcData = (mc.data || []).filter((r) => cursoIdsSet.has(r.curso_id));
    const maestroIdsSet = new Set(mcData.map((r) => r.maestro_id));
    setUsuarios(
      usuariosDelColegio.map((x) => ({
        ...x,
        hijos: x.usuario_hijos.map((r) => r.hijo_id),
        cursos: x.usuario_cursos.map((r) => r.curso_id),
        cursosAdmin: x.usuario_cursos.filter((r) => r.rol === "room").map((r) => r.curso_id),
      }))
    );
    setCursos(cursosDelColegio);
    setHijos(hijosDelColegio);
    setMaestros(
      (m.data || [])
        .filter((x) => maestroIdsSet.has(x.id))
        .map((x) => ({ ...x, cursos: mcData.filter((r) => r.maestro_id === x.id).map((r) => r.curso_id) }))
    );
    const al = await supabase
      .from("hijos")
      .select("*, usuarios:usuario_hijos(usuario_id, usuarios(id,nombre,apellido,email,telefono))")
      .order("nombre");
    setAlumnos((al.data || []).filter((x) => cursoIdsSet.has(x.curso_id)));
    setLoading(false);
  }, [activeColegioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // "Atrás" de Android con un módulo abierto vuelve a la grilla del panel, en
  // vez de sacar de la app (y perder el colegio elegido al volver a abrirla).
  useEffect(() => {
    if (sec === null) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setSec(null);
      return true;
    });
    return () => sub.remove();
  }, [sec]);

  // Push tocado con el panel abierto (push/useNotificationRouting en modo
  // panel): abre la sección que corresponde. Con `c` (un mensaje) la
  // sección sale del tipo de conversación: del personal, de familias
  // (Secretaría o maestra) o Ayuda y soporte. `t` = nonce por toque.
  const params = useLocalSearchParams();
  const [abrirConv, setAbrirConv] = useState(null);
  useEffect(() => {
    if (!params.t) return undefined;
    let vivo = true;
    (async () => {
      let destino = params.sec || null;
      if (params.c) {
        const { data } = await supabase.from("conversaciones").select("tipo").eq("id", params.c).maybeSingle();
        destino = data?.tipo === "colegio" || data?.tipo === "docente" ? "mensajes_familias"
          : data?.tipo === "soporte" ? (esColegioAdmin ? "soporte_colegio" : "soporte")
          : "mensajes_personal";
      }
      if (!vivo || !destino) return;
      setSec(destino);
      setAbrirConv(params.c && destino === "mensajes_personal" ? { id: String(params.c), n: String(params.t) } : null);
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.t]);

  // ── Guardar usuario (crear vía Edge Function / actualizar + sync Auth) ──────────
  const guardarUsuario = async () => {
    if (!form.nombre || !form.email) return;
    if (modal === "nuevo_usuario" && !form.pass) return;
    const apellido = form.apellido || "";
    const avatar = form.avatar || `${(form.nombre || "")[0] || ""}${apellido[0] || ""}`.toUpperCase() || form.nombre.slice(0, 2).toUpperCase();
    // Room Parent solo vale en cursos donde el apoderado tiene un hijo: se
    // descartan asignaciones huérfanas (curso sin hijo, invisibles en el
    // modal) — si no, el delete+reinsert de abajo las recreaba y no había
    // forma de sacarlas desde el panel.
    const cursosConHijoDelForm = new Set((form.hijos || []).map((hid) => hijos.find((h) => h.id === hid)?.curso_id).filter(Boolean));
    const cursosAdminLimpio = (form.cursosAdmin || []).filter((cid) => cursosConHijoDelForm.has(cid));
    const rolGlobal = form.esSuper ? "super" : cursosAdminLimpio.length > 0 ? "room" : "padre";

    if (modal === "nuevo_usuario") {
      let auth_id = null;
      try {
        const { auth_id: newId } = await authAdminCreate(sanitize(form.email).toLowerCase(), form.pass);
        auth_id = newId || null;
      } catch (e) {
        console.warn("Error creando en Auth:", e);
        Alert.alert("No se pudo crear el acceso", String(e?.message || e));
        return;
      }
      // id generado en el cliente: un colegio_admin no puede leer de vuelta la
      // fila recién insertada (RLS la ve vía usuario_cursos/hijos, aún
      // inexistentes) — con .select().single() el alta "no hacía nada".
      const id = uuidLite();
      const { error } = await supabase
        .from("usuarios")
        .insert({
          id,
          nombre: sanitize(form.nombre),
          apellido: sanitize(form.apellido) || null,
          email: sanitize(form.email).toLowerCase(),
          rol: rolGlobal,
          avatar,
          activo: form.activo,
          dni: sanitize(form.dni) || null,
          telefono: sanitize(form.telefono) || null,
          auth_id,
        });
      if (error) { Alert.alert("Error al crear el apoderado", error.message); return; }
      {
        if (cursosAdminLimpio.length)
          await supabase.from("usuario_cursos").insert(cursosAdminLimpio.map((cid) => ({ usuario_id: id, curso_id: cid, rol: "room" })));
        if ((form.hijos || []).length)
          await supabase.from("usuario_hijos").insert((form.hijos || []).map((hid) => ({ usuario_id: id, hijo_id: hid })));
      }
    } else {
      const passNueva = form._passNueva && form._passNueva.trim();
      const emailNuevo = sanitize(form.email).toLowerCase();
      const { error: errUpd } = await supabase
        .from("usuarios")
        .update({
          nombre: sanitize(form.nombre),
          apellido: sanitize(form.apellido) || null,
          email: emailNuevo,
          rol: rolGlobal,
          activo: form.activo,
          dni: sanitize(form.dni) || null,
          telefono: sanitize(form.telefono) || null,
        })
        .eq("id", form.id);
      if (errUpd) { Alert.alert("Error al guardar los cambios", errUpd.message); return; }
      // Sin _emailOriginal no se puede saber si cambió — no dispares el sync de
      // Auth. sanitize() en ambos lados: un email guardado con espacios/
      // mayúsculas (migración vieja) comparado "crudo" contra el nuevo (ya
      // sanitizado) daba emailCambio=true de pura casualidad de formato,
      // mandando un email "nuevo" a Auth y su chequeo de unicidad real en un
      // simple cambio de contraseña.
      const emailCambio = !!form._emailOriginal && emailNuevo !== sanitize(form._emailOriginal).toLowerCase();
      if (passNueva || emailCambio) {
        try {
          let authId = form.auth_id;
          if (!authId) {
            const found = await authAdminFind(form._emailOriginal || form.email);
            authId = found.auth_id || null;
            if (authId) await supabase.from("usuarios").update({ auth_id: authId }).eq("id", form.id);
          }
          if (!authId && passNueva) {
            // De verdad no tiene cuenta de Auth (típico: la carga por Excel la
            // creó pero falló en silencio) — sin esto, "asignar clave para el
            // primer acceso" no tenía forma de crear la cuenta que faltaba.
            const { auth_id: nuevoId } = await authAdminCreate(emailNuevo, passNueva);
            if (nuevoId) {
              authId = nuevoId;
              await supabase.from("usuarios").update({ auth_id: authId }).eq("id", form.id);
              Alert.alert("Cuenta creada", `No tenía cuenta de Auth — se creó una nueva con la contraseña para ${emailNuevo}.`);
            }
          } else if (authId) {
            // current_email: si el auth_id de arriba quedó apuntando a una
            // cuenta borrada/inexistente, la Edge Function reubica la cuenta
            // por email o, si de verdad no existe, la recrea con la clave
            // nueva — antes esto fallaba con "User not found" sin reparo.
            const { auth_id_reparado } = await authAdminUpdate(authId, {
              ...(emailCambio ? { email: emailNuevo } : {}),
              ...(passNueva ? { password: passNueva } : {}),
              current_email: form._emailOriginal || form.email,
            });
            if (auth_id_reparado && auth_id_reparado !== authId) {
              await supabase.from("usuarios").update({ auth_id: auth_id_reparado }).eq("id", form.id);
            }
          }
          if (!authId) {
            Alert.alert("Atención", "No se encontró el usuario en Supabase Auth.");
          }
        } catch (e) {
          console.warn("Error sincronizando Auth:", e);
          Alert.alert("Error sincronizando Auth", e.message || String(e));
        }
      }
      // Re-sincronizar solo las filas admin: las filas rol "padre" (creadas por
      // crear_apoderado en el registro) no se tocan — borrarlas dejaba al
      // apoderado sin membresía de curso.
      await supabase.from("usuario_cursos").delete().eq("usuario_id", form.id).eq("rol", "room");
      await supabase.from("usuario_hijos").delete().eq("usuario_id", form.id);
      if (cursosAdminLimpio.length) {
        await supabase.from("usuario_cursos").insert(cursosAdminLimpio.map((cid) => ({ usuario_id: form.id, curso_id: cid, rol: "room" })));
      }
      if ((form.hijos || []).length)
        await supabase.from("usuario_hijos").insert((form.hijos || []).map((hid) => ({ usuario_id: form.id, hijo_id: hid })));
    }
    setModal(null);
    cargar();
  };

  const guardarCurso = async () => {
    if (!form.nombre) return;
    if (modal === "editar_curso") {
      const { error } = await supabase.from("cursos").update({ nombre: form.nombre, avatar: form.avatar, color: form.color, nivel: form.nivel || null }).eq("id", form.id);
      if (error) { Alert.alert("Error al guardar el curso", error.message); return; }
    } else {
      // cursos.colegio_id y cursos.año_lectivo son NOT NULL — sin esto el
      // insert falla siempre ("Error al guardar el curso" sin detalle).
      if (!activeColegioId) { Alert.alert("No se pudo crear el curso", "No hay un colegio seleccionado."); return; }
      const { error } = await supabase.from("cursos").insert({
        nombre: form.nombre,
        avatar: form.avatar || "🏫",
        color: form.color || "#3B82F6",
        colegio_id: activeColegioId,
        año_lectivo: new Date().getFullYear(),
        // Con un solo nivel, el curso nuevo lo toma solo (roles-por-nivel).
        nivel: form.nivel || (colegioNiveles.length === 1 ? colegioNiveles[0] : null),
      });
      if (error) { Alert.alert("Error al guardar el curso", error.message); return; }
    }
    setModal(null);
    cargar();
  };

  const guardarMaestro = async () => {
    if (!form.nombre) return;
    const apellido = form.apellido || "";
    const avatar = form.avatar || `${(form.nombre || "")[0] || ""}${apellido[0] || ""}`.toUpperCase() || form.nombre.slice(0, 2).toUpperCase();
    let maestroId = form.id;
    if (modal === "nuevo_maestro") {
      // id en el cliente: el colegio_admin no puede leer de vuelta el maestro
      // recién creado (RLS lo ve solo vía maestro_cursos, aún inexistente).
      maestroId = uuidLite();
      const { error } = await supabase
        .from("maestros")
        .insert({
          id: maestroId,
          nombre: sanitize(form.nombre),
          apellido: sanitize(form.apellido) || null,
          email: sanitize(form.email) || null,
          avatar,
          activo: form.activo !== false,
          fecha_nacimiento: form.fecha_nacimiento || null,
        });
      if (error) { Alert.alert("Error al guardar el maestro", error.message); return; }
    } else {
      const { error } = await supabase
        .from("maestros")
        .update({
          nombre: sanitize(form.nombre),
          apellido: sanitize(form.apellido) || null,
          email: sanitize(form.email) || null,
          activo: form.activo !== false,
          fecha_nacimiento: form.fecha_nacimiento || null,
        })
        .eq("id", form.id);
      if (error) { Alert.alert("Error al actualizar el maestro", error.message); return; }
    }
    // Clases (materia × curso): maestro_cursos y el texto de materia los
    // deriva la base. Solo se tocan las clases de los cursos del año vigente.
    const eClases = await guardarClasesMaestro(maestroId, form.clases || [], form._clasesOrig || [], cursosVigentes.map((c) => c.id));
    if (eClases) { Alert.alert("Maestro guardado, pero falló guardar sus clases", eClases.message); return; }
    if (form.darAcceso && !form.usuario_id) {
      if (!(await crearAccesoDocente(maestroId))) return;
    } else if (form.usuario_id && form.accesoPass?.trim()) {
      if (!(await cambiarPassDocente(form.usuario_id, form.accesoPass.trim()))) return;
    }
    setModal(null);
    cargar();
  };

  // Acceso a tribbu para la maestra (rol "docente"): cuenta propia vinculada a
  // la ficha (maestros.usuario_id). Mismo flujo que la web (crearAccesoDocente).
  const crearAccesoDocente = async (maestroId) => {
    const email = sanitize(form.email || "").toLowerCase().trim();
    if (!email || !form.accesoPass?.trim()) { Alert.alert("Faltan datos", "Para dar acceso hacen falta email y contraseña."); return false; }
    if (!activeColegioId) { Alert.alert("Elegí un colegio primero"); return false; }
    let auth_id = null;
    try {
      ({ auth_id } = await authAdminCreate(email, form.accesoPass.trim()));
    } catch (e) { Alert.alert("No se pudo crear el acceso", mensajeErrorAuth(e)); return false; }
    const usuarioId = uuidLite();
    const apellido = form.apellido || "";
    const { error: eU } = await supabase.from("usuarios").insert({
      id: usuarioId, nombre: sanitize(form.nombre), apellido: sanitize(apellido) || null, email,
      rol: "docente", colegio_id: activeColegioId, auth_id, activo: true,
      avatar: `${(form.nombre || "")[0] || ""}${apellido[0] || ""}`.toUpperCase(),
    });
    if (eU) { Alert.alert("No se pudo crear la cuenta", eU.message); return false; }
    const { error: eM } = await supabase.from("maestros").update({ usuario_id: usuarioId }).eq("id", maestroId);
    if (eM) { Alert.alert("Cuenta creada, pero no se pudo vincular", eM.message); return false; }
    Alert.alert("Acceso creado", "Ya puede entrar a tribbu con ese email.");
    return true;
  };
  const cambiarPassDocente = async (usuarioId, pass) => {
    const { data: u } = await supabase.from("usuarios").select("auth_id,email").eq("id", usuarioId).maybeSingle();
    try {
      const r = await authAdminUpdate(u?.auth_id, { password: pass, current_email: u?.email });
      if (r?.auth_id_reparado) await supabase.from("usuarios").update({ auth_id: r.auth_id_reparado }).eq("id", usuarioId);
    } catch (e) { Alert.alert("No se pudo cambiar la contraseña", mensajeErrorAuth(e)); return false; }
    return true;
  };
  const quitarAccesoDocente = () => {
    if (!form.usuario_id) return;
    Alert.alert("¿Quitarle el acceso?", "Ya no va a poder entrar a tribbu; sus conversaciones se conservan.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Quitar acceso", style: "destructive", onPress: async () => {
          await supabase.from("usuarios").update({ activo: false }).eq("id", form.usuario_id);
          const { error } = await supabase.from("maestros").update({ usuario_id: null }).eq("id", form.id);
          if (error) { Alert.alert("No se pudo quitar el acceso", error.message); return; }
          setForm((p) => ({ ...p, usuario_id: null }));
          cargar();
        },
      },
    ]);
  };

  const guardarAlumno = async () => {
    if (!form.nombre || !form.curso_id) return;
    const apellido = form.apellido || "";
    const avatar = form.avatar || `${(form.nombre || "")[0] || ""}${apellido[0] || ""}`.toUpperCase() || form.nombre.slice(0, 2).toUpperCase();
    const color = form.color || COLORES[Math.floor(form.nombre.length % COLORES.length)];
    let error;
    if (modal === "nuevo_alumno") {
      ({ error } = await supabase.from("hijos").insert({
        nombre: sanitize(form.nombre),
        apellido: sanitize(form.apellido) || null,
        curso_id: form.curso_id,
        avatar,
        color,
        fecha_nacimiento: form.fecha_nacimiento || null,
        dni: sanitize(form.dni) || null,
      }));
    } else {
      ({ error } = await supabase
        .from("hijos")
        .update({
          nombre: sanitize(form.nombre),
          apellido: sanitize(form.apellido) || null,
          curso_id: form.curso_id,
          fecha_nacimiento: form.fecha_nacimiento || null,
          dni: sanitize(form.dni) || null,
        })
        .eq("id", form.id));
    }
    if (error) { Alert.alert("Error al guardar el alumno", error.message); return; }
    setModal(null);
    cargar();
  };

  const toggleActivo = async (u) => {
    await supabase.from("usuarios").update({ activo: !u.activo }).eq("id", u.id);
    cargar();
  };
  const eliminarUsuario = async (id) => {
    // Las FKs a usuarios no tienen ON DELETE CASCADE: limpiar todo lo que
    // apunta al usuario (mismo set que la Edge Function delete-account, +
    // encuestas). Lo que es historial del curso se anula. La fila de Auth NO
    // se borra desde acá (requiere service key).
    for (const [tabla, col] of [
      ["push_tokens", "usuario_id"], ["recordatorio_leidos", "usuario_id"],
      ["evento_asistencia", "usuario_id"], ["libro_adquirido", "usuario_id"],
      ["util_adquirido", "usuario_id"], ["uniforme_adquirido", "usuario_id"],
      ["encuesta_votos", "usuario_id"], ["recordatorios", "para_usuario_id"],
      ["usuario_cursos", "usuario_id"], ["usuario_hijos", "usuario_id"],
    ]) {
      await supabase.from(tabla).delete().eq(col, id);
    }
    for (const [tabla, col] of [
      ["colecta_pagos", "pagado_por"], ["colectas", "responsable_id"],
      ["cumples", "responsable_id"], ["encuestas", "creado_por"],
    ]) {
      await supabase.from(tabla).update({ [col]: null }).eq(col, id);
    }
    const { error } = await supabase.from("usuarios").delete().eq("id", id);
    setConfirm(null);
    if (error) {
      console.warn("eliminarUsuario:", error);
      Alert.alert("No se pudo eliminar", error.details || error.message || "Error al eliminar el apoderado");
      return;
    }
    cargar();
  };
  const eliminarCurso = async (id) => {
    // Solo se borra un curso sin alumnos ni contenido (el caso real: un
    // duplicado vacío). Si tiene, se rechaza — el cascade completo desde el
    // cliente sería enorme y frágil.
    // El contenido se cuenta en el servidor (contenido_de_curso): el colegio ya
    // no ve las colectas ni las encuestas de las familias.
    const [al, cont] = await Promise.all([
      supabase.from("hijos").select("id", { count: "exact", head: true }).eq("curso_id", id),
      supabase.rpc("contenido_de_curso", { p_curso: id }),
    ]);
    if (cont.error) { setConfirm(null); Alert.alert("No se pudo revisar el curso", cont.error.message); return; }
    const alumnos = al.count || 0;
    const contenido = cont.data || 0;
    if (alumnos > 0 || contenido > 0) {
      setConfirm(null);
      Alert.alert("No se puede borrar", `El curso tiene ${alumnos} alumno(s) y ${contenido} elemento(s) de contenido. Promové/movés los alumnos y archivá el contenido primero.`);
      return;
    }
    for (const tabla of ["horarios", "usuario_cursos", "maestro_cursos", "uniforme_cursos", "utiles", "libros", "codigos_invitacion"]) {
      await supabase.from(tabla).delete().eq("curso_id", id);
    }
    const { error } = await supabase.from("cursos").delete().eq("id", id);
    setConfirm(null);
    if (error) {
      console.warn("eliminarCurso:", error);
      Alert.alert("No se pudo eliminar", error.details || error.message || "Error al eliminar el curso");
      return;
    }
    cargar();
  };
  const eliminarMaestro = async (id) => {
    await supabase.from("maestro_cursos").delete().eq("maestro_id", id);
    await supabase.from("maestros").delete().eq("id", id);
    setConfirm(null);
    cargar();
  };
  const eliminarAlumno = async (id) => {
    // No hay ON DELETE CASCADE en las FKs que apuntan a hijos: hay que limpiar
    // todo lo que referencia al alumno antes del delete final (asistencias →
    // festejos propios → pagos de colecta → cumpleaños → vínculo apoderados).
    const { data: festejos } = await supabase.from("eventos").select("id").eq("tipo", "festejo").eq("alumno_id", id);
    const festejoIds = (festejos || []).map((e) => e.id);
    await supabase.from("evento_asistencia").delete().eq("alumno_invitado_id", id);
    if (festejoIds.length) {
      await supabase.from("evento_asistencia").delete().in("evento_id", festejoIds);
      await supabase.from("eventos").delete().in("id", festejoIds);
    }
    await supabase.from("colecta_pagos").delete().eq("alumno_id", id);
    await supabase.from("cumples").delete().eq("alumno_id", id);
    await supabase.from("usuario_hijos").delete().eq("hijo_id", id);
    const { error } = await supabase.from("hijos").delete().eq("id", id);
    setConfirm(null);
    if (error) {
      console.warn("eliminarAlumno:", error);
      Alert.alert("No se pudo eliminar", error.details || error.message || "Error al eliminar el alumno");
      return;
    }
    cargar();
  };

  // ── List controls ──────────────────────────────────────────────────────────
  // Las docentes se manejan desde Maestros (web), no en Usuarios.
  // Solo apoderados y Room Parents, como en la web: las cuentas del colegio
  // (administración, directivos, docentes, super) se gestionan en otras pantallas.
  const ctrlUsuarios = useListControls(usuarios.filter((u) => !["docente", "super", "colegio_admin", "nivel_admin"].includes(u.rol)), {
    searchFn: (u, q) => u.nombre.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q),
    sortOptions: [
      { key: "nombre", label: "Nombre", val: (u) => u.nombre },
      { key: "rol", label: "Rol", val: (u) => u.rol },
      { key: "id", label: "Más reciente", val: (u) => u.id },
    ],
    filterOptions: [
      {
        key: "rol",
        label: "Rol",
        options: [
          { value: "padre", label: "Apoderado" },
          { value: "room", label: "Room Parent" },
        ],
        match: (u, v) => u.rol === v,
      },
      {
        key: "activo",
        label: "Estado",
        options: [
          { value: "si", label: "Activo" },
          { value: "no", label: "Inactivo" },
        ],
        match: (u, v) => (v === "si" ? u.activo : !u.activo),
      },
    ],
    pageSize: 12,
  });
  const ctrlAlumnos = useListControls(alumnos, {
    searchFn: (a, q) => `${a.nombre} ${a.apellido || ""}`.toLowerCase().includes(q),
    sortOptions: [
      { key: "nombre", label: "Nombre", val: (a) => a.nombre },
      { key: "apellido", label: "Apellido", val: (a) => a.apellido || "" },
      { key: "nacimiento", label: "Cumpleaños", val: (a) => a.fecha_nacimiento || "z" },
    ],
    filterOptions: [
      { key: "curso", label: "Curso", options: cursos.map((c) => ({ value: String(c.id), label: c.nombre })), match: (a, v) => String(a.curso_id) === v },
    ],
    pageSize: 12,
  });
  const ctrlMaestros = useListControls(maestros, {
    searchFn: (m, q) => fmtNombre(m).toLowerCase().includes(q) || (m.materia || "").toLowerCase().includes(q),
    sortOptions: [
      { key: "nombre", label: "Nombre", val: (m) => fmtNombre(m) },
      { key: "materia", label: "Materia", val: (m) => m.materia || "" },
    ],
    pageSize: 12,
  });

  if (loading) return <Spinner />;

  // Autorizaciones y Adopción: solo los cursos del año lectivo vigente (como la web).
  const cursosVigentes = anoActual ? cursos.filter((c) => c.año_lectivo === anoActual) : cursos;

  const stats = [
    { n: usuarios.filter((u) => u.rol !== "super" && u.rol !== "colegio_admin" && u.rol !== "nivel_admin" && u.rol !== "docente").length, l: "Apoderados" },
    { n: usuarios.filter((u) => u.rol === "room").length, l: "Room Parents" },
    { n: usuarios.filter((u) => !u.activo).length, l: "Inactivos" },
    // Solo los del año vigente, como el Inicio de la web.
    { n: cursosVigentes.length, l: "Cursos" },
  ];
  const seccionesVisibles = SECCIONES
    .map((g) => ({ ...g, items: g.items.filter((i) => (esColegioAdmin ? !i.soloSuper : !i.soloColegioAdmin) && !(esSecretaria && SOLO_ADMIN_COLEGIO.has(i.id))) }))
    .filter((g) => g.items.length)
    // Una sección con una sola pantalla (la Secretaría en Colegio solo tiene
    // Horarios) toma el nombre y el ícono de esa pantalla.
    .map((g) => (g.items.length === 1 ? { ...g, l: g.items[0].l, icono: ICONO_PANTALLA[g.items[0].id] || g.icono } : g));
  const badgeDe = (id) => (id === "mensajes_familias" ? noLeidos.familias : id === "mensajes_personal" ? noLeidos.personal : id === "soporte_colegio" ? noLeidos.soporte : 0);
  const grupoActivo = seccionesVisibles.find((g) => g.items.some((i) => i.id === sec)) || null;
  const rolTexto = esSecretaria ? textoSecretaria(usuario?.niveles, usuario?.cargo) : esColegioAdmin ? "Administración del colegio" : "Super Admin";
  const colegioNombre = colegios.find((c) => c.id === activeColegioId)?.nombre || nombreColegio;
  const hoyTxt = (() => { const t = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }).replace(",", ""); return t.charAt(0).toUpperCase() + t.slice(1); })();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {sec === null ? (
        <View>
          <Text style={styles.fecha}>{hoyTxt}</Text>
          <Text style={styles.h1}>Hola{usuario?.nombre ? `, ${usuario.nombre.split(" ")[0]}` : ""}</Text>
          <Text style={styles.subtitle}>{[rolTexto, colegioNombre].filter(Boolean).join(" · ")}</Text>

          {!esColegioAdmin ? (
            <Pressable
              onPress={() => (colegios.length > 1 ? setElegirColegio(true) : null)}
              style={styles.colegioSelector}
              accessibilityRole="button"
              accessibilityLabel="Cambiar de colegio"
            >
              <Text style={styles.colegioSelectorLbl}>COLEGIO</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.colegioSelectorTxt, { flex: 1 }]} numberOfLines={1}>{colegioNombre || "Sin colegios"}</Text>
                {colegios.length > 1 ? <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" /> : null}
              </View>
            </Pressable>
          ) : null}

          <View style={styles.statsRow}>
            {stats.map((s, i) => (
              <View key={s.l} style={[styles.statCard, i > 0 && styles.statBorde]}>
                <Text style={styles.statLbl} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{s.l}</Text>
                <Text style={styles.statNum}>{s.n}</Text>
              </View>
            ))}
          </View>

          <View style={styles.lista}>
            {seccionesVisibles.map((g, i) => (
              <Fila key={g.id} icono={g.icono} label={g.l} primera={i === 0} n={g.items.reduce((t, it) => t + badgeDe(it.id), 0)} onPress={() => setSec(g.items[0].id)} />
            ))}
          </View>
          <View style={styles.lista}>
            {esColegioAdmin ? <Fila icono="lifebuoy" label="Ayuda y soporte" primera n={noLeidos.soporte} onPress={() => setSec("soporte_colegio")} /> : null}
            <Fila icono="account-circle-outline" label="Mi cuenta" primera={!esColegioAdmin} onPress={() => setSec("cuenta")} />
          </View>
        </View>
      ) : (
        <View>
          <Pressable onPress={() => setSec(null)} style={styles.volverBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volver al panel">
            <MaterialCommunityIcons name="chevron-left" size={22} color={BLUE[600]} />
            <Text style={styles.volverTxt}>Panel</Text>
          </Pressable>
          <Text style={[styles.h1, { marginBottom: 12 }]}>{grupoActivo?.l || TITULO_SUELTA[sec] || ""}</Text>
          {grupoActivo && grupoActivo.items.length > 1 ? (
            <PestanasPanel items={grupoActivo.items.map((i) => ({ id: i.id, label: i.l, badge: badgeDe(i.id) }))} activo={sec} onIr={setSec} />
          ) : null}

      {sec === "cuenta" ? (
        <View>
          <View style={styles.cuentaCard}>
            <Text style={styles.itemNombre}>{usuario?.nombre} {usuario?.apellido || ""}</Text>
            {usuario?.email ? <Text style={styles.itemMeta}>{usuario.email}</Text> : null}
            <Text style={styles.itemMeta}>{[rolTexto, colegioNombre].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={styles.lista}>
            <Fila icono="key-outline" label="Cambiar contraseña" primera onPress={() => setCambiarPass(true)} />
            {esColegioAdmin ? <Fila icono="lifebuoy" label="Ayuda y soporte" n={noLeidos.soporte} onPress={() => setSec("soporte_colegio")} /> : null}
            <Fila icono="logout" label="Cerrar sesión" onPress={logout} />
          </View>
          <CambiarPasswordModal visible={cambiarPass} onClose={() => setCambiarPass(false)} />
        </View>
      ) : null}

      {sec === "usuarios" ? (
        <View>
          <UploadApoderadosExcel onDone={cargar} />
          <View style={styles.filaNuevo}>
            <BotonNuevo
              accessibilityLabel="Agregar apoderado individual"
              onPress={() => {
              setForm({ nombre: "", apellido: "", email: "", pass: "", esSuper: false, cursosAdmin: [], hijos: [], activo: true });
              setModal("nuevo_usuario");
              }}
            />
          </View>
          <ListToolbar {...ctrlUsuarios} placeholder="Buscar por nombre o email..." />
          {ctrlUsuarios.items.map((u) => (
            <View key={u.id} style={[styles.itemCard, !u.activo && styles.itemInactivo]}>
              <View style={styles.flex1}>
                <View style={styles.itemTop}>
                  <Text style={styles.itemNombre}>
                    {u.nombre}
                    {u.apellido ? ` ${u.apellido}` : ""}
                  </Text>
                  <Text style={styles.itemDato}>{ROL_LABEL[u.rol]}</Text>
                  {!u.activo ? <Pill label="Inactivo" color="#94A3B8" bg="#F1F5F9" /> : null}
                </View>
                <Text style={styles.itemMeta}>{u.email}</Text>
                {(u.cursosAdmin || []).length > 0 ? (
                  <Text style={[styles.itemMeta, { color: "#10B981" }]}>
                    Room Parent: {(u.cursosAdmin || []).map((cid) => cursos.find((c) => c.id === cid)?.nombre).filter(Boolean).join(", ")}
                  </Text>
                ) : null}
                {u.hijos.length > 0 ? (
                  <Text style={styles.itemMeta}>Hijos: {u.hijos.map((hid) => hijos.find((h) => h.id === hid)?.nombre).filter(Boolean).join(", ")}</Text>
                ) : null}
              </View>
              <View style={styles.itemBtns}>
                <Pressable
                  onPress={() => {
                    setForm({ ...u, esSuper: u.rol === "super", cursosAdmin: [...(u.cursosAdmin || [])], hijos: [...(u.hijos || [])], _emailOriginal: u.email });
                    setModal({ edit: u });
                  }}
                  style={styles.iconBtn}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={19} color="#475569" />
                </Pressable>
                <Pressable onPress={() => toggleActivo(u)} style={styles.iconBtn}>
                  <MaterialCommunityIcons name={u.activo ? "account-cancel-outline" : "account-check-outline"} size={19} color="#64748B" />
                </Pressable>
                {u.rol !== "super" ? (
                  <Pressable
                    onPress={() => setConfirm({ nombre: `${u.nombre}${u.apellido ? " " + u.apellido : ""}`, msg: "Esta acción no se puede deshacer.", action: () => eliminarUsuario(u.id) })}
                    style={styles.iconBtn}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={19} color="#DC2626" />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          <Paginador pagina={ctrlUsuarios.pagina} totalPag={ctrlUsuarios.totalPag} setPagina={ctrlUsuarios.setPagina} />
        </View>
      ) : null}

      {sec === "cursos" ? (
        <View>
          <View style={styles.filaNuevo}>
            <BotonNuevo
              accessibilityLabel="Agregar nuevo curso"
              onPress={() => {
              setForm({ nombre: "", avatar: "🏫", color: "#3B82F6" });
              setModal("nuevo_curso");
              }}
            />
          </View>
          {cursos.map((c) => {
            const admins = usuarios.filter((u) => u.rol === "room" && u.cursos.includes(c.id));
            // Apoderados (padre o Room Parent) con algún hijo en el curso: son cuentas, no familias.
            const padres = usuarios.filter((u) => (u.rol === "padre" || u.rol === "room") && hijos.filter((h) => h.curso_id === c.id).some((h) => u.hijos.includes(h.id)));
            return (
              <View key={c.id} style={styles.itemCard}>
                <View style={[styles.cursoPunto, { backgroundColor: c.color || "#94A3B8" }]} />
                <View style={styles.flex1}>
                  <Text style={styles.itemNombre}>{c.nombre}</Text>
                  <Text style={styles.itemMeta}>
                    {admins.length} Room Parent{admins.length !== 1 ? "s" : ""} · {padres.length} {padres.length === 1 ? "apoderado" : "apoderados"}
                  </Text>
                </View>
                <View style={styles.itemBtns}>
                  <Pressable
                    onPress={() => {
                      setForm({ ...c });
                      setModal("editar_curso");
                    }}
                    style={styles.iconBtn}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={19} color="#475569" />
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirm({ nombre: c.nombre, msg: "Solo se puede borrar un curso sin alumnos ni contenido. Se borra también su config: horarios, Room Parents, maestros, uniformes, útiles y libros.", action: () => eliminarCurso(c.id) })}
                    style={styles.iconBtn}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={19} color="#DC2626" />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {sec === "maestros" ? (
        <View>
          <View style={styles.filaNuevo}>
            <BotonNuevo
              accessibilityLabel="Agregar nuevo maestro"
              onPress={() => {
              setForm({ nombre: "", apellido: "", email: "", clases: [], _clasesOrig: [], activo: true });
              setModal("nuevo_maestro");
              }}
            />
          </View>
          <ListToolbar {...ctrlMaestros} placeholder="Buscar maestro o materia..." />
          {ctrlMaestros.items.map((m) => (
            <View key={m.id} style={[styles.itemCard, !m.activo && styles.itemInactivo]}>
              <View style={styles.flex1}>
                <View style={styles.itemTop}>
                  <Text style={styles.itemNombre}>{fmtNombre(m)}</Text>
                  
                  {!m.activo ? <Pill label="Inactivo" color="#94A3B8" bg="#F1F5F9" /> : null}
                </View>
                {m.materia ? <Text style={styles.itemMeta}>{m.materia}</Text> : null}
                {m.email ? <Text style={styles.itemMeta}>{m.email}</Text> : null}
                {m.cursos.length > 0 ? (
                  <Text style={styles.itemMeta}>Cursos: {m.cursos.map((cid) => cursos.find((c) => c.id === cid)?.nombre).filter(Boolean).join(", ")}</Text>
                ) : null}
              </View>
              <View style={styles.itemBtns}>
                <Pressable
                  onPress={() => {
                    setForm({ ...m, clases: null, _clasesOrig: [] });
                    cargarClasesMaestro(m.id).then((cl) => setForm((p) => (p.id === m.id ? { ...p, clases: cl, _clasesOrig: cl } : p)));
                    setModal("editar_maestro");
                  }}
                  style={styles.iconBtn}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={19} color="#475569" />
                </Pressable>
                <Pressable onPress={() => setConfirm({ nombre: fmtNombre(m), msg: "Esta acción no se puede deshacer.", action: () => eliminarMaestro(m.id) })} style={styles.iconBtn}>
                  <MaterialCommunityIcons name="trash-can-outline" size={19} color="#DC2626" />
                </Pressable>
              </View>
            </View>
          ))}
          <Paginador pagina={ctrlMaestros.pagina} totalPag={ctrlMaestros.totalPag} setPagina={ctrlMaestros.setPagina} />
        </View>
      ) : null}

      {sec === "alumnos" ? (
        <View>
          <UploadAlumnosExcel cursos={cursos} onDone={cargar} />
          <View style={styles.filaNuevo}>
            <BotonNuevo
              accessibilityLabel="Agregar alumno individual"
              onPress={() => {
              setForm({ nombre: "", curso_id: cursos[0]?.id, fecha_nacimiento: "", color: "" });
              setModal("nuevo_alumno");
              }}
            />
          </View>
          <ListToolbar {...ctrlAlumnos} placeholder="Buscar alumno..." />
          {ctrlAlumnos.items.map((a) => {
            const curso = cursos.find((c) => c.id === a.curso_id);
            const apods = (a.usuarios || []).map((x) => x.usuarios).filter(Boolean);
            return (
              <View key={a.id} style={styles.itemCard}>
                <View style={styles.flex1}>
                  <View style={styles.itemTop}>
                    <Text style={styles.itemNombre}>{fmtNombre(a)}</Text>
                    
                  </View>
                  {curso ? <Text style={styles.itemMeta}>{curso.nombre}</Text> : null}
                  {a.fecha_nacimiento ? <Text style={styles.itemMeta}>Cumpleaños: {fmtF(a.fecha_nacimiento)}</Text> : null}
                  {apods.length > 0 ? <Text style={styles.itemMeta}>Familia: {apods.map((p) => fmtNombre(p)).join(", ")}</Text> : <Text style={[styles.itemMeta, { color: "#B45309" }]}>Sin apoderado vinculado</Text>}
                </View>
                <View style={styles.itemBtns}>
                  <Pressable onPress={() => setVerApod(a)} style={styles.iconBtn} accessibilityLabel="Ver apoderados">
                    <MaterialCommunityIcons name="account-multiple-outline" size={19} color="#475569" />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setForm({ ...a });
                      setModal("editar_alumno");
                    }}
                    style={styles.iconBtn}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={19} color="#475569" />
                  </Pressable>
                  <Pressable onPress={() => setConfirm({ nombre: fmtNombre(a), msg: "Esta acción no se puede deshacer.", action: () => eliminarAlumno(a.id) })} style={styles.iconBtn}>
                    <MaterialCommunityIcons name="trash-can-outline" size={19} color="#DC2626" />
                  </Pressable>
                </View>
              </View>
            );
          })}
          <Paginador pagina={ctrlAlumnos.pagina} totalPag={ctrlAlumnos.totalPag} setPagina={ctrlAlumnos.setPagina} />
        </View>
      ) : null}

      {sec === "colegio" ? <ColegioAdmin key={activeColegioId} colegioId={activeColegioId} /> : null}
      {sec === "colegio" ? <MembreteAdmin key={`m-${activeColegioId}`} colegioId={activeColegioId} /> : null}
      {sec === "directivos" ? <DirectivosAdmin key={activeColegioId} colegioId={activeColegioId} usuarios={usuarios} onCambio={cargar} /> : null}
      {sec === "materias" ? <MateriasAdmin key={activeColegioId} colegioId={activeColegioId} niveles={colegioNiveles} nivelesPropios={esSecretaria ? usuario?.niveles || [] : null} /> : null}
      {sec === "horarios" ? <HorariosAdmin key={activeColegioId} cursos={cursos} colegioId={activeColegioId} /> : null}
      {sec === "uniformes" ? <UniformesAdmin key={activeColegioId} cursos={cursos} colegioId={activeColegioId} /> : null}
      {sec === "alertas" ? <AlertasAdmin cursos={cursos} /> : null}
      {sec === "comunicaciones" ? <ComunicacionesAdmin cursos={cursos} /> : null}
      {sec === "eventos" ? <EventosColegio key={activeColegioId} cursos={cursosVigentes} userId={usuario?.id} esSuper={usuario?.rol === "super"} usuarios={usuarios} /> : null}
      {sec === "autorizaciones" ? <AutorizacionesColegio key={activeColegioId} cursos={cursosVigentes} userId={usuario?.id} /> : null}
      {sec === "talleres" ? <TalleresColegio key={activeColegioId} colegioId={activeColegioId} anoActual={anoActual} /> : null}
      {sec === "adopcion" ? <AdopcionLista cursos={cursosVigentes} /> : null}
      {sec === "denuncias" ? <DenunciasColegio key={activeColegioId} colegioId={activeColegioId} /> : null}
      {sec === "soporte" && !esColegioAdmin ? <BandejaSoporte /> : null}
      {sec === "soporte_colegio" ? <SoporteColegioAdmin /> : null}
      {sec === "mensajes_familias" && esColegioAdmin ? <BandejaColegio /> : null}
      {sec === "mensajes_personal" && esColegioAdmin ? <Mensajes soloPersonal abrirConv={abrirConv?.id || null} nonce={abrirConv?.n || null} /> : null}
      {sec === "menu" ? (
        <View>
                    <Text style={styles.subtitle}>Cargá el menú mensual desde un Excel, revisá lo ya cargado (incluidos meses anteriores) y editá un día puntual sin resubir todo.</Text>
          {colegioNiveles.length > 1 ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.label}>Menú para</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {[{ k: null, l: "Todos los niveles" }, ...colegioNiveles.map((k) => ({ k, l: nombreNivel(k) }))].map((n) => {
                  const sel = nivelesParaGuardar(menuNiveles, colegioNiveles);
                  const on = n.k ? !!sel?.includes(n.k) : !sel;
                  return (
                    <Pressable key={n.k || "todos"} onPress={() => setMenuNiveles((p) => (!n.k ? [] : p.includes(n.k) ? p.filter((x) => x !== n.k) : [...p, n.k]))} style={[cursoSelectorStyles.nivelChip, on && cursoSelectorStyles.nivelChipOn]}>
                      <Text style={[cursoSelectorStyles.nivelTxt, on && cursoSelectorStyles.nivelTxtOn]}>{on ? "✓ " : ""}{n.l}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 6 }}>{nivelesParaGuardar(menuNiveles, colegioNiveles) ? "Lo que cargues o edites es solo para esos niveles: sus familias lo ven en lugar del menú general." : "El menú general: lo ven todos los niveles que no tengan uno propio."}</Text>
            </View>
          ) : null}
          <UploadMenuExcel colegioId={activeColegioId} niveles={nivelesParaGuardar(menuNiveles, colegioNiveles)} onDone={() => setMenuRefreshKey((k) => k + 1)} />
          <Comedor key={`${activeColegioId}-${menuRefreshKey}-${menuNiveles.join(",")}`} colegioId={activeColegioId} niveles={nivelesParaGuardar(menuNiveles, colegioNiveles)} puedeEditar mostrarUpload={false} />
        </View>
      ) : null}
        </View>
      )}

      {/* ── Selector de colegio (solo super) ── */}
      <Modal visible={elegirColegio} transparent animationType="fade" onRequestClose={() => setElegirColegio(false)}>
        <Pressable style={styles.colegioOverlay} onPress={() => setElegirColegio(false)}>
          <View style={styles.colegioSheet}>
            <Text style={styles.cardTitle}>Elegí un colegio</Text>
            <ScrollView style={styles.colegioLista}>
              {colegios.map((c) => {
                const activo = c.id === colegioSel;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setColegioSel(c.id);
                      setSec(null);
                      setElegirColegio(false);
                    }}
                    style={[styles.colegioOpcion, activo && styles.colegioOpcionActiva]}
                  >
                    <Text style={[styles.colegioOpcionTxt, activo && styles.colegioOpcionTxtActiva]}>
                      {activo ? "✓ " : ""}{c.nombre}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* ── Modales CRUD ── */}
      {modal === "nuevo_usuario" || modal?.edit ? (
        <UsuarioModal
          esNuevo={modal === "nuevo_usuario"}
          form={form}
          setForm={setForm}
          cursos={cursos}
          hijos={hijos}
          ocultarAccesoEspecial={esColegioAdmin}
          onClose={() => setModal(null)}
          onSave={guardarUsuario}
        />
      ) : null}
      {modal === "nuevo_curso" || modal === "editar_curso" ? (
        <CursoModal esNuevo={modal === "nuevo_curso"} niveles={colegioNiveles} form={form} setForm={setForm} onClose={() => setModal(null)} onSave={guardarCurso} />
      ) : null}
      {modal === "nuevo_maestro" || modal === "editar_maestro" ? (
        <MaestroModal esNuevo={modal === "nuevo_maestro"} form={form} setForm={setForm} cursos={cursosVigentes} colegioId={activeColegioId} onClose={() => setModal(null)} onSave={guardarMaestro} onQuitarAcceso={quitarAccesoDocente} />
      ) : null}
      {modal === "nuevo_alumno" || modal === "editar_alumno" ? (
        <AlumnoModal esNuevo={modal === "nuevo_alumno"} form={form} setForm={setForm} cursos={cursos} onClose={() => setModal(null)} onSave={guardarAlumno} />
      ) : null}
      {verApod ? <ApoderadosModal alumno={verApod} onClose={() => setVerApod(null)} /> : null}
      {confirm ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
          <View style={styles.overlay}>
            <View style={[styles.modalCard, { maxHeight: undefined }]}>
              <Text style={styles.modalTitle}>¿Eliminar?</Text>
              {confirm.nombre ? <Text style={styles.confirmNombre}>{confirm.nombre}</Text> : null}
              <Text style={styles.subtitle}>{confirm.msg}</Text>
              <View style={styles.modalBtns}>
                <Pressable onPress={() => setConfirm(null)} style={styles.cancelBtn}>
                  <Text style={styles.cancelTxt}>Cancelar</Text>
                </Pressable>
                <Pressable onPress={confirm.action} style={[styles.saveBtn, { backgroundColor: "#EF4444" }]}>
                  <Text style={styles.saveTxt}>Eliminar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </ScrollView>
  );
}

// ── UsuarioModal ────────────────────────────────────────────────────────────────
function UsuarioModal({ esNuevo, form, setForm, cursos, hijos, ocultarAccesoEspecial = false, onClose, onSave }) {
  const busq = (form._busqHijo || "").toLowerCase();
  const filtrados = busq
    ? hijos
        .filter((h) => {
          const nombre = `${h.nombre} ${h.apellido || ""}`.toLowerCase();
          const curso = cursos.find((c) => c.id === h.curso_id);
          return nombre.includes(busq) || (curso?.nombre || "").toLowerCase().includes(busq);
        })
        .slice(0, 8)
    : [];
  const cursosConHijos = [...new Set((form.hijos || []).map((hid) => hijos.find((h) => h.id === hid)?.curso_id).filter(Boolean))];

  const quitarHijo = (hid) =>
    setForm((p) => {
      const newHijos = p.hijos.filter((x) => x !== hid);
      const setCursos = new Set(newHijos.map((id) => hijos.find((x) => x.id === id)?.curso_id).filter(Boolean));
      return { ...p, hijos: newHijos, cursosAdmin: (p.cursosAdmin || []).filter((cid) => setCursos.has(cid)) };
    });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{esNuevo ? "Nuevo apoderado" : "Editar apoderado"}</Text>
            {[
              { l: "Nombre", k: "nombre", ph: "Ej: María" },
              { l: "Apellido", k: "apellido", ph: "Ej: García" },
              { l: "Email", k: "email", ph: "maria@mail.com" },
              { l: "DNI", k: "dni", ph: "Ej: 12345678" },
              { l: "Teléfono", k: "telefono", ph: "Ej: +54 11 1234-5678" },
            ].map((f) => (
              <View key={f.k}>
                <Text style={styles.label}>{f.l.toUpperCase()}</Text>
                <TextInput
                  value={form[f.k] || ""}
                  onChangeText={(t) => setForm((p) => ({ ...p, [f.k]: t }))}
                  placeholder={f.ph}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize={f.k === "email" ? "none" : "sentences"}
                  keyboardType={f.k === "email" ? "email-address" : f.k === "telefono" ? "phone-pad" : "default"}
                  style={styles.input}
                />
              </View>
            ))}
            <Text style={styles.label}>{esNuevo ? "CONTRASEÑA" : "NUEVA CONTRASEÑA"}</Text>
            <TextInput
              value={esNuevo ? form.pass || "" : form._passNueva || ""}
              onChangeText={(t) => (esNuevo ? setForm((p) => ({ ...p, pass: t })) : setForm((p) => ({ ...p, _passNueva: t })))}
              placeholder={esNuevo ? "Contraseña de acceso" : "Dejar vacío para no cambiar"}
              placeholderTextColor="#94A3B8"
              secureTextEntry
              autoCapitalize="none"
              style={styles.input}
            />

            {ocultarAccesoEspecial ? null : (
              <>
                <Text style={styles.label}>Acceso especial</Text>
                <Pressable onPress={() => setForm((p) => ({ ...p, esSuper: !p.esSuper }))} style={[styles.togglePill, form.esSuper && { borderColor: "#2563EB", backgroundColor: "#F5F3FF" }]}>
                  <Text style={[styles.toggleTxt, form.esSuper && { color: "#1D4ED8" }]}>{form.esSuper ? "✓ Super Admin" : "Super Admin"}</Text>
                </Pressable>
              </>
            )}

            {!form.esSuper ? (
              <>
                <Text style={styles.label}>Hijos vinculados</Text>
                {(form.hijos || []).length > 0 ? (
                  <View style={styles.chipsWrap}>
                    {(form.hijos || []).map((hid) => {
                      const h = hijos.find((x) => x.id === hid);
                      if (!h) return null;
                      return (
                        <Pressable key={hid} onPress={() => quitarHijo(hid)} style={styles.hijoChip}>
                          <Text style={styles.hijoChipTxt}>
                            {h.nombre} {h.apellido} ✕
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                <TextInput
                  value={form._busqHijo || ""}
                  onChangeText={(t) => setForm((p) => ({ ...p, _busqHijo: t }))}
                  placeholder="Buscar alumno por nombre o curso..."
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                />
                {filtrados.map((h) => {
                  const sel = (form.hijos || []).includes(h.id);
                  const c = cursos.find((x) => x.id === h.curso_id);
                  return (
                    <Pressable
                      key={h.id}
                      onPress={() =>
                        setForm((p) => ({ ...p, hijos: sel ? p.hijos.filter((x) => x !== h.id) : [...(p.hijos || []), h.id], _busqHijo: "" }))
                      }
                      style={[styles.optRow, sel && styles.optRowSel]}
                    >
                      <Text style={styles.optTxt}>
                        {h.nombre} {h.apellido} {c ? `· ${c.nombre}` : ""}
                      </Text>
                      {sel ? <Text style={{ color: T.accent, fontWeight: "700" }}>✓</Text> : null}
                    </Pressable>
                  );
                })}

                {cursosConHijos.length > 0 ? (
                  <>
                    <Text style={styles.label}>Room Parent</Text>
                    {cursosConHijos.map((cid) => {
                      const c = cursos.find((x) => x.id === cid);
                      if (!c) return null;
                      const esAdmin = (form.cursosAdmin || []).includes(cid);
                      return (
                        <Pressable
                          key={cid}
                          onPress={() =>
                            setForm((p) => ({ ...p, cursosAdmin: esAdmin ? p.cursosAdmin.filter((x) => x !== cid) : [...(p.cursosAdmin || []), cid] }))
                          }
                          style={[styles.optRow, esAdmin && { borderColor: "#10B981", backgroundColor: "#F0FDF4" }]}
                        >
                          <Text style={styles.optTxt}>
                            {c.avatar} {c.nombre}
                          </Text>
                          <Text style={{ color: esAdmin ? "#10B981" : "#94A3B8", fontWeight: "700", fontSize: 11 }}>
                            {esAdmin ? "✓ Room Parent" : "+ Room Parent"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </>
                ) : null}
              </>
            ) : null}

            <View style={styles.switchFila}>
              <Text style={styles.switchTxt}>Cuenta activa (puede entrar a tribbu)</Text>
              <Switch value={!!form.activo} onValueChange={(v) => setForm((p) => ({ ...p, activo: v }))} />
            </View>

            <View style={styles.modalBtns}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={onSave} style={styles.saveBtn}>
                <Text style={styles.saveTxt}>{esNuevo ? "Crear apoderado" : "Guardar cambios"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CursoModal({ esNuevo, niveles = [], form, setForm, onClose, onSave }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{esNuevo ? "Nuevo curso" : "Editar curso"}</Text>
            <Text style={styles.label}>Nombre del curso</Text>
            <TextInput value={form.nombre || ""} onChangeText={(t) => setForm((p) => ({ ...p, nombre: t }))} placeholder="Ej: 4°B — Primaria" placeholderTextColor="#94A3B8" style={styles.input} />
            <Text style={styles.label}>Ícono (emoji)</Text>
            <TextInput value={form.avatar || "🏫"} onChangeText={(t) => setForm((p) => ({ ...p, avatar: t }))} maxLength={2} style={[styles.input, { fontSize: 22 }]} />
            <Text style={styles.label}>Color</Text>
            <View style={styles.chipsWrap}>
              {COLORES.map((c) => (
                <Pressable key={c} onPress={() => setForm((p) => ({ ...p, color: c }))} style={[styles.colorDot, { backgroundColor: c }, form.color === c && styles.colorDotOn]} />
              ))}
            </View>
            {niveles.length > 1 ? (
              <>
                <Text style={styles.label}>Nivel</Text>
                <View style={styles.chipsWrap}>
                  {[...niveles.map((k) => ({ k, l: nombreNivel(k) })), { k: null, l: "Sin nivel" }].map((n) => {
                    const on = (form.nivel || null) === n.k;
                    return (
                      <Pressable key={n.k || "ninguno"} onPress={() => setForm((p) => ({ ...p, nivel: n.k }))} style={[cursoSelectorStyles.nivelChip, on && cursoSelectorStyles.nivelChipOn]}>
                        <Text style={[cursoSelectorStyles.nivelTxt, on && cursoSelectorStyles.nivelTxtOn]}>{n.l}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
            <View style={styles.modalBtns}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={onSave} style={styles.saveBtn}>
                <Text style={styles.saveTxt}>{esNuevo ? "Crear curso" : "Guardar cambios"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MaestroModal({ esNuevo, form, setForm, cursos, colegioId, onClose, onSave, onQuitarAcceso }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{esNuevo ? "Nuevo maestro" : "Editar maestro"}</Text>
            {[
              { l: "Nombre", k: "nombre", ph: "Ej: Carlos" },
              { l: "Apellido", k: "apellido", ph: "Ej: Gómez" },
              { l: "Email", k: "email", ph: "carlos@mail.com" },
            ].map((f) => (
              <View key={f.k}>
                <Text style={styles.label}>{f.l.toUpperCase()}</Text>
                <TextInput
                  value={form[f.k] || ""}
                  onChangeText={(t) => setForm((p) => ({ ...p, [f.k]: t }))}
                  placeholder={f.ph}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize={f.k === "email" ? "none" : "sentences"}
                  style={styles.input}
                />
              </View>
            ))}
            <Text style={styles.label}>Cumpleaños</Text>
            <DateField value={form.fecha_nacimiento || ""} onChange={(v) => setForm((p) => ({ ...p, fecha_nacimiento: v }))} clearable style={styles.input} />
            <Text style={styles.label}>Clases que da</Text>
            {form.clases === null ? (
              <Text style={styles.muted}>Cargando clases…</Text>
            ) : (
              <ClasesMaestroEditor
                colegioId={colegioId}
                cursos={cursos}
                value={(form.clases || []).filter((c) => cursos.some((x) => x.id === c.curso_id))}
                onChange={(v) => setForm((p) => ({ ...p, clases: v }))}
              />
            )}
            {form.id ? (
              <>
                <Text style={styles.label}>Su semana</Text>
                <SemanaMaestra maestroId={form.id} cursos={cursos} />
                {(() => {
                  const n = (form.clases || []).filter((c) => c.id && !cursos.some((x) => x.id === c.curso_id)).length;
                  return n ? <Text style={{ fontSize: 12, color: "#B45309", marginTop: 6 }}>Además tiene {n} {n === 1 ? "clase" : "clases"} en cursos de otros años (se ven y se quitan desde 📚 Materias).</Text> : null;
                })()}
              </>
            ) : null}
            <Text style={styles.label}>Acceso a tribbu</Text>
            {form.usuario_id ? (
              <>
                <Text style={styles.muted}>Puede entrar a tribbu con {form.email || "su email"}: ve sus cursos y chatea con las familias.</Text>
                <TextInput
                  value={form.accesoPass || ""}
                  onChangeText={(t) => setForm((p) => ({ ...p, accesoPass: t }))}
                  placeholder="Nueva contraseña (opcional)"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                  autoCapitalize="none"
                  style={[styles.input, { marginTop: 8 }]}
                />
                <Pressable onPress={onQuitarAcceso} hitSlop={6} style={{ alignSelf: "flex-start", marginTop: 4 }}>
                  <Text style={{ color: "#DC2626", fontSize: 13, fontWeight: "700" }}>Quitar acceso</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.switchFila}>
                  <Text style={styles.switchTxt}>Darle acceso a tribbu</Text>
                  <Switch value={!!form.darAcceso} onValueChange={(v) => setForm((p) => ({ ...p, darAcceso: v }))} />
                </View>
                {form.darAcceso ? (
                  <>
                    <Text style={styles.muted}>Entra con el email de arriba y esta contraseña. Ve sus cursos y chatea con las familias; el colegio puede leer sus chats.</Text>
                    <TextInput
                      value={form.accesoPass || ""}
                      onChangeText={(t) => setForm((p) => ({ ...p, accesoPass: t }))}
                      placeholder="Contraseña inicial"
                      placeholderTextColor="#94A3B8"
                      secureTextEntry
                      autoCapitalize="none"
                      style={[styles.input, { marginTop: 8 }]}
                    />
                  </>
                ) : null}
              </>
            )}
            <View style={styles.switchFila}>
              <Text style={styles.switchTxt}>Activo</Text>
              <Switch value={form.activo !== false} onValueChange={(v) => setForm((p) => ({ ...p, activo: v }))} />
            </View>
            <View style={styles.modalBtns}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={onSave} style={styles.saveBtn}>
                <Text style={styles.saveTxt}>{esNuevo ? "Crear maestro" : "Guardar cambios"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AlumnoModal({ esNuevo, form, setForm, cursos, onClose, onSave }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{esNuevo ? "Nuevo alumno" : "Editar alumno"}</Text>
            <View style={styles.row}>
              <View style={styles.flex1}>
                <Text style={styles.label}>Nombre</Text>
                <TextInput value={form.nombre || ""} onChangeText={(t) => setForm((p) => ({ ...p, nombre: t }))} placeholder="Ej: Sofía" placeholderTextColor="#94A3B8" style={styles.input} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.label}>Apellido</Text>
                <TextInput value={form.apellido || ""} onChangeText={(t) => setForm((p) => ({ ...p, apellido: t }))} placeholder="Ej: García" placeholderTextColor="#94A3B8" style={styles.input} />
              </View>
            </View>
            <Text style={styles.label}>Fecha de nacimiento</Text>
            <DateField value={form.fecha_nacimiento || ""} onChange={(v) => setForm((p) => ({ ...p, fecha_nacimiento: v }))} clearable style={styles.input} />
            <Text style={styles.label}>DNI</Text>
            <TextInput value={form.dni || ""} onChangeText={(t) => setForm((p) => ({ ...p, dni: t }))} placeholder="Ej: 12345678" placeholderTextColor="#94A3B8" style={styles.input} />
            <Text style={styles.label}>Curso</Text>
            <CursoListSelector cursos={cursos} seleccionados={form.curso_id ? [form.curso_id] : []} onToggle={(id) => setForm((p) => ({ ...p, curso_id: id }))} multi={false} />
            <View style={styles.modalBtns}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={onSave} style={styles.saveBtn}>
                <Text style={styles.saveTxt}>{esNuevo ? "Crear alumno" : "Guardar cambios"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ApoderadosModal({ alumno, onClose }) {
  const apods = (alumno.usuarios || []).map((x) => x.usuarios).filter(Boolean);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { maxHeight: "70%" }]}>
          <View style={styles.pagosHeader}>
            <Text style={styles.modalTitle}>Apoderados de {fmtNombre(alumno)}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>
          <ScrollView>
            {apods.length === 0 ? <Text style={styles.muted}>Sin apoderados vinculados</Text> : null}
            {apods.map((p) => (
              <View key={p.id} style={styles.apodRow}>
                <Text style={styles.itemNombre}>{fmtNombre(p)}</Text>
                {p.telefono ? <Text style={styles.itemMeta}>Tel. {p.telefono}</Text> : null}
                {p.email ? <Text style={styles.itemMeta}>{p.email}</Text> : null}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── AlertasAdmin ────────────────────────────────────────────────────────────────
// ── ColegioAdmin (datos de contacto del colegio) ─────────────────────────────
// Edita la fila de `colegios` (plural, multi-tenant) del colegio_admin — NO la
// tabla singleton `colegio` (deprecada). RLS `colegios_update` ya permite
// es_colegio_admin_de(id). El logo va por pickAndUploadImage (bucket adjuntos,
// mismo criterio que LogoUploadInput de la web).
// Paleta para el color de marca del colegio (en mobile no hay selector de
// color libre; desde la web se puede elegir cualquiera).
const COLORES_COLEGIO = ["#1D4ED8", "#0F766E", "#15803D", "#B91C1C", "#9D174D", "#6D28D9", "#C2410C", "#0F172A"];

function ColegioAdmin({ colegioId }) {
  const [colegio, setColegio] = useState(null);
  const [colId, setColId] = useState(colegioId || null);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [err, setErr] = useState("");

  const cargar = useCallback(async () => {
    // colegio_admin: su usuario.colegio_id. super (fuera de alcance, pero no
    // debe romper): cae al único colegio existente, igual que el fallback de
    // mobile/features/contacto.
    let id = colegioId || null;
    if (!id) {
      const { data } = await supabase.from("colegios").select("id").limit(1).maybeSingle();
      id = data?.id || null;
    }
    setColId(id);
    if (!id) {
      setCargando(false);
      return;
    }
    const { data } = await supabase.from("colegios").select("*").eq("id", id).single();
    setColegio(data || null);
    setCargando(false);
  }, [colegioId]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrir = () => {
    setErr("");
    setForm({
      nombre: colegio?.nombre || "",
      telefono: colegio?.telefono || "",
      email: colegio?.email || "",
      direccion: colegio?.direccion || "",
      url_maps: colegio?.url_maps || "",
      horario_clases: colegio?.horario_clases || "",
      horario_secretaria: colegio?.horario_secretaria || "",
      sitio_web: colegio?.sitio_web || "",
      logo_url: colegio?.logo_url || "",
      color_primario: colorColegio(colegio?.color_primario),
    });
    setModal(true);
  };

  const subirLogo = async () => {
    setErr("");
    setSubiendoLogo(true);
    try {
      const r = await pickAndUploadImage({ bucket: "adjuntos", pathPrefix: `colegios/${colId}/`, conMiniatura: false });
      if (r?.url) setForm((p) => ({ ...p, logo_url: r.url }));
    } catch (e) {
      setErr(e.message || "No se pudo subir el logo");
    }
    setSubiendoLogo(false);
  };

  const guardar = async () => {
    if (!(form.nombre || "").trim()) {
      setErr("El nombre no puede quedar vacío");
      return;
    }
    setGuardando(true);
    setErr("");
    const { error } = await supabase
      .from("colegios")
      .update({
        nombre: sanitize(form.nombre),
        telefono: sanitize(form.telefono) || null,
        email: sanitize(form.email) || null,
        direccion: sanitize(form.direccion) || null,
        url_maps: safeUrl(form.url_maps) || null,
        horario_clases: sanitize(form.horario_clases) || null,
        horario_secretaria: sanitize(form.horario_secretaria) || null,
        sitio_web: safeUrl(form.sitio_web) || null,
        logo_url: form.logo_url || null,
        color_primario: colorColegio(form.color_primario),
      })
      .eq("id", colId);
    setGuardando(false);
    if (error) {
      setErr("No se pudo guardar. Reintentá.");
      return;
    }
    setModal(false);
    cargar();
  };

  if (cargando) return <Spinner />;
  if (!colegio) return <Text style={styles.muted}>No se encontró el colegio.</Text>;

  const filas = [
    { l: "Nombre", v: colegio.nombre },
    { l: "Teléfono", v: colegio.telefono },
    { l: "Email", v: colegio.email },
    { l: "Dirección", v: colegio.direccion },
    { l: "Horario de clases", v: colegio.horario_clases },
    { l: "Secretaría", v: colegio.horario_secretaria },
    { l: "Sitio web", v: colegio.sitio_web },
    { l: "Mapa (URL)", v: colegio.url_maps },
  ];

  const campos = [
    { l: "Nombre", k: "nombre", ph: "Nombre del colegio" },
    { l: "Teléfono", k: "telefono", ph: "Ej: +54 11 1234-5678", kb: "phone-pad" },
    { l: "Email", k: "email", ph: "contacto@colegio.edu.ar", kb: "email-address" },
    { l: "Dirección", k: "direccion", ph: "Calle 123, Ciudad" },
    { l: "Horario de clases", k: "horario_clases", ph: "Ej: 8:00 a 16:30" },
    { l: "Secretaría", k: "horario_secretaria", ph: "Ej: Lun a Vie 9 a 13" },
    { l: "Sitio web", k: "sitio_web", ph: "https://...", kb: "url" },
    { l: "Mapa (URL)", k: "url_maps", ph: "https://maps.google.com/...", kb: "url" },
  ];

  return (
    <View>
      <Text style={styles.cardTitle}>Datos del colegio</Text>
      <Text style={styles.subtitle}>Lo que ven las familias en la pantalla de Contacto.</Text>

      <View style={styles.colegioCard}>
        {colegio.logo_url ? <SignedImage src={colegio.logo_url} bucket="adjuntos" style={styles.colegioLogo} resizeMode="contain" /> : null}
        {filas.map((f) => (
          <View key={f.l} style={styles.colegioFila}>
            <Text style={styles.colegioFilaLabel}>{f.l}</Text>
            <Text style={styles.colegioFilaVal}>{f.v || "—"}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={abrir} style={styles.enlaceBtn} accessibilityRole="button">
        <MaterialCommunityIcons name="pencil-outline" size={18} color="#2563EB" />
        <Text style={styles.enlaceTxt}>Editar datos del colegio</Text>
      </Pressable>

      {modal ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setModal(false)}>
          <KeyboardAvoidingView style={styles.overlay} behavior="padding">
            <View style={styles.modalCard}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Editar datos del colegio</Text>

                <Text style={styles.label}>Logo</Text>
                <View style={styles.logoRow}>
                  {form.logo_url ? (
                    <SignedImage src={form.logo_url} bucket="adjuntos" style={styles.logoPreview} resizeMode="contain" />
                  ) : (
                    <View style={[styles.logoPreview, styles.logoEmpty]} />
                  )}
                  <Pressable onPress={subirLogo} disabled={subiendoLogo} style={styles.logoBtn}>
                    <Text style={styles.logoBtnTxt}>{subiendoLogo ? "Subiendo…" : form.logo_url ? "Cambiar" : "Subir logo"}</Text>
                  </Pressable>
                  {form.logo_url ? (
                    <Pressable onPress={() => setForm((p) => ({ ...p, logo_url: "" }))} style={styles.logoBtn}>
                      <Text style={[styles.logoBtnTxt, { color: "#EF4444" }]}>Quitar</Text>
                    </Pressable>
                  ) : null}
                </View>

                <Text style={styles.label}>Color del colegio</Text>
                <View style={styles.colorRow}>
                  {COLORES_COLEGIO.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setForm((p) => ({ ...p, color_primario: c }))}
                      accessibilityLabel={`Color ${c}`}
                      style={[styles.colorSwatch, { backgroundColor: c }, form.color_primario === c && styles.colorSwatchActivo]}
                    />
                  ))}
                  <Pressable onPress={() => setForm((p) => ({ ...p, color_primario: null }))} style={styles.logoBtn}>
                    <Text style={styles.logoBtnTxt}>{form.color_primario ? "Quitar" : "Sin color"}</Text>
                  </Pressable>
                </View>
                {form.color_primario && !COLORES_COLEGIO.includes(form.color_primario) ? (
                  <Text style={styles.muted}>Color actual: {form.color_primario} (elegido desde la web)</Text>
                ) : null}

                {campos.map((f) => (
                  <View key={f.k}>
                    <Text style={styles.label}>{f.l.toUpperCase()}</Text>
                    <TextInput
                      value={form[f.k] || ""}
                      onChangeText={(t) => setForm((p) => ({ ...p, [f.k]: t }))}
                      placeholder={f.ph}
                      placeholderTextColor="#94A3B8"
                      autoCapitalize={f.kb === "email-address" || f.kb === "url" ? "none" : "sentences"}
                      keyboardType={f.kb || "default"}
                      style={styles.input}
                    />
                  </View>
                ))}

                {err ? <Text style={styles.colegioErr}>{err}</Text> : null}

                <View style={styles.modalBtns}>
                  <Pressable onPress={() => setModal(false)} style={styles.cancelBtn}>
                    <Text style={styles.cancelTxt}>Cancelar</Text>
                  </Pressable>
                  <Pressable onPress={guardar} disabled={guardando} style={styles.saveBtn}>
                    <Text style={styles.saveTxt}>{guardando ? "Guardando…" : "Guardar"}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </View>
  );
}

function AlertasAdmin({ cursos }) {
  const [cursoSel, setCursoSel] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [modal, setModal] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const cargar = async (cid) => {
    if (!cid) return;
    const { data } = await supabase.from("alertas").select("*").eq("curso_id", cid).eq("activa", true).order("creado_en", { ascending: false }).limit(1);
    setAlerta((data || [])[0] || null);
  };
  const selCurso = (c) => {
    setCursoSel(c);
    cargar(c.id);
  };
  const enviar = async () => {
    if (!cursoSel || !msg.trim()) return;
    setLoading(true);
    await supabase.from("alertas").update({ activa: false }).eq("curso_id", cursoSel.id);
    await supabase.from("alertas").insert({ curso_id: cursoSel.id, mensaje: msg.trim(), hora: "Ahora", activa: true });
    const userIds = await getUserIdsParaAlerta(cursoSel.id);
    await sendPush({ type: "alerta", payload: { mensaje: msg.trim(), userIds } });
    setLoading(false);
    setModal(false);
    setMsg("");
    cargar(cursoSel.id);
  };
  const dismiss = async () => {
    if (alerta) {
      await supabase.from("alertas").update({ activa: false }).eq("id", alerta.id);
      cargar(cursoSel.id);
    }
  };

  return (
    <View>
      <Text style={styles.cardTitle}>Seleccioná un curso para enviar una alerta</Text>
      <View style={{ marginBottom: 16 }}>
        <CursoListSelector cursos={cursos} seleccionados={cursoSel ? [cursoSel.id] : []} onToggle={(id) => selCurso(cursos.find((c) => c.id === id))} multi={false} />
      </View>
      {cursoSel ? (
        alerta ? (
          <View style={styles.alertaActiva}>
            <MaterialCommunityIcons name="alert-outline" size={22} color="#DC2626" />
            <View style={styles.flex1}>
              <Text style={styles.alertaCurso}>Alerta activa · {cursoSel.nombre}</Text>
              <Text style={styles.alertaMsg}>{alerta.mensaje}</Text>
            </View>
            <Pressable onPress={dismiss} style={styles.alertaDismiss}>
              <Text style={styles.alertaDismissTxt}>Desactivar</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setModal(true)} style={styles.alertaNueva}>
            <Text style={styles.alertaNuevaTxt}>Enviar alerta a {cursoSel.nombre}</Text>
          </Pressable>
        )
      ) : null}

      {modal ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setModal(false)}>
          <KeyboardAvoidingView style={styles.overlay} behavior="padding">
            <View style={styles.modalCard}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Enviar alerta</Text>
                <Text style={styles.subtitle}>Se mostrará destacada a todos los apoderados del curso.</Text>
                <TextInput
                  value={msg}
                  onChangeText={setMsg}
                  placeholder="Ej: Se suspenden las clases de mañana."
                  placeholderTextColor="#94A3B8"
                  multiline
                  style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
                />
                <View style={styles.modalBtns}>
                  <Pressable onPress={() => setModal(false)} style={styles.cancelBtn}>
                    <Text style={styles.cancelTxt}>Cancelar</Text>
                  </Pressable>
                  <Pressable onPress={enviar} disabled={loading || !msg.trim()} style={[styles.saveBtn, { backgroundColor: "#EF4444" }]}>
                    <Text style={styles.saveTxt}>{loading ? "Enviando..." : "Enviar alerta"}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </View>
  );
}

// ── ComunicacionesAdmin ───────────────────────────────────────────────────────────
// Publica un recordatorio idéntico en varios cursos a la vez (exclusivo de Super
// Admin — el Room Parent sigue publicando solo en su propio curso, sin cambios).
// Un `grupo_id` (uuid) compartido marca las filas como parte de la misma
// comunicación, aunque cada una se edita/borra por curso como cualquier
// recordatorio (ver specs/comunicaciones-multi-curso.md).
const PRIO = {
  alta: { l: "Alta", c: "#EF4444", bg: "#FEF2F2" },
  media: { l: "Media", c: "#F59E0B", bg: "#FFFBEB" },
  baja: { l: "Baja", c: "#10B981", bg: "#F0FDF4" },
};
function ComunicacionesAdmin({ cursos }) {
  const { usuario } = useSession();
  const [cursosSel, setCursosSel] = useState([]);
  const [form, setForm] = useState({ titulo: "", texto: "", fecha: fmtLocalDate(), hora_inicio: "", hora_fin: "", prioridad: "media", urgente: false, adjuntos: [], conMembrete: true });
  const [subiendoAdj, setSubiendoAdj] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [ok, setOk] = useState(null);
  const [error, setError] = useState(null);

  const toggleCurso = (id) => setCursosSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const todosSeleccionados = cursos.length > 0 && cursosSel.length === cursos.length;
  const seleccionarTodos = () => setCursosSel(todosSeleccionados ? [] : cursos.map((c) => c.id));

  const publicar = async () => {
    if (!form.titulo?.trim() || !form.texto?.trim() || !form.fecha || cursosSel.length === 0) return;
    setPublicando(true);
    setError(null);
    try {
      const grupo_id = uuidLite();
      const rows = cursosSel.map((curso_id) => ({
        titulo: sanitize(form.titulo),
        texto: sanitize(form.texto),
        fecha: form.fecha,
        hora_inicio: form.hora_inicio || null,
        hora_fin: form.hora_fin || null,
        prioridad: form.prioridad || "media",
        urgente: form.urgente || false,
        adjuntos: form.adjuntos || [],
        curso_id,
        grupo_id,
        creado_por: usuario?.id ?? null,
        con_membrete: !!form.conMembrete,
      }));
      const { error: insertErr } = await supabase.from("recordatorios").insert(rows);
      if (insertErr) throw insertErr;
      const userIds = [...new Set((await Promise.all(cursosSel.map(getUserIdsByCurso))).flat())];
      // `grupo`: cada familia recibe la fila de SU curso; la app la busca por grupo_id.
      if (userIds.length) await sendPush({ type: "recordatorio", payload: { titulo: form.titulo, grupo: grupo_id, userIds } });
      setConfirmando(false);
      setOk(`Publicado en ${cursosSel.length} curso${cursosSel.length !== 1 ? "s" : ""}.`);
      setForm({ titulo: "", texto: "", fecha: fmtLocalDate(), hora_inicio: "", hora_fin: "", prioridad: "media", urgente: false, adjuntos: [], conMembrete: true });
      setCursosSel([]);
      setTimeout(() => setOk(null), 4000);
    } catch (e) {
      console.error("ComunicacionesAdmin.publicar:", e);
      setError(e?.message || "No se pudo publicar. Probá de nuevo.");
    } finally {
      setPublicando(false);
    }
  };

  const puedePublicar = !!form.titulo?.trim() && !!form.texto?.trim() && !!form.fecha && cursosSel.length > 0 && !subiendoAdj;

  return (
    <View>
      <Text style={styles.cardTitle}>Comunicación para varios cursos</Text>
      <Text style={styles.subtitle}>Se publica como un recordatorio independiente en cada curso elegido.</Text>

      {ok ? (
        <View style={comStyles.okBox}>
          <Text style={comStyles.okTxt}>✓ {ok}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={comStyles.errorBox}>
          <Text style={comStyles.errorTxt}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Título</Text>
      <TextInput
        value={form.titulo}
        onChangeText={(v) => setForm((p) => ({ ...p, titulo: v }))}
        placeholder="Ej: Reunión general de padres"
        placeholderTextColor="#94A3B8"
        style={styles.input}
      />

      <Text style={styles.label}>Descripción</Text>
      <EditorFormato
        value={form.texto}
        onChange={(v) => setForm((p) => ({ ...p, texto: v }))}
        placeholder="Ej: El viernes 15 a las 18hs, en el SUM."
        style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
      />

      <Text style={styles.label}>Fecha</Text>
      <DateField value={form.fecha || ""} onChange={(v) => setForm((p) => ({ ...p, fecha: v }))} clearable style={styles.input} />

      <View style={comStyles.prioRow}>
        <View style={styles.flex1}>
          <Text style={styles.label}>Hora inicio (opcional)</Text>
          <TextInput value={form.hora_inicio} onChangeText={(t) => setForm((p) => ({ ...p, hora_inicio: t }))} placeholder="18:00" placeholderTextColor="#94A3B8" style={styles.input} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.label}>Hora fin (opcional)</Text>
          <TextInput value={form.hora_fin} onChangeText={(t) => setForm((p) => ({ ...p, hora_fin: t }))} placeholder="19:00" placeholderTextColor="#94A3B8" style={styles.input} />
        </View>
      </View>

      <Text style={styles.label}>Prioridad</Text>
      <View style={comStyles.prioRow}>
        {["alta", "media", "baja"].map((p) => {
          const active = form.prioridad === p;
          return (
            <Pressable
              key={p}
              onPress={() => setForm((f) => ({ ...f, prioridad: p }))}
              style={[comStyles.prioBtn, active && { borderColor: PRIO[p].c, backgroundColor: PRIO[p].bg }]}
            >
              <Text style={[comStyles.prioTxt, active && { color: PRIO[p].c }]}>{PRIO[p].l}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Opciones como interruptores con su explicación (antes, pastillas de colores). */}
      <View style={styles.switchFila}>
        <View style={styles.flex1}>
          <Text style={styles.switchTxt}>Con membrete del colegio</Text>
          <Text style={styles.itemMeta}>Al abrirlo se ve con el logo, la línea y la firma del colegio.</Text>
        </View>
        <Switch value={!!form.conMembrete} onValueChange={(v) => setForm((p) => ({ ...p, conMembrete: v }))} />
      </View>
      <View style={styles.switchFila}>
        <View style={styles.flex1}>
          <Text style={styles.switchTxt}>Marcar como urgente</Text>
          <Text style={styles.itemMeta}>Aparece arriba de todo en Avisos, en rojo.</Text>
        </View>
        <Switch value={!!form.urgente} onValueChange={(v) => setForm((p) => ({ ...p, urgente: v }))} />
      </View>

      <Text style={styles.label}>Adjuntos (opcional)</Text>
      <AdjuntosInput adjuntos={form.adjuntos || []} onChange={(adj) => setForm((p) => ({ ...p, adjuntos: adj }))} cursoId="comunicaciones" onUploadingChange={setSubiendoAdj} />

      <View style={comStyles.sectionRow}>
        <Text style={styles.cardTitle}>¿A qué cursos va?</Text>
        {cursos.length > 0 ? (
          <Pressable onPress={seleccionarTodos}>
            <Text style={comStyles.linkTxt}>{todosSeleccionados ? "Ninguno" : "Seleccionar todos"}</Text>
          </Pressable>
        ) : null}
      </View>
      <CursoListSelector cursos={cursos} seleccionados={cursosSel} onToggle={toggleCurso} maxHeight={220} />

      {!confirmando ? (
        <Pressable
          onPress={() => setConfirmando(true)}
          disabled={!puedePublicar}
          style={[styles.saveBtn, { marginTop: 20 }, !puedePublicar && { opacity: 0.5 }]}
        >
          <Text style={styles.saveTxt}>Publicar</Text>
        </Pressable>
      ) : (
        <View style={comStyles.confirmBox}>
          <Text style={comStyles.confirmTxt}>
            ¿Publicar en {cursosSel.length} curso{cursosSel.length !== 1 ? "s" : ""}?
          </Text>
          <View style={styles.modalBtns}>
            <Pressable onPress={() => setConfirmando(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelTxt}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={publicar} disabled={publicando} style={styles.saveBtn}>
              <Text style={styles.saveTxt}>{publicando ? "Publicando..." : "Sí, publicar"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <HistorialComunicaciones cursos={cursos} recargarVer={ok} />
    </View>
  );
}

function HistorialComunicaciones({ cursos, recargarVer }) {
  const [comunicaciones, setComunicaciones] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState(null); // grupo_id en edición, o null
  const [editForm, setEditForm] = useState({ titulo: "", texto: "", hora_inicio: "", hora_fin: "" });
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [editError, setEditError] = useState(null);
  const [verLecturas, setVerLecturas] = useState(null); // comunicación con "¿quién la leyó?" abierto

  const cursoPorId = new Map(cursos.map((c) => [c.id, c]));

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("recordatorios")
      .select("id,titulo,texto,fecha,hora_inicio,hora_fin,prioridad,urgente,curso_id,grupo_id,creado_en")
      .not("grupo_id", "is", null)
      .order("creado_en", { ascending: false })
      .limit(300);
    // Una comunicación multi-curso genera N filas (una por curso) con el mismo
    // grupo_id — se agrupan en una sola entrada del historial.
    const grupos = new Map();
    for (const r of data || []) {
      const g = grupos.get(r.grupo_id);
      if (g) { g.cursoIds.push(r.curso_id); g.ids.push(r.id); }
      else grupos.set(r.grupo_id, { ...r, cursoIds: [r.curso_id], ids: [r.id] });
    }
    // Confirmación de lectura por comunicación (misma RPC y criterio que la web).
    const allIds = (data || []).map((r) => r.id);
    const { data: lecturasRows } = allIds.length
      ? await supabase.rpc("lecturas_de_recordatorios", { p_ids: allIds })
      : { data: [] };
    const filasPorRec = new Map();
    for (const l of lecturasRows || []) {
      if (!filasPorRec.has(l.recordatorio_id)) filasPorRec.set(l.recordatorio_id, []);
      filasPorRec.get(l.recordatorio_id).push(l);
    }
    const lista = [...grupos.values()].map((g) => ({
      ...g,
      lecturas: unirLecturasPorFamilia(g.ids.flatMap((id) => filasPorRec.get(id) || [])),
    }));
    setComunicaciones(lista.sort((a, b) => (b.creado_en || "").localeCompare(a.creado_en || "")));
    setCargando(false);
  };

  const toggle = () => {
    if (!abierto && comunicaciones.length === 0) cargar();
    setAbierto((p) => !p);
  };

  // Recargar cuando se publica una nueva comunicación (ok pasa de null a un mensaje).
  useEffect(() => { if (recargarVer && abierto) cargar(); }, [recargarVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtFecha = (iso) =>
    iso ? new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  const empezarEdicion = (c) => {
    setEditError(null);
    setEditForm({ titulo: c.titulo || "", texto: c.texto || "", hora_inicio: c.hora_inicio || "", hora_fin: c.hora_fin || "" });
    setEditando(c.grupo_id);
  };

  // Todas las filas de una misma comunicación comparten grupo_id — un solo
  // update por grupo_id las actualiza a todas (mismo criterio que el insert
  // multi-fila de ComunicacionesAdmin).
  const guardarEdicion = async () => {
    if (!editForm.titulo?.trim() || !editForm.texto?.trim()) return;
    setGuardandoEdit(true);
    setEditError(null);
    const { error } = await supabase
      .from("recordatorios")
      .update({ titulo: sanitize(editForm.titulo), texto: sanitize(editForm.texto), hora_inicio: editForm.hora_inicio || null, hora_fin: editForm.hora_fin || null })
      .eq("grupo_id", editando);
    setGuardandoEdit(false);
    if (error) { setEditError(error.message || "No se pudo guardar."); return; }
    setEditando(null);
    cargar();
  };

  return (
    <View style={{ marginTop: 24 }}>
      <LecturasSheet
        visible={!!verLecturas}
        titulo={verLecturas?.titulo || textoPlano(verLecturas?.texto)}
        filas={verLecturas?.lecturas}
        onClose={() => setVerLecturas(null)}
      />
      <Pressable onPress={toggle} style={comStyles.historialToggle}>
        <Text style={comStyles.historialToggleTxt}>Historial de comunicaciones</Text>
        <Text style={comStyles.historialToggleArrow}>{abierto ? "▴" : "▾"}</Text>
      </Pressable>

      {abierto ? (
        <View style={{ marginTop: 8 }}>
          {cargando ? <Text style={[styles.muted, { textAlign: "center", padding: 24 }]}>Cargando...</Text> : null}
          {!cargando && comunicaciones.length === 0 ? (
            <Text style={[styles.muted, { textAlign: "center", padding: 24 }]}>Todavía no se publicó ninguna comunicación este año.</Text>
          ) : null}
          {!cargando &&
            comunicaciones.map((c) => (
              <View key={c.grupo_id} style={comStyles.historialCard}>
                {editando === c.grupo_id ? (
                  <View style={{ marginBottom: 10 }}>
                    {editError ? <Text style={{ fontSize: 11, fontWeight: "700", color: "#B91C1C", marginBottom: 6 }}>{editError}</Text> : null}
                    <Text style={comStyles.editLabel}>TÍTULO</Text>
                    <TextInput value={editForm.titulo} onChangeText={(v) => setEditForm((p) => ({ ...p, titulo: v }))} style={comStyles.editInput} />
                    <Text style={comStyles.editLabel}>DESCRIPCIÓN</Text>
                    <TextInput
                      value={editForm.texto}
                      onChangeText={(v) => setEditForm((p) => ({ ...p, texto: v }))}
                      multiline
                      style={[comStyles.editInput, { minHeight: 60, textAlignVertical: "top" }]}
                    />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={comStyles.editLabel}>HORA INICIO (OPCIONAL)</Text>
                        <TextInput
                          value={editForm.hora_inicio}
                          onChangeText={(v) => setEditForm((p) => ({ ...p, hora_inicio: v }))}
                          placeholder="18:00"
                          placeholderTextColor="#94A3B8"
                          style={comStyles.editInput}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={comStyles.editLabel}>HORA FIN (OPCIONAL)</Text>
                        <TextInput
                          value={editForm.hora_fin}
                          onChangeText={(v) => setEditForm((p) => ({ ...p, hora_fin: v }))}
                          placeholder="19:00"
                          placeholderTextColor="#94A3B8"
                          style={comStyles.editInput}
                        />
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable onPress={() => setEditando(null)} style={styles.cancelBtn}>
                        <Text style={styles.cancelTxt}>Cancelar</Text>
                      </Pressable>
                      <Pressable
                        onPress={guardarEdicion}
                        disabled={guardandoEdit || !editForm.titulo?.trim() || !editForm.texto?.trim()}
                        style={[styles.saveBtn, (guardandoEdit || !editForm.titulo?.trim() || !editForm.texto?.trim()) && { opacity: 0.5 }]}
                      >
                        <Text style={styles.saveTxt}>{guardandoEdit ? "Guardando..." : "Guardar"}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={comStyles.historialHeaderRow}>
                    <Text style={[comStyles.historialTexto, !c.titulo && { marginBottom: 6 }, { flex: 1 }]}>{c.titulo || textoPlano(c.texto)}</Text>
                    <Pressable onPress={() => empezarEdicion(c)} style={comStyles.editBtn}>
                      <Text style={comStyles.editBtnTxt}>Editar</Text>
                    </Pressable>
                  </View>
                )}
                {editando !== c.grupo_id && c.titulo ? <Text style={comStyles.historialDescripcion}>{textoPlano(c.texto)}</Text> : null}
                <ChipLecturas filas={c.lecturas} onPress={() => setVerLecturas(c)} />
                <View style={comStyles.historialMetaRow}>
                  <Text style={comStyles.historialMeta}>Publicado {fmtFecha(c.creado_en)}</Text>
                  <View style={comStyles.historialBadge}>
                    <Text style={comStyles.historialBadgeTxt}>{c.cursoIds.length} curso{c.cursoIds.length !== 1 ? "s" : ""}</Text>
                  </View>
                  {c.urgente ? (
                    <View style={[comStyles.historialBadge, { backgroundColor: "#FEF2F2" }]}>
                      <Text style={[comStyles.historialBadgeTxt, { color: "#EF4444" }]}>Urgente</Text>
                    </View>
                  ) : null}
                </View>
                {c.fecha || c.hora_inicio ? (
                  <Text style={comStyles.historialMeta}>
                    {c.fecha ? new Date(c.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" }) : "Sin fecha"}
                    {fmtRangoHora(c.hora_inicio, c.hora_fin) ? ` · ${fmtRangoHora(c.hora_inicio, c.hora_fin)}` : ""}
                  </Text>
                ) : null}
                <View style={comStyles.historialCursosRow}>
                  {c.cursoIds.map((cid) => {
                    const curso = cursoPorId.get(cid);
                    if (!curso) return null;
                    return (
                      <View key={cid} style={comStyles.historialCursoChip}>
                        <Text style={comStyles.historialCursoChipTxt}>{curso.avatar} {curso.nombre}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
        </View>
      ) : null}
    </View>
  );
}

const comStyles = StyleSheet.create({
  okBox: { backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0", borderRadius: 10, padding: 12, marginBottom: 14 },
  okTxt: { fontSize: 12, fontWeight: "700", color: "#10B981" },
  errorBox: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 10, padding: 12, marginBottom: 14 },
  errorTxt: { fontSize: 12, fontWeight: "700", color: "#EF4444" },
  prioRow: { flexDirection: "row", gap: 6 },
  prioBtn: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1.5, borderColor: "#E2E8F0", backgroundColor: "white" },
  prioTxt: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 10 },
  linkTxt: { fontSize: 12, fontWeight: "700", color: "#3B82F6" },
  confirmBox: { backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE", borderRadius: 12, padding: 14, marginTop: 20 },
  confirmTxt: { fontSize: 13, fontWeight: "700", color: T.text, marginBottom: 10 },
  historialToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "white" },
  historialToggleTxt: { fontSize: 13, fontWeight: "700", color: T.text },
  historialToggleArrow: { fontSize: 16, color: "#94A3B8" },
  historialCard: { padding: 14, marginBottom: 8, borderRadius: 16, backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0" },
  historialTexto: { fontSize: 13, fontWeight: "700", color: T.text, lineHeight: 18, marginBottom: 2 },
  historialDescripcion: { fontSize: 12, color: "#64748B", lineHeight: 17, marginBottom: 6 },
  historialHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  editBtn: { flexShrink: 0, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 7, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "white" },
  editBtnTxt: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  editLabel: { fontSize: 10, fontWeight: "700", color: "#94A3B8", marginBottom: 3 },
  editInput: { width: "100%", padding: 8, borderRadius: 8, borderWidth: 1.5, borderColor: "#E2E8F0", fontSize: 12.5, backgroundColor: "#F8FAFC", marginBottom: 8, color: T.text },
  historialMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  historialMeta: { fontSize: 12, color: "#64748B" },
  historialBadge: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 8, backgroundColor: "#F1F5F9" },
  historialBadgeTxt: { fontSize: 11, fontWeight: "600", color: "#475569" },
  historialCursosRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 },
  historialCursoChip: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 8, backgroundColor: "#F1F5F9" },
  historialCursoChipTxt: { fontSize: 10, fontWeight: "700", color: "#64748B" },
});

// ── HorariosAdmin (super: selector de curso) ─────────────────────────────────────
// El editor (clases, talleres, bloque en varios días, copiar) está en
// features/horarios, compartido con el Admin del Room Parent.
function HorariosAdmin({ cursos, colegioId }) {
  const [cursoSel, setCursoSel] = useState(null);
  const [maestros, setMaestros] = useState([]);
  useEffect(() => {
    (async () => {
      const { data: mc } = await supabase.from("maestro_cursos").select("maestro_id,cursos!inner(colegio_id)").eq("cursos.colegio_id", colegioId || "");
      const ids = [...new Set((mc || []).map((r) => r.maestro_id))];
      const { data: mae } = ids.length ? await supabase.from("maestros").select("id,nombre,apellido").eq("activo", true).in("id", ids).order("nombre") : { data: [] };
      setMaestros(mae || []);
    })();
  }, [colegioId]);
  return (
    <View>
      <View style={{ marginBottom: 12 }}>
        <CursoListSelector cursos={cursos} seleccionados={cursoSel ? [cursoSel.id] : []} onToggle={(id) => setCursoSel(cursos.find((c) => c.id === id))} multi={false} />
      </View>
      {!cursoSel ? <Text style={styles.muted}>Seleccioná un curso para ver su horario</Text> : null}
      {cursoSel ? <HorarioCurso key={cursoSel.id} curso={cursoSel} colegioId={colegioId} cursos={cursos} maestros={maestros} /> : null}
    </View>
  );
}

// ── UniformesAdmin ──────────────────────────────────────────────────────────────
function UniformesAdmin({ cursos, colegioId }) {
  const [uniformes, setUniformes] = useState([]);
  const [links, setLinks] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ tipo: "", emoji: "👕", item: "" });
  const [saving, setSaving] = useState(false);
  const EMOJIS = ["👕", "👖", "👟", "🧥", "🎽", "🧢", "👗", "🩳"];

  const cargar = useCallback(async () => {
    const [uni, lnk] = await Promise.all([
      supabase.from("uniformes").select("*, uniforme_items(id,item)").eq("colegio_id", colegioId).order("tipo"),
      supabase.from("uniforme_cursos").select("uniforme_id,curso_id"),
    ]);
    setUniformes(uni.data || []);
    setLinks(lnk.data || []);
  }, [colegioId]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const toggleCurso = async (uniformeId, cursoId) => {
    const exists = links.some((l) => l.uniforme_id === uniformeId && l.curso_id === cursoId);
    if (exists) {
      await supabase.from("uniforme_cursos").delete().eq("uniforme_id", uniformeId).eq("curso_id", cursoId);
      setLinks((p) => p.filter((l) => !(l.uniforme_id === uniformeId && l.curso_id === cursoId)));
    } else {
      await supabase.from("uniforme_cursos").insert({ uniforme_id: uniformeId, curso_id: cursoId });
      setLinks((p) => [...p, { uniforme_id: uniformeId, curso_id: cursoId }]);
    }
  };
  const guardar = async () => {
    if (!modal) return;
    setSaving(true);
    // uniformes.colegio_id es NOT NULL (multi-colegio): sin él, el alta
    // fallaba en silencio y la categoría nueva nunca aparecía.
    let error = null;
    if (modal.mode === "newU" && form.tipo.trim()) ({ error } = await supabase.from("uniformes").insert({ tipo: form.tipo.trim(), emoji: form.emoji || "👕", colegio_id: colegioId }));
    else if (modal.mode === "editU") ({ error } = await supabase.from("uniformes").update({ tipo: form.tipo.trim(), emoji: form.emoji || "👕" }).eq("id", modal.u.id));
    else if (modal.mode === "newItem" && form.item.trim()) ({ error } = await supabase.from("uniforme_items").insert({ uniforme_id: modal.u.id, item: form.item.trim() }));
    else if (modal.mode === "editItem" && form.item.trim()) ({ error } = await supabase.from("uniforme_items").update({ item: form.item.trim() }).eq("id", modal.it.id));
    setSaving(false);
    if (error) { Alert.alert("No se pudo guardar", error.message); return; }
    setModal(null);
    cargar();
  };
  const openModal = (mode, u = null, it = null) => {
    setModal({ mode, u, it });
    if (mode === "newU") setForm({ tipo: "", emoji: "👕", item: "" });
    if (mode === "editU") setForm({ tipo: u.tipo || "", emoji: u.emoji || "👕", item: "" });
    if (mode === "newItem") setForm({ tipo: "", emoji: "", item: "" });
    if (mode === "editItem") setForm({ tipo: "", emoji: "", item: it.item || "" });
  };
  const modalTitle = modal ? { newU: "Nueva categoría", editU: "Editar categoría", newItem: "Agregar ítem", editItem: "Editar ítem" }[modal.mode] : "";

  return (
    <View>
      <View style={styles.horHeaderSuper}>
        <Text style={styles.subtitle}>Categorías de uniforme del colegio</Text>
        <BotonNuevo label="Nueva categoría" onPress={() => openModal("newU")} />
      </View>
      {uniformes.length === 0 ? <EmptyState icon="tshirt-crew-outline" title="Todavía no hay categorías de uniforme" note="Creá una (por ejemplo “Uniforme diario” o “Educación física”) y sumale las prendas." /> : null}
      {uniformes.map((u) => {
        const items = (u.uniforme_items || []).slice().sort((a, b) => a.item.localeCompare(b.item, "es"));
        const linked = links.filter((l) => l.uniforme_id === u.id).map((l) => l.curso_id);
        return (
          <View key={u.id} style={styles.uniCard}>
            <View style={styles.uniHeader}>
              <Text style={styles.uniEmoji}>{u.emoji || "👕"}</Text>
              <Text style={[styles.itemNombre, styles.flex1]}>{u.tipo}</Text>
              <Pressable onPress={() => openModal("newItem", u)} style={styles.uniMini}>
                <Text style={styles.uniMiniTxt}>+ Ítem</Text>
              </Pressable>
              <Pressable onPress={() => openModal("editU", u)} style={styles.iconBtn}>
                <MaterialCommunityIcons name="pencil-outline" size={19} color="#475569" />
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(`¿Borrar ${u.tipo}?`, "No se puede deshacer.", [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Borrar", style: "destructive", onPress: async () => { await supabase.from("uniformes").delete().eq("id", u.id); cargar(); } },
                  ])}
                style={styles.iconBtn}
                accessibilityLabel="Borrar categoría"
              >
                <MaterialCommunityIcons name="trash-can-outline" size={19} color="#DC2626" />
              </Pressable>
            </View>
            {items.length === 0 ? <Text style={styles.uniSinItems}>Sin ítems aún.</Text> : null}
            {items.map((it) => (
              <View key={it.id} style={styles.uniItem}>
                <View style={styles.uniDot} />
                <Text style={[styles.flex1, styles.itemMeta, { color: T.text }]}>{it.item}</Text>
                <Pressable onPress={() => openModal("editItem", u, it)} style={styles.iconBtn}>
                  <MaterialCommunityIcons name="pencil-outline" size={19} color="#475569" />
                </Pressable>
                <Pressable
                  onPress={() =>
                  Alert.alert(`¿Borrar ${it.item}?`, "No se puede deshacer.", [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Borrar", style: "destructive", onPress: async () => { await supabase.from("uniforme_items").delete().eq("id", it.id); cargar(); } },
                  ])}
                  style={styles.iconBtn}
                  accessibilityLabel="Borrar prenda"
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={19} color="#DC2626" />
                </Pressable>
              </View>
            ))}
            <Text style={[styles.label, { marginTop: 8 }]}>Cursos que usan esta categoría</Text>
            <CursoListSelector cursos={cursos} seleccionados={linked} onToggle={(id) => toggleCurso(u.id, id)} maxHeight={150} />
          </View>
        );
      })}

      {modal ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setModal(null)}>
          <KeyboardAvoidingView style={styles.overlay} behavior="padding">
            <View style={styles.modalCard}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>{modalTitle}{modal.u ? ` — ${modal.u.tipo}` : ""}</Text>
                {modal.mode === "newU" || modal.mode === "editU" ? (
                  <>
                    <Text style={styles.label}>Nombre</Text>
                    <TextInput value={form.tipo} onChangeText={(t) => setForm((p) => ({ ...p, tipo: t }))} placeholder="Ej: Deportivo, Formal..." placeholderTextColor="#94A3B8" style={styles.input} />
                    <Text style={styles.label}>Emoji</Text>
                    <View style={styles.chipsWrap}>
                      {EMOJIS.map((e) => (
                        <Pressable key={e} onPress={() => setForm((p) => ({ ...p, emoji: e }))} style={[styles.emojiBtn, form.emoji === e && styles.chipOn]}>
                          <Text style={{ fontSize: 18 }}>{e}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>Ítem</Text>
                    <TextInput value={form.item} onChangeText={(t) => setForm((p) => ({ ...p, item: t }))} placeholder="Ej: Remera blanca manga corta" placeholderTextColor="#94A3B8" style={styles.input} />
                  </>
                )}
                <View style={styles.modalBtns}>
                  <Pressable onPress={() => setModal(null)} style={styles.cancelBtn}>
                    <Text style={styles.cancelTxt}>Cancelar</Text>
                  </Pressable>
                  <Pressable onPress={guardar} disabled={saving} style={styles.saveBtn}>
                    <Text style={styles.saveTxt}>{saving ? "Guardando..." : "Guardar"}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </View>
  );
}

// ── Cargas masivas Excel ──────────────────────────────────────────────────────
const parseFecha = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split("T")[0];
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
};

function UploadAlumnosExcel({ cursos, onDone }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const handle = async () => {
    setMsg("");
    try {
      const rows = await leerExcel();
      if (rows === null) return;
      setLoading(true);
      if (!rows.length) throw new Error("Archivo vacío");
      const findCurso = (val) => {
        if (!val) return null;
        const n = Number(val);
        if (!isNaN(n)) return n;
        const c = cursos.find((c) => c.nombre.toLowerCase() === String(val).trim().toLowerCase());
        return c?.id || null;
      };
      const inserts = rows
        .map((r) => {
          const nombre = String(r.nombre || "").trim();
          const apellido = String(r.apellido || "").trim();
          const curso_id = findCurso(r.curso_id || r.curso);
          if (!nombre || !curso_id) return null;
          const avatar = `${nombre[0] || ""}${apellido[0] || ""}`.toUpperCase() || nombre.slice(0, 2).toUpperCase();
          return { nombre, apellido: apellido || null, curso_id, avatar, color: COLORES[nombre.length % COLORES.length], fecha_nacimiento: parseFecha(r.fecha_nacimiento || r.fecha), dni: r.dni ? String(r.dni).trim() : null };
        })
        .filter(Boolean);
      if (!inserts.length) throw new Error("Sin filas válidas (columnas: nombre, apellido, curso_id, fecha_nacimiento, dni)");
      let ok = 0;
      for (const al of inserts) {
        const { data: existing } = await supabase.from("hijos").select("id").eq("nombre", al.nombre).eq("apellido", al.apellido || "").eq("curso_id", al.curso_id).maybeSingle();
        if (existing?.id) await supabase.from("hijos").update({ fecha_nacimiento: al.fecha_nacimiento || null, dni: al.dni || null, avatar: al.avatar, color: al.color }).eq("id", existing.id);
        else await supabase.from("hijos").insert(al);
        ok++;
      }
      setMsg(`${ok} alumnos procesados`);
      onDone();
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    }
    setLoading(false);
  };
  return (
    <Pressable onPress={handle} disabled={loading} style={styles.uploadBtn}>
      <MaterialCommunityIcons name="file-upload-outline" size={22} color="#475569" />
      <View style={styles.flex1}>
        <Text style={styles.uploadTitle}>{loading ? "Procesando..." : "Carga masiva desde Excel"}</Text>
        <Text style={styles.uploadHint}>{msg || "Columnas: nombre, apellido, curso_id, fecha_nacimiento, dni"}</Text>
      </View>
    </Pressable>
  );
}

function UploadApoderadosExcel({ onDone }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const handle = async () => {
    setMsg("");
    try {
      const rows = await leerExcel();
      if (rows === null) return;
      setLoading(true);
      if (!rows.length) throw new Error("Archivo vacío");
      const inserts = rows
        .map((r) => {
          const nombre = String(r.nombre || "").trim();
          const apellido = String(r.apellido || "").trim();
          const email = String(r.email || "").trim().toLowerCase();
          const pass = String(r.pass || r.password || "1234").trim();
          if (!nombre || !email) return null;
          const avatar = apellido ? `${nombre[0] || ""}${apellido[0] || ""}`.toUpperCase() : nombre.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
          return { nombre, apellido: apellido || null, email, pass, avatar, dni: r.dni ? String(r.dni).trim() : null, telefono: r.telefono ? String(r.telefono).trim() : null, rol: r.rol || "padre", activo: true };
        })
        .filter(Boolean);
      if (!inserts.length) throw new Error("Sin filas válidas (columnas: nombre, apellido, email, pass, telefono, dni)");
      let ok = 0;
      const sinAuth = []; // emails cuya cuenta de Auth falló al crearse — antes
                           // se tragaba el error y quedaban sin forma de entrar.
      for (const u of inserts) {
        const { data: existing } = await supabase.from("usuarios").select("id").eq("email", u.email).maybeSingle();
        if (existing?.id) {
          await supabase.from("usuarios").update({ nombre: u.nombre, apellido: u.apellido || null, telefono: u.telefono || null, dni: u.dni || null, activo: true }).eq("id", existing.id);
          ok++;
        } else {
          let auth_id = null;
          try {
            const { auth_id: newId } = await authAdminCreate(u.email, u.pass);
            auth_id = newId || null;
          } catch (e) {
            console.warn("Auth create:", u.email, e);
            sinAuth.push(u.email);
          }
          await supabase.from("usuarios").insert({ nombre: u.nombre, apellido: u.apellido || null, email: u.email, avatar: u.avatar, dni: u.dni || null, telefono: u.telefono || null, rol: u.rol || "padre", activo: true, auth_id });
          ok++;
        }
      }
      const avisoSinAuth = sinAuth.length
        ? ` Atención: ${sinAuth.length} sin cuenta de Auth: ${sinAuth.join(", ")} — asignales una clave desde Usuarios.`
        : "";
      setMsg(`${ok} apoderados procesados.${avisoSinAuth}`);
      onDone();
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    }
    setLoading(false);
  };
  return (
    <Pressable onPress={handle} disabled={loading} style={styles.uploadBtn}>
      <MaterialCommunityIcons name="file-upload-outline" size={22} color="#475569" />
      <View style={styles.flex1}>
        <Text style={styles.uploadTitle}>{loading ? "Procesando..." : "Carga masiva desde Excel"}</Text>
        <Text style={styles.uploadHint}>{msg || "Columnas: nombre, apellido, email, pass, telefono, dni, rol"}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  colorRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 },
  colorSwatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "transparent" },
  colorSwatchActivo: { borderColor: "#0F172A", transform: [{ scale: 1.1 }] },
  colegioSelector: { marginTop: 10, marginBottom: 4, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "white" },
  colegioSelectorLbl: { fontSize: 10, fontWeight: "800", color: "#94A3B8", letterSpacing: 0.8 },
  colegioSelectorTxt: { fontSize: 15, fontWeight: "700", color: "#0F172A", marginTop: 2 },
  colegioOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "center", padding: 24 },
  colegioSheet: { backgroundColor: "white", borderRadius: 16, padding: 16, maxHeight: "70%" },
  colegioLista: { marginTop: 8 },
  colegioOpcion: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10 },
  colegioOpcionActiva: { backgroundColor: "#EFF6FF" },
  colegioOpcionTxt: { fontSize: 14, color: "#0F172A" },
  colegioOpcionTxtActiva: { fontWeight: "700", color: "#2563EB" },
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16, paddingBottom: 40 },
  flex1: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  h1: { fontSize: 24, fontWeight: "800", color: "#0F172A", letterSpacing: -0.3 },
  fecha: { fontSize: 13, color: "#64748B", marginBottom: 2 },
  lista: { backgroundColor: "white", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 14, overflow: "hidden" },
  fila: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  filaBorde: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  filaTxt: { flex: 1, fontSize: 15, fontWeight: "600", color: "#0F172A" },
  globito: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 999, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  globitoTxt: { color: "white", fontSize: 11, fontWeight: "700" },
  enlaceBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 10, marginTop: 6 },
  enlaceTxt: { color: "#2563EB", fontSize: 14.5, fontWeight: "700" },
  filaNuevo: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 12 },
  cuentaCard: { backgroundColor: "white", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14, gap: 2 },
  statBorde: { borderLeftWidth: 1, borderLeftColor: "#F1F5F9" },
  subtitle: { fontSize: 13, color: "#64748B", marginBottom: 14 },
  muted: { fontSize: 13, color: "#94A3B8", textAlign: "center", paddingVertical: 24 },
  cardTitle: { fontSize: 15, fontWeight: "900", color: T.text, marginBottom: 6 },

  statsRow: { flexDirection: "row", marginBottom: 14, backgroundColor: "white", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" },
  statCard: { flex: 1, minWidth: 70, paddingVertical: 12, paddingHorizontal: 12 },
  statNum: { fontSize: 22, fontWeight: "800", color: "#0F172A", marginTop: 2 },
  statLbl: { fontSize: 11.5, color: "#64748B", fontWeight: "600" },

  grupoWrap: { marginBottom: 18 },
  grupoLabel: { fontSize: 10, fontWeight: "800", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  moduloGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moduloCard: { width: "31%", minWidth: 90, backgroundColor: "white", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", paddingVertical: 14, alignItems: "center", gap: 4 },
  moduloEmoji: { fontSize: 22 },
  moduloLabel: { fontSize: 11, fontWeight: "700", color: "#334155", textAlign: "center" },
  volverBtn: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", paddingVertical: 6, marginLeft: -6, marginBottom: 4 },
  volverTxt: { fontSize: 15, fontWeight: "700", color: BLUE[600] },

  dashedBtn: { borderWidth: 2, borderStyle: "dashed", borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 14 },
  dashedTxt: { fontSize: 13, fontWeight: "700" },

  itemCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 16, padding: 14, marginBottom: 10 },
  itemDato: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  itemInactivo: { opacity: 0.55 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  itemNombre: { fontSize: 14, fontWeight: "700", color: T.text },
  itemMeta: { fontSize: 12.5, color: "#64748B", marginTop: 2 },
  itemBtns: { flexDirection: "row", gap: 4 },
  iconBtn: { padding: 6, minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" },

  cursoPunto: { width: 10, height: 10, borderRadius: 999 },

  // Modales
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "white", borderRadius: 20, padding: 20, maxHeight: "88%" },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A", marginBottom: 4 },
  switchFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14, paddingVertical: 4 },
  switchTxt: { flex: 1, fontSize: 14, color: "#0F172A" },
  confirmNombre: { fontSize: 14, fontWeight: "700", color: T.text, marginVertical: 4 },
  label: { fontSize: 12.5, fontWeight: "600", color: "#475569", marginTop: 12, marginBottom: 6 },
  input: { minHeight: 44, borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: T.text, backgroundColor: "#F8FAFC" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "white" },
  chipOn: { borderColor: T.accent, backgroundColor: "#EFF6FF" },
  chipTxt: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  chipTxtOn: { color: T.accent, fontWeight: "700" },
  emojiBtn: { width: 40, height: 40, borderRadius: 8, borderWidth: 1.5, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center", backgroundColor: "white" },
  colorDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: "transparent" },
  colorDotOn: { borderColor: T.primary },
  togglePill: { alignSelf: "flex-start", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14, marginTop: 4 },
  toggleTxt: { fontSize: 13, fontWeight: "700", color: "#334155" },
  optRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, backgroundColor: "white" },
  optRowSel: { borderColor: T.accent, backgroundColor: "#EFF6FF" },
  optTxt: { fontSize: 13, color: T.text, flex: 1 },
  hijoChip: { backgroundColor: "#EFF6FF", borderWidth: 1.5, borderColor: "#BFDBFE", borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
  hijoChipTxt: { fontSize: 12, fontWeight: "700", color: "#3B82F6" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  cancelTxt: { fontSize: 14, fontWeight: "700", color: "#334155" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: 10, backgroundColor: T.accent, alignItems: "center", justifyContent: "center" },
  saveTxt: { fontSize: 14, fontWeight: "700", color: "white" },

  pagosHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  closeTxt: { fontSize: 18, color: "#94A3B8" },
  apodRow: { backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12, marginBottom: 8 },

  // Alertas
  alertaActiva: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "white", borderWidth: 1, borderColor: "#FECACA", borderRadius: 16, padding: 14, marginTop: 8 },
  alertaEmoji: { fontSize: 22 },
  alertaCurso: { fontSize: 12, fontWeight: "700", color: "#B91C1C" },
  alertaMsg: { fontSize: 14, fontWeight: "600", color: "#0F172A", marginTop: 2 },
  alertaDismiss: { paddingVertical: 6, paddingHorizontal: 4 },
  alertaDismissTxt: { color: "#64748B", fontSize: 13.5, fontWeight: "700" },
  alertaNueva: { borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "white", borderRadius: 16, padding: 16, alignItems: "flex-start", marginTop: 8 },
  alertaNuevaTxt: { color: "#2563EB", fontSize: 14, fontWeight: "700" },

  // Horarios
  horHeaderSuper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 14 },
  addBtn: { backgroundColor: T.accent, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, minHeight: 40, justifyContent: "center" },
  addTxt: { color: "white", fontSize: 12, fontWeight: "700" },
  diaGroup: { marginBottom: 12 },
  diaLabel: { fontSize: 11, fontWeight: "700", color: "#64748B", letterSpacing: 0.6, marginBottom: 5 },
  horRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F8FAFC", borderRadius: 9, borderWidth: 1, borderColor: "#E2E8F0", paddingVertical: 8, paddingHorizontal: 12, marginBottom: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },

  // Uniformes
  uniCard: { backgroundColor: "white", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, marginBottom: 12 },
  uniHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  uniEmoji: { fontSize: 20 },
  uniMini: { paddingVertical: 4, paddingHorizontal: 6 },
  uniMiniTxt: { color: "#2563EB", fontSize: 14, fontWeight: "700" },
  uniSinItems: { fontSize: 12, color: "#94A3B8", marginBottom: 6 },
  uniItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#F8FAFC" },
  uniDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#CBD5E1" },

  // Codigos
  codNuevo: { backgroundColor: "white", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", padding: 14, marginBottom: 16 },
  codBig: { fontFamily: "monospace", fontSize: 22, fontWeight: "900", letterSpacing: 4, color: T.text },

  // Upload
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "#CBD5E1", backgroundColor: "white", borderRadius: 16, padding: 14, marginBottom: 14 },
  uploadEmoji: { fontSize: 20 },
  uploadTitle: { fontSize: 13.5, fontWeight: "700", color: "#0F172A" },
  uploadHint: { fontSize: 12, color: "#64748B", marginTop: 2 },

  // Colegio (datos de contacto)
  colegioCard: { backgroundColor: "white", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", padding: 14 },
  colegioLogo: { width: 64, height: 64, borderRadius: 12, backgroundColor: "#F1F5F9", marginBottom: 12 },
  colegioFila: { borderTopWidth: 1, borderTopColor: "#F1F5F9", paddingVertical: 8 },
  colegioFilaLabel: { fontSize: 10.5, fontWeight: "800", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 },
  colegioFilaVal: { fontSize: 13.5, color: T.text, marginTop: 2 },
  colegioErr: { fontSize: 12, fontWeight: "700", color: "#EF4444", marginTop: 12 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  logoPreview: { width: 52, height: 52, borderRadius: 10, backgroundColor: "#F1F5F9" },
  logoEmpty: { borderWidth: 1.5, borderColor: "#E2E8F0", borderStyle: "dashed" },
  logoBtn: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "white", justifyContent: "center" },
  logoBtnTxt: { fontSize: 12, fontWeight: "700", color: T.text },
});
