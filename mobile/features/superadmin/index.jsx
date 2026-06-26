// Super Admin (puerto RN de src/features/superadmin). Consola global de gestión:
// usuarios (alta/edición vía Edge Function manage-auth-user), cursos, maestros,
// alumnos, códigos de invitación, horarios, uniformes, contacto del colegio,
// alertas por curso y carga del menú. Las cargas masivas usan expo-document-picker
// + xlsx (mismo patrón que Comedor). Se usa TextInput para emoji/avatar (no hay
// EmojiPicker en mobile) y Share para compartir códigos (sin dep de portapapeles).

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Modal, Share, StyleSheet } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { authAdminCreate, authAdminUpdate, authAdminFind } from "../../lib/authAdmin";
import { fmtNombre, fmtF, sanitize } from "@shared/helpers";
import { T, ROL_LABEL, ROL_COLOR, ROL_BG } from "@shared/theme";
import { Pill } from "../../components/Pill";
import { Spinner } from "../../components/Spinner";
import { ListToolbar } from "../../components/ListToolbar";
import { Paginador } from "../../components/Paginador";
import { useListControls } from "../../lib/useListControls";
import { UploadMenuExcel } from "../comedor";

const SECCIONES = [
  { id: "usuarios", l: "👤 Usuarios" },
  { id: "cursos", l: "🏫 Cursos" },
  { id: "maestros", l: "👨‍🏫 Maestros" },
  { id: "alumnos", l: "🎒 Alumnos" },
  { id: "codigos", l: "🔑 Códigos" },
  { id: "horarios", l: "🕐 Horarios" },
  { id: "uniformes", l: "👕 Uniformes" },
  { id: "alertas", l: "🚨 Alertas" },
  { id: "menu", l: "🍽️ Menú" },
];
const COLORES = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#0EA5E9", "#14B8A6"];

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
  const [sec, setSec] = useState("usuarios");
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

  const cargar = useCallback(async () => {
    setLoading(true);
    const [u, c, h, m, mc] = await Promise.all([
      supabase.from("usuarios").select("*, usuario_hijos(hijo_id), usuario_cursos(curso_id, rol)").order("id"),
      supabase.from("cursos").select("*").order("id"),
      supabase.from("hijos").select("*").order("id"),
      supabase.from("maestros").select("*").order("id"),
      supabase.from("maestro_cursos").select("*"),
    ]);
    setUsuarios(
      (u.data || []).map((x) => ({
        ...x,
        hijos: x.usuario_hijos.map((r) => r.hijo_id),
        cursos: x.usuario_cursos.map((r) => r.curso_id),
        cursosAdmin: x.usuario_cursos.filter((r) => r.rol === "admin").map((r) => r.curso_id),
      }))
    );
    setCursos(c.data || []);
    setHijos(h.data || []);
    const mcData = mc.data || [];
    setMaestros((m.data || []).map((x) => ({ ...x, cursos: mcData.filter((r) => r.maestro_id === x.id).map((r) => r.curso_id) })));
    const al = await supabase
      .from("hijos")
      .select("*, usuarios:usuario_hijos(usuario_id, usuarios(id,nombre,apellido,email,telefono))")
      .order("nombre");
    setAlumnos(al.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // ── Guardar usuario (crear vía Edge Function / actualizar + sync Auth) ──────────
  const guardarUsuario = async () => {
    if (!form.nombre || !form.email) return;
    if (modal === "nuevo_usuario" && !form.pass) return;
    const apellido = form.apellido || "";
    const avatar = form.avatar || `${(form.nombre || "")[0] || ""}${apellido[0] || ""}`.toUpperCase() || form.nombre.slice(0, 2).toUpperCase();
    const rolGlobal = form.esSuper ? "super" : (form.cursosAdmin || []).length > 0 ? "admin" : "padre";

    if (modal === "nuevo_usuario") {
      let auth_id = null;
      try {
        const { auth_id: newId } = await authAdminCreate(sanitize(form.email).toLowerCase(), form.pass);
        auth_id = newId || null;
      } catch (e) {
        console.warn("Error creando en Auth:", e);
      }
      const { data } = await supabase
        .from("usuarios")
        .insert({
          nombre: sanitize(form.nombre),
          apellido: sanitize(form.apellido) || null,
          email: sanitize(form.email).toLowerCase(),
          rol: rolGlobal,
          avatar,
          activo: form.activo,
          dni: sanitize(form.dni) || null,
          telefono: sanitize(form.telefono) || null,
          auth_id,
        })
        .select()
        .single();
      if (data) {
        if ((form.cursosAdmin || []).length)
          await supabase.from("usuario_cursos").insert((form.cursosAdmin || []).map((cid) => ({ usuario_id: data.id, curso_id: cid, rol: "admin" })));
        if ((form.hijos || []).length)
          await supabase.from("usuario_hijos").insert((form.hijos || []).map((hid) => ({ usuario_id: data.id, hijo_id: hid })));
      }
    } else {
      const passNueva = form._passNueva && form._passNueva.trim();
      const emailNuevo = sanitize(form.email).toLowerCase();
      await supabase
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
      const emailCambio = emailNuevo !== (form._emailOriginal || "").toLowerCase();
      if (passNueva || emailCambio) {
        try {
          let authId = form.auth_id;
          if (!authId) {
            const found = await authAdminFind(form._emailOriginal || form.email);
            authId = found.auth_id || null;
            if (authId) await supabase.from("usuarios").update({ auth_id: authId }).eq("id", form.id);
          }
          if (authId) {
            await authAdminUpdate(authId, {
              ...(emailCambio ? { email: emailNuevo } : {}),
              ...(passNueva ? { password: passNueva } : {}),
            });
          }
        } catch (e) {
          console.warn("Error sincronizando Auth:", e);
        }
      }
      await supabase.from("usuario_cursos").delete().eq("usuario_id", form.id);
      await supabase.from("usuario_hijos").delete().eq("usuario_id", form.id);
      if ((form.cursosAdmin || []).length)
        await supabase.from("usuario_cursos").insert((form.cursosAdmin || []).map((cid) => ({ usuario_id: form.id, curso_id: cid, rol: "admin" })));
      if ((form.hijos || []).length)
        await supabase.from("usuario_hijos").insert((form.hijos || []).map((hid) => ({ usuario_id: form.id, hijo_id: hid })));
    }
    setModal(null);
    cargar();
  };

  const guardarCurso = async () => {
    if (!form.nombre) return;
    if (modal === "editar_curso")
      await supabase.from("cursos").update({ nombre: form.nombre, avatar: form.avatar, color: form.color }).eq("id", form.id);
    else await supabase.from("cursos").insert({ nombre: form.nombre, avatar: form.avatar || "🏫", color: form.color || "#3B82F6" });
    setModal(null);
    cargar();
  };

  const guardarMaestro = async () => {
    if (!form.nombre) return;
    const apellido = form.apellido || "";
    const avatar = form.avatar || `${(form.nombre || "")[0] || ""}${apellido[0] || ""}`.toUpperCase() || form.nombre.slice(0, 2).toUpperCase();
    if (modal === "nuevo_maestro") {
      const { data } = await supabase
        .from("maestros")
        .insert({
          nombre: sanitize(form.nombre),
          materia: sanitize(form.materia) || null,
          email: sanitize(form.email) || null,
          avatar,
          activo: form.activo !== false,
          fecha_nacimiento: form.fecha_nacimiento || null,
        })
        .select()
        .single();
      if (data && form.cursos?.length) await supabase.from("maestro_cursos").insert(form.cursos.map((cid) => ({ maestro_id: data.id, curso_id: cid })));
    } else {
      await supabase
        .from("maestros")
        .update({
          nombre: sanitize(form.nombre),
          materia: sanitize(form.materia) || null,
          email: sanitize(form.email) || null,
          activo: form.activo !== false,
          fecha_nacimiento: form.fecha_nacimiento || null,
        })
        .eq("id", form.id);
      await supabase.from("maestro_cursos").delete().eq("maestro_id", form.id);
      if (form.cursos?.length) await supabase.from("maestro_cursos").insert(form.cursos.map((cid) => ({ maestro_id: form.id, curso_id: cid })));
    }
    setModal(null);
    cargar();
  };

  const guardarAlumno = async () => {
    if (!form.nombre || !form.curso_id) return;
    const apellido = form.apellido || "";
    const avatar = form.avatar || `${(form.nombre || "")[0] || ""}${apellido[0] || ""}`.toUpperCase() || form.nombre.slice(0, 2).toUpperCase();
    const color = form.color || COLORES[Math.floor(form.nombre.length % COLORES.length)];
    if (modal === "nuevo_alumno") {
      await supabase.from("hijos").insert({
        nombre: form.nombre,
        apellido: form.apellido || null,
        curso_id: form.curso_id,
        avatar,
        color,
        fecha_nacimiento: form.fecha_nacimiento || null,
        dni: sanitize(form.dni) || null,
      });
    } else {
      await supabase
        .from("hijos")
        .update({
          nombre: form.nombre,
          apellido: form.apellido || null,
          curso_id: form.curso_id,
          fecha_nacimiento: form.fecha_nacimiento || null,
          dni: sanitize(form.dni) || null,
        })
        .eq("id", form.id);
    }
    setModal(null);
    cargar();
  };

  const toggleActivo = async (u) => {
    await supabase.from("usuarios").update({ activo: !u.activo }).eq("id", u.id);
    cargar();
  };
  const eliminarUsuario = async (id) => {
    await supabase.from("usuario_hijos").delete().eq("usuario_id", id);
    await supabase.from("usuario_cursos").delete().eq("usuario_id", id);
    await supabase.from("usuarios").delete().eq("id", id);
    setConfirm(null);
    cargar();
  };
  const eliminarCurso = async (id) => {
    await supabase.from("cursos").delete().eq("id", id);
    setConfirm(null);
    cargar();
  };
  const eliminarMaestro = async (id) => {
    await supabase.from("maestro_cursos").delete().eq("maestro_id", id);
    await supabase.from("maestros").delete().eq("id", id);
    setConfirm(null);
    cargar();
  };
  const eliminarAlumno = async (id) => {
    await supabase.from("usuario_hijos").delete().eq("hijo_id", id);
    await supabase.from("hijos").delete().eq("id", id);
    setConfirm(null);
    cargar();
  };

  // ── List controls ──────────────────────────────────────────────────────────
  const ctrlUsuarios = useListControls(usuarios, {
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
          { value: "admin", label: "Room Parent" },
          { value: "super", label: "Super Admin" },
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
    searchFn: (m, q) => m.nombre.toLowerCase().includes(q) || (m.materia || "").toLowerCase().includes(q),
    sortOptions: [
      { key: "nombre", label: "Nombre", val: (m) => m.nombre },
      { key: "materia", label: "Materia", val: (m) => m.materia || "" },
    ],
    pageSize: 12,
  });

  if (loading) return <Spinner />;

  const stats = [
    { n: usuarios.filter((u) => u.activo).length, l: "Usuarios activos", c: "#10B981", bg: "#F0FDF4" },
    { n: usuarios.filter((u) => u.rol === "padre").length, l: "Apoderados", c: "#3B82F6", bg: "#EFF6FF" },
    { n: usuarios.filter((u) => u.rol === "admin").length, l: "Room Parents", c: "#8B5CF6", bg: "#F5F3FF" },
    { n: cursos.length, l: "Cursos", c: "#F59E0B", bg: "#FFFBEB" },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <Text style={styles.h1}>Panel Super Admin</Text>
        <Pill label="Super Admin" color="#8B5CF6" bg="#F5F3FF" />
      </View>
      <Text style={styles.subtitle}>Gestión global de usuarios, roles y cursos</Text>

      <View style={styles.statsRow}>
        {stats.map((s) => (
          <View key={s.l} style={[styles.statCard, { backgroundColor: s.bg }]}>
            <Text style={[styles.statNum, { color: s.c }]}>{s.n}</Text>
            <Text style={styles.statLbl}>{s.l}</Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.secTabs}>
        {SECCIONES.map((t) => (
          <Pressable key={t.id} onPress={() => setSec(t.id)} style={[styles.secTab, sec === t.id && styles.secTabOn]}>
            <Text style={[styles.secTabTxt, sec === t.id && styles.secTabTxtOn]}>{t.l}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {sec === "usuarios" ? (
        <View>
          <UploadApoderadosExcel onDone={cargar} />
          <Pressable
            onPress={() => {
              setForm({ nombre: "", apellido: "", email: "", pass: "", esSuper: false, cursosAdmin: [], hijos: [], activo: true });
              setModal("nuevo_usuario");
            }}
            style={[styles.dashedBtn, { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" }]}
          >
            <Text style={[styles.dashedTxt, { color: "#3B82F6" }]}>+ Agregar usuario individual</Text>
          </Pressable>
          <ListToolbar {...ctrlUsuarios} placeholder="Buscar por nombre o email..." />
          {ctrlUsuarios.items.map((u) => (
            <View key={u.id} style={[styles.itemCard, !u.activo && styles.itemInactivo]}>
              <View style={styles.flex1}>
                <View style={styles.itemTop}>
                  <Text style={styles.itemNombre}>
                    {u.nombre}
                    {u.apellido ? ` ${u.apellido}` : ""}
                  </Text>
                  <Pill label={ROL_LABEL[u.rol]} color={ROL_COLOR[u.rol]} bg={ROL_BG[u.rol]} />
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
                  <Text>✏️</Text>
                </Pressable>
                <Pressable onPress={() => toggleActivo(u)} style={styles.iconBtn}>
                  <Text>{u.activo ? "🚫" : "✓"}</Text>
                </Pressable>
                {u.rol !== "super" ? (
                  <Pressable
                    onPress={() => setConfirm({ nombre: `${u.nombre}${u.apellido ? " " + u.apellido : ""}`, msg: "Esta acción no se puede deshacer.", action: () => eliminarUsuario(u.id) })}
                    style={styles.iconBtn}
                  >
                    <Text>🗑️</Text>
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
          <Pressable
            onPress={() => {
              setForm({ nombre: "", avatar: "🏫", color: "#3B82F6" });
              setModal("nuevo_curso");
            }}
            style={[styles.dashedBtn, { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" }]}
          >
            <Text style={[styles.dashedTxt, { color: "#3B82F6" }]}>+ Agregar nuevo curso</Text>
          </Pressable>
          {cursos.map((c) => {
            const admins = usuarios.filter((u) => u.rol === "admin" && u.cursos.includes(c.id));
            const padres = usuarios.filter((u) => u.rol === "padre" && hijos.filter((h) => h.curso_id === c.id).some((h) => u.hijos.includes(h.id)));
            return (
              <View key={c.id} style={[styles.itemCard, { borderLeftWidth: 4, borderLeftColor: c.color }]}>
                <View style={[styles.cursoAvatar, { backgroundColor: c.color + "22" }]}>
                  <Text style={styles.cursoAvatarTxt}>{c.avatar}</Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.itemNombre}>{c.nombre}</Text>
                  <Text style={styles.itemMeta}>
                    {admins.length} Room Parent{admins.length !== 1 ? "s" : ""} · {padres.length} familias
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
                    <Text>✏️</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirm({ nombre: c.nombre, msg: "Se eliminarán todos los datos asociados al curso.", action: () => eliminarCurso(c.id) })}
                    style={styles.iconBtn}
                  >
                    <Text>🗑️</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {sec === "maestros" ? (
        <View>
          <Pressable
            onPress={() => {
              setForm({ nombre: "", materia: "", email: "", cursos: [], activo: true });
              setModal("nuevo_maestro");
            }}
            style={[styles.dashedBtn, { borderColor: "#8B5CF6", backgroundColor: "#F5F3FF" }]}
          >
            <Text style={[styles.dashedTxt, { color: "#8B5CF6" }]}>+ Agregar nuevo maestro</Text>
          </Pressable>
          <ListToolbar {...ctrlMaestros} placeholder="Buscar maestro o materia..." />
          {ctrlMaestros.items.map((m) => (
            <View key={m.id} style={[styles.itemCard, !m.activo && styles.itemInactivo]}>
              <View style={styles.flex1}>
                <View style={styles.itemTop}>
                  <Text style={styles.itemNombre}>{m.nombre}</Text>
                  {m.materia ? <Pill label={m.materia} color="#8B5CF6" bg="#F5F3FF" /> : null}
                  {!m.activo ? <Pill label="Inactivo" color="#94A3B8" bg="#F1F5F9" /> : null}
                </View>
                {m.email ? <Text style={styles.itemMeta}>{m.email}</Text> : null}
                {m.cursos.length > 0 ? (
                  <Text style={styles.itemMeta}>Cursos: {m.cursos.map((cid) => cursos.find((c) => c.id === cid)?.nombre).filter(Boolean).join(", ")}</Text>
                ) : null}
              </View>
              <View style={styles.itemBtns}>
                <Pressable
                  onPress={() => {
                    setForm({ ...m, cursos: [...(m.cursos || [])] });
                    setModal("editar_maestro");
                  }}
                  style={styles.iconBtn}
                >
                  <Text>✏️</Text>
                </Pressable>
                <Pressable onPress={() => setConfirm({ nombre: m.nombre, msg: "Esta acción no se puede deshacer.", action: () => eliminarMaestro(m.id) })} style={styles.iconBtn}>
                  <Text>🗑️</Text>
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
          <Pressable
            onPress={() => {
              setForm({ nombre: "", curso_id: cursos[0]?.id, fecha_nacimiento: "", color: "" });
              setModal("nuevo_alumno");
            }}
            style={[styles.dashedBtn, { borderColor: "#10B981", backgroundColor: "#F0FDF4" }]}
          >
            <Text style={[styles.dashedTxt, { color: "#10B981" }]}>+ Agregar alumno individual</Text>
          </Pressable>
          <ListToolbar {...ctrlAlumnos} placeholder="Buscar alumno..." />
          {ctrlAlumnos.items.map((a) => {
            const curso = cursos.find((c) => c.id === a.curso_id);
            const apods = (a.usuarios || []).map((x) => x.usuarios).filter(Boolean);
            return (
              <View key={a.id} style={styles.itemCard}>
                <View style={styles.flex1}>
                  <View style={styles.itemTop}>
                    <Text style={styles.itemNombre}>{fmtNombre(a)}</Text>
                    {curso ? <Pill label={curso.nombre} color={curso.color} bg={curso.color + "22"} /> : null}
                  </View>
                  {a.fecha_nacimiento ? <Text style={styles.itemMeta}>🎂 {fmtF(a.fecha_nacimiento)}</Text> : null}
                  {apods.length > 0 ? <Text style={styles.itemMeta}>👨‍👩‍👧 {apods.map((p) => fmtNombre(p)).join(", ")}</Text> : null}
                </View>
                <View style={styles.itemBtns}>
                  <Pressable onPress={() => setVerApod(a)} style={styles.iconBtn}>
                    <Text>👨‍👩‍👧</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setForm({ ...a });
                      setModal("editar_alumno");
                    }}
                    style={styles.iconBtn}
                  >
                    <Text>✏️</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirm({ nombre: fmtNombre(a), msg: "Esta acción no se puede deshacer.", action: () => eliminarAlumno(a.id) })} style={styles.iconBtn}>
                    <Text>🗑️</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          <Paginador pagina={ctrlAlumnos.pagina} totalPag={ctrlAlumnos.totalPag} setPagina={ctrlAlumnos.setPagina} />
        </View>
      ) : null}

      {sec === "codigos" ? <CodigosInvitacion cursos={cursos} /> : null}
      {sec === "horarios" ? <HorariosAdmin cursos={cursos} /> : null}
      {sec === "uniformes" ? <UniformesAdmin cursos={cursos} /> : null}
      {sec === "alertas" ? <AlertasAdmin cursos={cursos} /> : null}
      {sec === "menu" ? (
        <View>
          <Text style={styles.cardTitle}>🍽️ Menú comedor</Text>
          <Text style={styles.subtitle}>Cargá el menú mensual desde un Excel. Se reemplazan los días incluidos.</Text>
          <UploadMenuExcel onDone={() => {}} />
        </View>
      ) : null}

      {/* ── Modales CRUD ── */}
      {modal === "nuevo_usuario" || modal?.edit ? (
        <UsuarioModal
          esNuevo={modal === "nuevo_usuario"}
          form={form}
          setForm={setForm}
          cursos={cursos}
          hijos={hijos}
          onClose={() => setModal(null)}
          onSave={guardarUsuario}
        />
      ) : null}
      {modal === "nuevo_curso" || modal === "editar_curso" ? (
        <CursoModal esNuevo={modal === "nuevo_curso"} form={form} setForm={setForm} onClose={() => setModal(null)} onSave={guardarCurso} />
      ) : null}
      {modal === "nuevo_maestro" || modal === "editar_maestro" ? (
        <MaestroModal esNuevo={modal === "nuevo_maestro"} form={form} setForm={setForm} cursos={cursos} onClose={() => setModal(null)} onSave={guardarMaestro} />
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
function UsuarioModal({ esNuevo, form, setForm, cursos, hijos, onClose, onSave }) {
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
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{esNuevo ? "Nuevo usuario" : "Editar usuario"}</Text>
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

            <Text style={styles.label}>ACCESO ESPECIAL</Text>
            <Pressable onPress={() => setForm((p) => ({ ...p, esSuper: !p.esSuper }))} style={[styles.togglePill, form.esSuper && { borderColor: "#8B5CF6", backgroundColor: "#F5F3FF" }]}>
              <Text style={[styles.toggleTxt, form.esSuper && { color: "#8B5CF6" }]}>{form.esSuper ? "★ Super Admin" : "◇ Super Admin"}</Text>
            </Pressable>

            {!form.esSuper ? (
              <>
                <Text style={styles.label}>👶 HIJOS VINCULADOS</Text>
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
                    <Text style={styles.label}>🏫 ROOM PARENT</Text>
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

            <Text style={styles.label}>ESTADO</Text>
            <Pressable
              onPress={() => setForm((p) => ({ ...p, activo: !p.activo }))}
              style={[styles.togglePill, form.activo ? { borderColor: "#10B981", backgroundColor: "#F0FDF4" } : { borderColor: "#EF4444", backgroundColor: "#FEF2F2" }]}
            >
              <Text style={[styles.toggleTxt, { color: form.activo ? "#10B981" : "#EF4444" }]}>{form.activo ? "✓ Activo" : "✗ Inactivo"}</Text>
            </Pressable>

            <View style={styles.modalBtns}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={onSave} style={styles.saveBtn}>
                <Text style={styles.saveTxt}>{esNuevo ? "Crear usuario" : "Guardar cambios"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CursoModal({ esNuevo, form, setForm, onClose, onSave }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <ScrollView>
            <Text style={styles.modalTitle}>{esNuevo ? "Nuevo curso" : "Editar curso"}</Text>
            <Text style={styles.label}>NOMBRE DEL CURSO</Text>
            <TextInput value={form.nombre || ""} onChangeText={(t) => setForm((p) => ({ ...p, nombre: t }))} placeholder="Ej: 4°B — Primaria" placeholderTextColor="#94A3B8" style={styles.input} />
            <Text style={styles.label}>ÍCONO (EMOJI)</Text>
            <TextInput value={form.avatar || "🏫"} onChangeText={(t) => setForm((p) => ({ ...p, avatar: t }))} maxLength={2} style={[styles.input, { fontSize: 22 }]} />
            <Text style={styles.label}>COLOR</Text>
            <View style={styles.chipsWrap}>
              {COLORES.map((c) => (
                <Pressable key={c} onPress={() => setForm((p) => ({ ...p, color: c }))} style={[styles.colorDot, { backgroundColor: c }, form.color === c && styles.colorDotOn]} />
              ))}
            </View>
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
      </View>
    </Modal>
  );
}

function MaestroModal({ esNuevo, form, setForm, cursos, onClose, onSave }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <ScrollView>
            <Text style={styles.modalTitle}>{esNuevo ? "Nuevo maestro" : "Editar maestro"}</Text>
            {[
              { l: "Nombre completo", k: "nombre", ph: "Ej: Carlos Gómez" },
              { l: "Materia", k: "materia", ph: "Ej: Matemáticas" },
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
            <Text style={styles.label}>CUMPLEAÑOS (AAAA-MM-DD)</Text>
            <TextInput value={form.fecha_nacimiento || ""} onChangeText={(t) => setForm((p) => ({ ...p, fecha_nacimiento: t }))} placeholder="1985-04-12" placeholderTextColor="#94A3B8" autoCapitalize="none" style={styles.input} />
            <Text style={styles.label}>CURSOS ASIGNADOS</Text>
            <View style={styles.chipsWrap}>
              {cursos.map((c) => {
                const sel = (form.cursos || []).includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setForm((p) => ({ ...p, cursos: sel ? p.cursos.filter((x) => x !== c.id) : [...(p.cursos || []), c.id] }))}
                    style={[styles.chip, sel && { borderColor: c.color, backgroundColor: c.color + "22" }]}
                  >
                    <Text style={[styles.chipTxt, sel && { color: c.color }]}>
                      {c.avatar} {c.nombre}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.label}>ESTADO</Text>
            <Pressable
              onPress={() => setForm((p) => ({ ...p, activo: p.activo === false }))}
              style={[styles.togglePill, form.activo !== false ? { borderColor: "#10B981", backgroundColor: "#F0FDF4" } : { borderColor: "#EF4444", backgroundColor: "#FEF2F2" }]}
            >
              <Text style={[styles.toggleTxt, { color: form.activo !== false ? "#10B981" : "#EF4444" }]}>{form.activo !== false ? "✓ Activo" : "✗ Inactivo"}</Text>
            </Pressable>
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
      </View>
    </Modal>
  );
}

function AlumnoModal({ esNuevo, form, setForm, cursos, onClose, onSave }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <ScrollView>
            <Text style={styles.modalTitle}>{esNuevo ? "Nuevo alumno" : "Editar alumno"}</Text>
            <View style={styles.row}>
              <View style={styles.flex1}>
                <Text style={styles.label}>NOMBRE</Text>
                <TextInput value={form.nombre || ""} onChangeText={(t) => setForm((p) => ({ ...p, nombre: t }))} placeholder="Ej: Sofía" placeholderTextColor="#94A3B8" style={styles.input} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.label}>APELLIDO</Text>
                <TextInput value={form.apellido || ""} onChangeText={(t) => setForm((p) => ({ ...p, apellido: t }))} placeholder="Ej: García" placeholderTextColor="#94A3B8" style={styles.input} />
              </View>
            </View>
            <Text style={styles.label}>FECHA DE NACIMIENTO (AAAA-MM-DD)</Text>
            <TextInput value={form.fecha_nacimiento || ""} onChangeText={(t) => setForm((p) => ({ ...p, fecha_nacimiento: t }))} placeholder="2016-03-21" placeholderTextColor="#94A3B8" autoCapitalize="none" style={styles.input} />
            <Text style={styles.label}>DNI</Text>
            <TextInput value={form.dni || ""} onChangeText={(t) => setForm((p) => ({ ...p, dni: t }))} placeholder="Ej: 12345678" placeholderTextColor="#94A3B8" style={styles.input} />
            <Text style={styles.label}>CURSO</Text>
            <View style={styles.chipsWrap}>
              {cursos.map((c) => {
                const sel = form.curso_id === c.id;
                return (
                  <Pressable key={c.id} onPress={() => setForm((p) => ({ ...p, curso_id: c.id }))} style={[styles.chip, sel && { borderColor: c.color, backgroundColor: c.color + "22" }]}>
                    <Text style={[styles.chipTxt, sel && { color: c.color }]}>
                      {c.avatar} {c.nombre}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
      </View>
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
            <Text style={styles.modalTitle}>👨‍👩‍👧 Apoderados de {fmtNombre(alumno)}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>
          <ScrollView>
            {apods.length === 0 ? <Text style={styles.muted}>Sin apoderados vinculados</Text> : null}
            {apods.map((p) => (
              <View key={p.id} style={styles.apodRow}>
                <Text style={styles.itemNombre}>{fmtNombre(p)}</Text>
                {p.telefono ? <Text style={styles.itemMeta}>📞 {p.telefono}</Text> : null}
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
    const userIds = await getUserIdsByCurso(cursoSel.id);
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
      <View style={styles.chipsWrap}>
        {cursos.map((c) => (
          <Pressable key={c.id} onPress={() => selCurso(c)} style={[styles.chip, cursoSel?.id === c.id && { borderColor: c.color, backgroundColor: c.color + "22" }]}>
            <Text style={[styles.chipTxt, cursoSel?.id === c.id && { color: c.color }]}>
              {c.avatar} {c.nombre}
            </Text>
          </Pressable>
        ))}
      </View>
      {cursoSel ? (
        alerta ? (
          <View style={styles.alertaActiva}>
            <Text style={styles.alertaEmoji}>🚨</Text>
            <View style={styles.flex1}>
              <Text style={styles.alertaCurso}>Alerta activa — {cursoSel.nombre}</Text>
              <Text style={styles.alertaMsg}>{alerta.mensaje}</Text>
            </View>
            <Pressable onPress={dismiss} style={styles.alertaDismiss}>
              <Text style={styles.alertaDismissTxt}>Desactivar</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setModal(true)} style={styles.alertaNueva}>
            <Text style={styles.alertaNuevaTxt}>🚨 Enviar alerta a {cursoSel.nombre}</Text>
          </Pressable>
        )
      ) : null}

      {modal ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setModal(false)}>
          <View style={styles.overlay}>
            <View style={[styles.modalCard, { maxHeight: undefined }]}>
              <Text style={styles.modalTitle}>🚨 Enviar alerta</Text>
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
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

// ── HorariosAdmin (super: selector de curso) ─────────────────────────────────────
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
function HorariosAdmin({ cursos }) {
  const [cursoSel, setCursoSel] = useState(null);
  const [horarios, setHorarios] = useState([]);
  const [maestros, setMaestros] = useState([]);
  const [horForm, setHorForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const cargar = async (cid) => {
    if (!cid) return;
    const mc = await supabase.from("maestro_cursos").select("maestro_id").eq("curso_id", cid);
    const ids = (mc.data || []).map((r) => r.maestro_id);
    const [hor, mae] = await Promise.all([
      supabase.from("horarios").select("*").eq("curso_id", cid).order("dia").order("hora_inicio"),
      ids.length ? supabase.from("maestros").select("id,nombre,materia").eq("activo", true).in("id", ids) : Promise.resolve({ data: [] }),
    ]);
    setHorarios(hor.data || []);
    setMaestros(mae.data || []);
  };
  const selCurso = (c) => {
    setCursoSel(c);
    cargar(c.id);
  };
  const guardar = async () => {
    if (!horForm?.materia?.trim() || !horForm?.hora_inicio || !horForm?.hora_fin || !cursoSel) return;
    setSaving(true);
    const payload = {
      materia: horForm.materia.trim(),
      dia: horForm.dia,
      hora_inicio: horForm.hora_inicio,
      hora_fin: horForm.hora_fin,
      docente: horForm.docente || null,
      color: horForm.color || "#3B82F6",
      curso_id: cursoSel.id,
    };
    if (horForm.id) await supabase.from("horarios").update(payload).eq("id", horForm.id);
    else await supabase.from("horarios").insert(payload);
    setSaving(false);
    setHorForm(null);
    cargar(cursoSel.id);
  };
  const eliminar = async (id) => {
    await supabase.from("horarios").delete().eq("id", id);
    cargar(cursoSel.id);
  };

  return (
    <View>
      <View style={styles.chipsWrap}>
        {cursos.map((c) => (
          <Pressable key={c.id} onPress={() => selCurso(c)} style={[styles.chip, cursoSel?.id === c.id && { borderColor: c.color, backgroundColor: c.color + "22" }]}>
            <Text style={[styles.chipTxt, cursoSel?.id === c.id && { color: c.color }]}>
              {c.avatar} {c.nombre}
            </Text>
          </Pressable>
        ))}
      </View>
      {!cursoSel ? <Text style={styles.muted}>Seleccioná un curso para ver su horario</Text> : null}
      {cursoSel ? (
        <>
          <View style={styles.horHeaderSuper}>
            <Text style={styles.cardTitle}>
              {cursoSel.avatar} {cursoSel.nombre}
            </Text>
            <Pressable onPress={() => setHorForm({ dia: "Lunes", hora_inicio: "08:00", hora_fin: "09:00", materia: "", docente: "", color: "#3B82F6" })} style={styles.addBtn}>
              <Text style={styles.addTxt}>+ Nueva clase</Text>
            </Pressable>
          </View>
          {horarios.length === 0 ? <Text style={styles.muted}>Sin clases cargadas</Text> : null}
          {DIAS.map((dia) => {
            const items = horarios.filter((h) => h.dia === dia);
            if (!items.length) return null;
            return (
              <View key={dia} style={styles.diaGroup}>
                <Text style={styles.diaLabel}>{dia}</Text>
                {items.map((h) => (
                  <View key={h.id} style={styles.horRow}>
                    <View style={[styles.dot, { backgroundColor: h.color || "#3B82F6" }]} />
                    <View style={styles.flex1}>
                      <Text style={styles.itemNombre}>{h.materia}</Text>
                      {h.docente ? <Text style={styles.itemMeta}>{h.docente}</Text> : null}
                    </View>
                    <Text style={styles.itemMeta}>
                      {h.hora_inicio?.slice(0, 5)} – {h.hora_fin?.slice(0, 5)}
                    </Text>
                    <Pressable onPress={() => setHorForm({ ...h })} style={styles.iconBtn}>
                      <Text>✏️</Text>
                    </Pressable>
                    <Pressable onPress={() => eliminar(h.id)} style={styles.iconBtn}>
                      <Text>🗑</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })}
        </>
      ) : null}

      {horForm !== null ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setHorForm(null)}>
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <ScrollView>
                <Text style={styles.modalTitle}>{horForm?.id ? "Editar clase" : "Nueva clase"}</Text>
                <Text style={styles.label}>DÍA</Text>
                <View style={styles.chipsWrap}>
                  {DIAS.map((d) => (
                    <Pressable key={d} onPress={() => setHorForm((p) => ({ ...p, dia: d }))} style={[styles.chip, horForm.dia === d && styles.chipOn]}>
                      <Text style={[styles.chipTxt, horForm.dia === d && styles.chipTxtOn]}>{d}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.row}>
                  <View style={styles.flex1}>
                    <Text style={styles.label}>INICIO</Text>
                    <TextInput value={horForm.hora_inicio} onChangeText={(t) => setHorForm((p) => ({ ...p, hora_inicio: t }))} placeholder="08:00" placeholderTextColor="#94A3B8" style={styles.input} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.label}>FIN</Text>
                    <TextInput value={horForm.hora_fin} onChangeText={(t) => setHorForm((p) => ({ ...p, hora_fin: t }))} placeholder="09:00" placeholderTextColor="#94A3B8" style={styles.input} />
                  </View>
                </View>
                <Text style={styles.label}>MATERIA</Text>
                <TextInput value={horForm.materia} onChangeText={(t) => setHorForm((p) => ({ ...p, materia: t }))} placeholder="Ej: Matemáticas" placeholderTextColor="#94A3B8" style={styles.input} />
                <Text style={styles.label}>DOCENTE</Text>
                <View style={styles.chipsWrap}>
                  <Pressable onPress={() => setHorForm((p) => ({ ...p, docente: "" }))} style={[styles.chip, !horForm.docente && styles.chipOn]}>
                    <Text style={[styles.chipTxt, !horForm.docente && styles.chipTxtOn]}>Sin asignar</Text>
                  </Pressable>
                  {maestros.map((m) => (
                    <Pressable key={m.id} onPress={() => setHorForm((p) => ({ ...p, docente: m.nombre }))} style={[styles.chip, horForm.docente === m.nombre && styles.chipOn]}>
                      <Text style={[styles.chipTxt, horForm.docente === m.nombre && styles.chipTxtOn]}>{m.nombre}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.label}>COLOR</Text>
                <View style={styles.chipsWrap}>
                  {COLORES.map((c) => (
                    <Pressable key={c} onPress={() => setHorForm((p) => ({ ...p, color: c }))} style={[styles.colorDot, { backgroundColor: c }, horForm.color === c && styles.colorDotOn]} />
                  ))}
                </View>
                <View style={styles.modalBtns}>
                  <Pressable onPress={() => setHorForm(null)} style={styles.cancelBtn}>
                    <Text style={styles.cancelTxt}>Cancelar</Text>
                  </Pressable>
                  <Pressable onPress={guardar} disabled={saving} style={styles.saveBtn}>
                    <Text style={styles.saveTxt}>{saving ? "Guardando..." : "Guardar clase"}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

// ── UniformesAdmin ──────────────────────────────────────────────────────────────
function UniformesAdmin({ cursos }) {
  const [uniformes, setUniformes] = useState([]);
  const [links, setLinks] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ tipo: "", emoji: "👕", item: "" });
  const [saving, setSaving] = useState(false);
  const EMOJIS = ["👕", "👖", "👟", "🧥", "🎽", "🧢", "👗", "🩳"];

  const cargar = useCallback(async () => {
    const [uni, lnk] = await Promise.all([
      supabase.from("uniformes").select("*, uniforme_items(id,item)").order("tipo"),
      supabase.from("uniforme_cursos").select("uniforme_id,curso_id"),
    ]);
    setUniformes(uni.data || []);
    setLinks(lnk.data || []);
  }, []);
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
    if (modal.mode === "newU" && form.tipo.trim()) await supabase.from("uniformes").insert({ tipo: form.tipo.trim(), emoji: form.emoji || "👕" });
    else if (modal.mode === "editU") await supabase.from("uniformes").update({ tipo: form.tipo.trim(), emoji: form.emoji || "👕" }).eq("id", modal.u.id);
    else if (modal.mode === "newItem" && form.item.trim()) await supabase.from("uniforme_items").insert({ uniforme_id: modal.u.id, item: form.item.trim() });
    else if (modal.mode === "editItem" && form.item.trim()) await supabase.from("uniforme_items").update({ item: form.item.trim() }).eq("id", modal.it.id);
    setSaving(false);
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
        <Pressable onPress={() => openModal("newU")} style={styles.addBtn}>
          <Text style={styles.addTxt}>+ Categoría</Text>
        </Pressable>
      </View>
      {uniformes.length === 0 ? <Text style={styles.muted}>Sin categorías creadas aún</Text> : null}
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
                <Text>✏️</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  await supabase.from("uniformes").delete().eq("id", u.id);
                  cargar();
                }}
                style={styles.iconBtn}
              >
                <Text>🗑</Text>
              </Pressable>
            </View>
            {items.length === 0 ? <Text style={styles.uniSinItems}>Sin ítems aún.</Text> : null}
            {items.map((it) => (
              <View key={it.id} style={styles.uniItem}>
                <View style={styles.uniDot} />
                <Text style={[styles.flex1, styles.itemMeta, { color: T.text }]}>{it.item}</Text>
                <Pressable onPress={() => openModal("editItem", u, it)} style={styles.iconBtn}>
                  <Text>✏️</Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    await supabase.from("uniforme_items").delete().eq("id", it.id);
                    cargar();
                  }}
                  style={styles.iconBtn}
                >
                  <Text>🗑</Text>
                </Pressable>
              </View>
            ))}
            <Text style={[styles.label, { marginTop: 8 }]}>CURSOS QUE USAN ESTA CATEGORÍA</Text>
            <View style={styles.chipsWrap}>
              {cursos.map((c) => {
                const sel = linked.includes(c.id);
                return (
                  <Pressable key={c.id} onPress={() => toggleCurso(u.id, c.id)} style={[styles.chip, sel && { borderColor: c.color, backgroundColor: c.color + "22" }]}>
                    <Text style={[styles.chipTxt, sel && { color: c.color }]}>
                      {c.avatar} {c.nombre} {sel ? "✓" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      {modal ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setModal(null)}>
          <View style={styles.overlay}>
            <View style={[styles.modalCard, { maxHeight: undefined }]}>
              <Text style={styles.modalTitle}>{modalTitle}{modal.u ? ` — ${modal.u.tipo}` : ""}</Text>
              {modal.mode === "newU" || modal.mode === "editU" ? (
                <>
                  <Text style={styles.label}>NOMBRE</Text>
                  <TextInput value={form.tipo} onChangeText={(t) => setForm((p) => ({ ...p, tipo: t }))} placeholder="Ej: Deportivo, Formal..." placeholderTextColor="#94A3B8" style={styles.input} />
                  <Text style={styles.label}>EMOJI</Text>
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
                  <Text style={styles.label}>ÍTEM</Text>
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
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

// ── CodigosInvitacion ───────────────────────────────────────────────────────────
function CodigosInvitacion({ cursos }) {
  const [codigos, setCodigos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cursoSel, setCursoSel] = useState("");
  const [usosMax, setUsosMax] = useState("10");
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("codigos_invitacion").select("*, cursos(nombre)").order("creado_en", { ascending: false });
    setCodigos(data || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const genCodigo = (seed) => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    let n = (seed || 1) * 2654435761;
    for (let i = 0; i < 6; i++) {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      out += chars[n % chars.length];
    }
    return out;
  };
  const crear = async () => {
    if (!cursoSel) return;
    setSaving(true);
    await supabase.from("codigos_invitacion").insert({
      codigo: genCodigo(codigos.length + Number(cursoSel) + 1),
      curso_id: Number(cursoSel),
      usos_max: Number(usosMax) || 10,
      usos_actuales: 0,
      activo: true,
    });
    setSaving(false);
    cargar();
  };
  const toggleActivo = async (id, activo) => {
    await supabase.from("codigos_invitacion").update({ activo: !activo }).eq("id", id);
    cargar();
  };
  const eliminar = async (id) => {
    await supabase.from("codigos_invitacion").delete().eq("id", id);
    cargar();
  };

  return (
    <View>
      <Text style={styles.cardTitle}>🔑 Códigos de invitación</Text>
      <Text style={styles.subtitle}>Generá un código para que los apoderados se registren solos.</Text>
      <View style={styles.codNuevo}>
        <Text style={styles.label}>CURSO</Text>
        <View style={styles.chipsWrap}>
          {cursos.map((c) => (
            <Pressable key={c.id} onPress={() => setCursoSel(String(c.id))} style={[styles.chip, cursoSel === String(c.id) && { borderColor: c.color, backgroundColor: c.color + "22" }]}>
              <Text style={[styles.chipTxt, cursoSel === String(c.id) && { color: c.color }]}>
                {c.avatar} {c.nombre}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <View style={{ width: 110 }}>
            <Text style={styles.label}>USOS MÁX.</Text>
            <TextInput value={usosMax} onChangeText={setUsosMax} keyboardType="numeric" style={styles.input} />
          </View>
          <Pressable onPress={crear} disabled={!cursoSel || saving} style={[styles.saveBtn, { flex: 1, opacity: !cursoSel || saving ? 0.5 : 1 }]}>
            <Text style={styles.saveTxt}>{saving ? "Generando..." : "+ Generar"}</Text>
          </Pressable>
        </View>
      </View>

      {loading ? <Text style={styles.muted}>Cargando...</Text> : null}
      {!loading && codigos.length === 0 ? <Text style={styles.muted}>No hay códigos generados aún</Text> : null}
      {codigos.map((c) => (
        <View key={c.id} style={[styles.itemCard, !c.activo && styles.itemInactivo]}>
          <View style={styles.flex1}>
            <Text style={styles.codBig}>{c.codigo}</Text>
            <Text style={styles.itemMeta}>
              {c.cursos?.nombre || "—"} · {c.usos_actuales}/{c.usos_max} usos
              {!c.activo ? "  · Inactivo" : c.usos_actuales >= c.usos_max ? "  · Agotado" : ""}
            </Text>
          </View>
          <View style={styles.itemBtns}>
            <Pressable onPress={() => Share.share({ message: `Tu código de invitación a tribbu: ${c.codigo}` })} style={styles.iconBtn}>
              <Text>📤</Text>
            </Pressable>
            <Pressable onPress={() => toggleActivo(c.id, c.activo)} style={styles.iconBtn}>
              <Text>{c.activo ? "🚫" : "✓"}</Text>
            </Pressable>
            <Pressable onPress={() => eliminar(c.id)} style={styles.iconBtn}>
              <Text>🗑</Text>
            </Pressable>
          </View>
        </View>
      ))}
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
      setMsg(`✅ ${ok} alumnos procesados`);
      onDone();
    } catch (err) {
      setMsg(`❌ ${err.message}`);
    }
    setLoading(false);
  };
  return (
    <Pressable onPress={handle} disabled={loading} style={[styles.uploadBtn, { borderColor: "#10B981", backgroundColor: "#F0FDF4" }]}>
      <Text style={styles.uploadEmoji}>📤</Text>
      <View style={styles.flex1}>
        <Text style={[styles.uploadTitle, { color: "#10B981" }]}>{loading ? "Procesando..." : "Carga masiva desde Excel"}</Text>
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
          }
          await supabase.from("usuarios").insert({ nombre: u.nombre, apellido: u.apellido || null, email: u.email, avatar: u.avatar, dni: u.dni || null, telefono: u.telefono || null, rol: u.rol || "padre", activo: true, auth_id });
          ok++;
        }
      }
      setMsg(`✅ ${ok} apoderados procesados`);
      onDone();
    } catch (err) {
      setMsg(`❌ ${err.message}`);
    }
    setLoading(false);
  };
  return (
    <Pressable onPress={handle} disabled={loading} style={[styles.uploadBtn, { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" }]}>
      <Text style={styles.uploadEmoji}>📤</Text>
      <View style={styles.flex1}>
        <Text style={[styles.uploadTitle, { color: "#3B82F6" }]}>{loading ? "Procesando..." : "Carga masiva desde Excel"}</Text>
        <Text style={styles.uploadHint}>{msg || "Columnas: nombre, apellido, email, pass, telefono, dni, rol"}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16, paddingBottom: 40 },
  flex1: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  h1: { fontSize: 22, fontWeight: "900", color: T.text },
  subtitle: { fontSize: 13, color: "#94A3B8", marginBottom: 14 },
  muted: { fontSize: 13, color: "#94A3B8", textAlign: "center", paddingVertical: 24 },
  cardTitle: { fontSize: 15, fontWeight: "900", color: T.text, marginBottom: 6 },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 18, flexWrap: "wrap" },
  statCard: { flex: 1, minWidth: 70, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  statNum: { fontSize: 26, fontWeight: "900" },
  statLbl: { fontSize: 10, color: "#94A3B8", fontWeight: "700", marginTop: 4, textAlign: "center" },

  secTabs: { flexGrow: 0, marginBottom: 16 },
  secTab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", marginRight: 6 },
  secTabOn: { backgroundColor: T.primary, borderColor: T.primary },
  secTabTxt: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  secTabTxtOn: { color: "white" },

  dashedBtn: { borderWidth: 2, borderStyle: "dashed", borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 14 },
  dashedTxt: { fontSize: 13, fontWeight: "700" },

  itemCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 14, marginBottom: 10 },
  itemInactivo: { opacity: 0.55 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  itemNombre: { fontSize: 14, fontWeight: "700", color: T.text },
  itemMeta: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  itemBtns: { flexDirection: "row", gap: 4 },
  iconBtn: { padding: 6, minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" },

  cursoAvatar: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cursoAvatarTxt: { fontSize: 22 },

  // Modales
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "white", borderRadius: 20, padding: 20, maxHeight: "88%" },
  modalTitle: { fontSize: 17, fontWeight: "900", color: T.text, marginBottom: 4 },
  confirmNombre: { fontSize: 14, fontWeight: "700", color: T.text, marginVertical: 4 },
  label: { fontSize: 11, fontWeight: "700", color: "#94A3B8", letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
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
  togglePill: { alignSelf: "flex-start", borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14, marginTop: 4 },
  toggleTxt: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  optRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, backgroundColor: "white" },
  optRowSel: { borderColor: T.accent, backgroundColor: "#EFF6FF" },
  optTxt: { fontSize: 13, color: T.text, flex: 1 },
  hijoChip: { backgroundColor: "#EFF6FF", borderWidth: 1.5, borderColor: "#BFDBFE", borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
  hijoChipTxt: { fontSize: 12, fontWeight: "700", color: "#3B82F6" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  cancelTxt: { fontSize: 13, fontWeight: "600", color: "#94A3B8" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: 10, backgroundColor: T.accent, alignItems: "center", justifyContent: "center" },
  saveTxt: { fontSize: 14, fontWeight: "700", color: "white" },

  pagosHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  closeTxt: { fontSize: 18, color: "#94A3B8" },
  apodRow: { backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12, marginBottom: 8 },

  // Alertas
  alertaActiva: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#EF4444", borderRadius: 14, padding: 14, marginTop: 8 },
  alertaEmoji: { fontSize: 22 },
  alertaCurso: { fontSize: 10, fontWeight: "800", color: "rgba(255,255,255,0.75)", textTransform: "uppercase" },
  alertaMsg: { fontSize: 14, fontWeight: "700", color: "white", marginTop: 2 },
  alertaDismiss: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  alertaDismissTxt: { color: "white", fontSize: 12, fontWeight: "700" },
  alertaNueva: { borderWidth: 2, borderStyle: "dashed", borderColor: "#FCA5A5", backgroundColor: "#FFF1F2", borderRadius: 14, padding: 16, alignItems: "center", marginTop: 8 },
  alertaNuevaTxt: { color: "#EF4444", fontSize: 13, fontWeight: "700" },

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
  uniMini: { backgroundColor: T.accent, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  uniMiniTxt: { color: "white", fontSize: 11, fontWeight: "700" },
  uniSinItems: { fontSize: 12, color: "#94A3B8", marginBottom: 6 },
  uniItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#F8FAFC" },
  uniDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#CBD5E1" },

  // Codigos
  codNuevo: { backgroundColor: "white", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", padding: 14, marginBottom: 16 },
  codBig: { fontFamily: "monospace", fontSize: 22, fontWeight: "900", letterSpacing: 4, color: T.text },

  // Upload
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 2, borderStyle: "dashed", borderRadius: 12, padding: 14, marginBottom: 14 },
  uploadEmoji: { fontSize: 20 },
  uploadTitle: { fontSize: 13, fontWeight: "700" },
  uploadHint: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
});
