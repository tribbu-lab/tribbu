// Finanzas / Colectas (puerto RN de src/features/finanzas).
// colectas + colecta_pagos. Admin crea/edita/cierra/elimina y ve pagos; el
// apoderado marca pagado para sus hijos. Deep-link: openColectaId abre el detalle.

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { fmtF, dHasta } from "@shared/helpers";
import { THEMES, TYPE, SPACE, RADIUS, BLUE, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { useSession } from "../../context/Session";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { DateField } from "../../components/DateField";

const t = THEMES.light;

const fmtMonto = (n, moneda = "$") =>
  n != null ? `${moneda} ${Number(n).toLocaleString("es-AR")}` : "";

const FORM_VACIO = {
  titulo: "",
  descripcion: "",
  monto_sugerido: "",
  moneda: "$",
  responsable_id: "",
  fecha_limite: "",
};

export function Finanzas({ openColectaId = null, onClearOpen }) {
  const { cursoId, cursoIds, esVistaTodos, usuario, isAdmin, misHijos = [], tagDeCurso } = useSession();
  const userId = usuario?.id ?? null;

  const [colectas, setColectas] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [vistaAdmin, setVistaAdmin] = useState(null);

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) return;
    const { data: colData } = await supabase
      .from("colectas")
      .select("*")
      .in("curso_id", cursoIds)
      .order("vencimiento", { ascending: true })
      .order("id", { ascending: false });
    const colIds = (colData || []).map((c) => c.id);

    const [alum, pag] = await Promise.all([
      supabase.from("hijos").select("id,nombre,apellido,color,curso_id").in("curso_id", cursoIds).order("nombre"),
      colIds.length
        ? supabase.from("colecta_pagos").select("*").in("colecta_id", colIds)
        : Promise.resolve({ data: [] }),
    ]);

    const alumnosIds = (alum.data || []).map((a) => a.id);
    const uidsSet = new Set();
    if (userId) uidsSet.add(userId);
    if (alumnosIds.length) {
      const { data: uhData } = await supabase
        .from("usuario_hijos")
        .select("usuario_id")
        .in("hijo_id", alumnosIds);
      (uhData || []).forEach((r) => r.usuario_id && uidsSet.add(r.usuario_id));
    }
    const uids = [...uidsSet];
    if (uids.length) {
      const { data: usData } = await supabase
        .from("usuarios")
        .select("id,nombre,apellido,activo")
        .in("id", uids);
      setUsuarios(usData || []);
    }
    setColectas(colData || []);
    setAlumnos(alum.data || []);
    setPagos(pag.data || []);
  }, [cursoIds, userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (openColectaId && colectas.length) {
      const c = colectas.find((x) => String(x.id) === String(openColectaId));
      if (c) {
        setVistaAdmin(c);
        onClearOpen?.();
      }
    }
  }, [openColectaId, colectas, onClearOpen]);

  const guardar = async () => {
    if (!form.titulo?.trim()) return;
    setSaving(true);
    const payload = {
      titulo: form.titulo.trim(),
      tipo: "colecta",
      descripcion: form.descripcion?.trim() || null,
      monto_sugerido: form.monto_sugerido ? Number(form.monto_sugerido) : null,
      moneda: form.moneda || "$",
      responsable_id: form.responsable_id || null,
      fecha_limite: form.fecha_limite || null,
      vencimiento: form.fecha_limite || new Date().toISOString().slice(0, 10),
      // Al editar, conservar el curso de la colecta; el cursoId de sesión solo
      // aplica al crear (acción admin, nunca disponible en vista Todos)
      curso_id: modal?.id ? modal.curso_id : cursoId,
      activa: true,
    };
    if (modal?.id) {
      await supabase.from("colectas").update(payload).eq("id", modal.id);
    } else {
      const { data: nuevaColecta, error } = await supabase.from("colectas").insert(payload).select().single();
      if (error) console.error("colectas error:", JSON.stringify(error));
      if (!error) {
        // Recordatorio para los apoderados del curso — persiste hasta que cada
        // uno lo marca leído (igual que la web)
        if (nuevaColecta?.id) {
          const montoTxt = payload.monto_sugerido
            ? ` — ${payload.moneda || "$"} ${Number(payload.monto_sugerido).toLocaleString("es-AR")}`
            : "";
          const vencTxt = payload.fecha_limite ? ` · vence ${fmtF(payload.fecha_limite)}` : "";
          await supabase.from("recordatorios").insert({
            curso_id: nuevaColecta.curso_id,
            tipo: "colecta_vence",
            ref_id: nuevaColecta.id,
            texto: `Colecta "${payload.titulo}"${montoTxt}${vencTxt}. Recordá abonar.`,
            fecha: payload.fecha_limite || null,
            prioridad: "media",
            urgente: false,
            creado_por: userId,
          });
        }
        const userIds = await getUserIdsByCurso(nuevaColecta?.curso_id ?? cursoId);
        await sendPush({ type: "colecta", payload: { descripcion: form.titulo, userIds } });
      }
    }
    setSaving(false);
    setModal(null);
    cargar();
  };

  const toggleActiva = async (c) => {
    await supabase.from("colectas").update({ activa: !c.activa }).eq("id", c.id);
    cargar();
  };

  const eliminar = async (id) => {
    await supabase.from("colecta_pagos").delete().eq("colecta_id", id);
    // Borrar los "leídos" de los recordatorios de esta colecta antes de borrar
    // los recordatorios (igual que la web)
    const { data: recsCol } = await supabase.from("recordatorios").select("id").eq("ref_id", id).eq("tipo", "colecta_vence");
    const recIds = (recsCol || []).map((r) => r.id);
    if (recIds.length) await supabase.from("recordatorio_leidos").delete().in("recordatorio_id", recIds);
    await supabase.from("recordatorios").delete().eq("ref_id", id).eq("tipo", "colecta_vence");
    await supabase.from("colectas").delete().eq("id", id);
    cargar();
  };

  const getPago = (colectaId, alumnoId) =>
    pagos.find((p) => p.colecta_id === colectaId && p.alumno_id === alumnoId);

  const togglePago = async (colectaId, alumnoId, estadoActual) => {
    const nuevo = estadoActual === "pagado" ? "pendiente" : "pagado";
    const fecha_pago = nuevo === "pagado" ? new Date().toISOString().slice(0, 10) : null;
    setPagos((prev) => {
      const idx = prev.findIndex((p) => p.colecta_id === colectaId && p.alumno_id === alumnoId);
      if (idx >= 0) {
        const u = [...prev];
        u[idx] = { ...u[idx], estado: nuevo, fecha_pago };
        return u;
      }
      return [...prev, { colecta_id: colectaId, alumno_id: alumnoId, estado: nuevo, fecha_pago, pagado_por: userId }];
    });
    const { data: existe } = await supabase
      .from("colecta_pagos")
      .select("id")
      .eq("colecta_id", colectaId)
      .eq("alumno_id", alumnoId)
      .maybeSingle();
    if (existe?.id) {
      await supabase
        .from("colecta_pagos")
        .update({ estado: nuevo, fecha_pago, pagado_por: userId })
        .eq("id", existe.id);
    } else {
      await supabase
        .from("colecta_pagos")
        .insert({ colecta_id: colectaId, alumno_id: alumnoId, estado: nuevo, fecha_pago, pagado_por: userId });
    }
  };

  // Banner de deuda propia (Parte 4 del handoff): hoy hay que abrir cada
  // colecta para saber cuánto falta aportar — se resume arriba de todo.
  const deudaPropia = colectas
    .filter((c) => c.activa && c.monto_sugerido)
    .flatMap((c) => {
      const alumnosCurso = alumnos.filter((a) => a.curso_id === c.curso_id && misHijos.includes(a.id));
      return alumnosCurso
        .filter((a) => getPago(c.id, a.id)?.estado !== "pagado")
        .map((a) => ({ colecta: c, dias: c.fecha_limite ? dHasta(c.fecha_limite) : null }));
    });
  const deudaTotal = deudaPropia.reduce((sum, d) => sum + (d.colecta.monto_sugerido || 0), 0);
  const deudaProxima = deudaPropia.reduce((min, d) => (d.dias != null && (min == null || d.dias < min) ? d.dias : min), null);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Colectas</Text>
      <Text style={styles.subtitle}>{esVistaTodos ? "Regalos y gastos compartidos de tus cursos." : "Regalos y gastos compartidos del curso."}</Text>

      {!isAdmin && deudaPropia.length > 0 ? (
        <View style={styles.deudaBanner}>
          <Text style={styles.deudaTitulo}>Te falta aportar {fmtMonto(deudaTotal, deudaPropia[0]?.colecta.moneda || "$")}</Text>
          <Text style={styles.deudaSub}>
            {deudaPropia.length} colecta{deudaPropia.length !== 1 ? "s" : ""} pendiente{deudaPropia.length !== 1 ? "s" : ""}
            {deudaProxima != null ? ` · el cierre más próximo es ${deudaProxima === 0 ? "hoy" : deudaProxima < 0 ? "ya venció" : `en ${deudaProxima} días`}` : ""}
          </Text>
        </View>
      ) : null}

      {isAdmin ? (
        <Pressable
          onPress={() => {
            setForm(FORM_VACIO);
            setModal({});
          }}
          style={styles.nuevaBtn}
        >
          <Text style={styles.nuevaTxt}>+ Nueva colecta</Text>
        </Pressable>
      ) : null}

      {colectas.length === 0 ? (
        <Text style={styles.empty}>No hay colectas activas</Text>
      ) : null}

      {colectas.map((c) => {
        // En vista Todos `alumnos` trae hijos de varios cursos: todo lo de esta
        // colecta se calcula solo con los alumnos de SU curso (no-op por hijo)
        const alumnosCurso = alumnos.filter((a) => a.curso_id === c.curso_id);
        const pagados = alumnosCurso.filter((a) => getPago(c.id, a.id)?.estado === "pagado");
        const total = alumnosCurso.length;
        const recaudado = pagados.length * (c.monto_sugerido || 0);
        const esperado = total * (c.monto_sugerido || 0);
        const pct = total ? Math.round((pagados.length / total) * 100) : 0;
        const resp = usuarios.find((u) => u.id === c.responsable_id);
        const dias = c.fecha_limite ? dHasta(c.fecha_limite) : null;
        const vencida = dias !== null && dias < 0;
        const tag = tagDeCurso?.(c.curso_id) ?? null;
        const misAlumnosCurso = alumnosCurso.filter((a) => misHijos.includes(a.id));

        // Caso común (mockup): un solo hijo mío en el curso de esta colecta →
        // un único botón "Registrar mi aporte". Con más de uno (hermanos en
        // el mismo curso) se cae al detalle por alumno para no perder info.
        const unSoloHijo = misAlumnosCurso.length === 1 ? misAlumnosCurso[0] : null;
        const pagoUnico = unSoloHijo ? getPago(c.id, unSoloHijo.id) : null;
        const pagadoUnico = pagoUnico?.estado === "pagado";
        const esResponsableUnico = unSoloHijo && userId === c.responsable_id;

        return (
          <Card key={c.id} style={[styles.colectaCard, !c.activa && styles.cerrada]}>
            <View style={styles.colectaHeader}>
              <View style={styles.colectaIconBox}>
                <Text style={styles.colectaIcon}>🎁</Text>
              </View>
              <View style={styles.flex1}>
                <View style={styles.titleRow}>
                  <Text style={styles.colectaTitulo}>{c.titulo}</Text>
                  {!c.activa ? <Pill label="Cerrada" color={t.textMuted} bg={SLATE[100]} />
                    : vencida ? <Pill label="Vencida" color={t.danger} bg={t.dangerSoft} />
                    : (dias !== null && dias <= 7) ? <Pill label={`Cierra en ${dias}d`} color="#B45309" bg={t.warningSoft} />
                    : <Pill label="Abierta" color={t.success} bg={t.successSoft} />}
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  {[tag?.nombre, resp ? `organiza ${resp.nombre}` : null].filter(Boolean).join(" · ")}
                </Text>
                {c.descripcion ? <Text style={styles.colectaDesc}>{c.descripcion}</Text> : null}
                {c.fecha_limite ? <Text style={styles.meta}>Límite: {fmtF(c.fecha_limite)}</Text> : null}
              </View>
            </View>

            {c.monto_sugerido ? (
              <View style={styles.progressWrap}>
                <View style={styles.progressTop}>
                  <Text style={styles.progressMontoGrande}>{fmtMonto(recaudado, c.moneda || "$")}</Text>
                  <Text style={styles.progressMontoChico}>de {fmtMonto(esperado, c.moneda || "$")}</Text>
                </View>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${pct}%` }]} />
                </View>
                <Text style={styles.progressSub}>
                  {pagados.length} de {total} familias ya aportaron
                </Text>
              </View>
            ) : null}

            {!isAdmin && unSoloHijo ? (
              <View style={styles.aporteUnicoWrap}>
                {esResponsableUnico ? (
                  <Pressable
                    onPress={() => c.activa && togglePago(c.id, unSoloHijo.id, pagoUnico?.estado)}
                    style={[styles.aporteBtn, pagadoUnico && styles.aporteBtnOn]}
                  >
                    <Text style={[styles.aporteTxt, pagadoUnico && styles.aporteTxtOn]}>
                      {pagadoUnico ? "✓ Aportado · Deshacer" : `Registrar mi aporte${c.monto_sugerido ? ` · ${fmtMonto(c.monto_sugerido, c.moneda || "$")}` : ""}`}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={[styles.estadoChip, pagadoUnico && styles.estadoChipOn]}>
                    <Text style={[styles.estadoTxt, pagadoUnico && styles.estadoTxtOn]}>
                      {pagadoUnico ? "✓ Aportado" : "Pendiente tu aporte"}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            {!isAdmin && misAlumnosCurso.length > 1 ? (
              <View style={styles.misAlumnos}>
                {misAlumnosCurso.map((a) => {
                  const pago = getPago(c.id, a.id);
                  const pagado = pago?.estado === "pagado";
                  const esResponsable = userId === c.responsable_id;
                  return (
                    <View key={a.id} style={styles.alumnoPagoRow}>
                      <View style={styles.flex1}>
                        <Text style={styles.alumnoNombre}>
                          {a.nombre} {a.apellido}
                        </Text>
                        {pagado && pago.fecha_pago ? (
                          <Text style={styles.meta}>Pagado el {fmtF(pago.fecha_pago)}</Text>
                        ) : null}
                      </View>
                      {esResponsable ? (
                        <Pressable
                          onPress={() => c.activa && togglePago(c.id, a.id, pago?.estado)}
                          style={[styles.pagoBtn, pagado && styles.pagoBtnOn]}
                        >
                          <Text style={[styles.pagoTxt, pagado && styles.pagoTxtOn]}>
                            {pagado ? "✓ Pagado" : "Marcar pagado"}
                          </Text>
                        </Pressable>
                      ) : (
                        <View style={[styles.estadoChip, pagado && styles.estadoChipOn]}>
                          <Text style={[styles.estadoTxt, pagado && styles.estadoTxtOn]}>
                            {pagado ? "✓ Pagado" : "Pendiente"}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.colectaActions}>
              <Pressable onPress={() => setVistaAdmin(c)} style={styles.verPagosBtn}>
                <Text style={styles.verPagosTxt}>Ver quién puso</Text>
              </Pressable>
              {isAdmin ? (
                <>
                  <Pressable
                    onPress={() => {
                      setForm({
                        titulo: c.titulo || "",
                        descripcion: c.descripcion || "",
                        monto_sugerido: c.monto_sugerido ? String(c.monto_sugerido) : "",
                        moneda: c.moneda || "$",
                        responsable_id: c.responsable_id || "",
                        fecha_limite: c.fecha_limite || "",
                      });
                      setModal(c);
                    }}
                    style={styles.iconBtn}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={16} color={t.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => toggleActiva(c)} style={styles.iconBtn}>
                    <Text style={[styles.iconTxt, { color: c.activa ? "#B45309" : t.success }]}>
                      {c.activa ? "Cerrar" : "Reabrir"}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => eliminar(c.id)} style={styles.iconBtn}>
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color={t.danger} />
                  </Pressable>
                </>
              ) : null}
            </View>
          </Card>
        );
      })}

      {colectas.length > 0 ? (
        <Text style={styles.notaEncuadre}>💡 tribbu no mueve plata: los datos para aportar (alias, cuenta, etc.) los define quien organiza la colecta. Acá solo se registra quién ya aportó.</Text>
      ) : null}

      <ColectaFormModal
        visible={modal !== null}
        form={form}
        setForm={setForm}
        usuarios={usuarios}
        saving={saving}
        editing={!!modal?.id}
        onClose={() => setModal(null)}
        onGuardar={guardar}
      />

      <PagosModal
        colecta={vistaAdmin}
        alumnos={vistaAdmin ? alumnos.filter((a) => a.curso_id === vistaAdmin.curso_id) : []}
        getPago={getPago}
        canToggle={(c) => isAdmin || userId === c?.responsable_id}
        onToggle={togglePago}
        onClose={() => setVistaAdmin(null)}
      />
    </ScrollView>
  );
}

function ColectaFormModal({ visible, form, setForm, usuarios, saving, editing, onClose, onGuardar }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{editing ? "Editar colecta" : "Nueva colecta"}</Text>

            <Text style={styles.label}>TÍTULO</Text>
            <TextInput
              value={form.titulo}
              onChangeText={(t) => setForm((p) => ({ ...p, titulo: t }))}
              placeholder="Ej: Regalo día del maestro"
              placeholderTextColor={t.placeholder}
              style={styles.input}
            />

            <Text style={styles.label}>DESCRIPCIÓN</Text>
            <TextInput
              value={form.descripcion}
              onChangeText={(t) => setForm((p) => ({ ...p, descripcion: t }))}
              placeholder="Detalles opcionales"
              placeholderTextColor={t.placeholder}
              style={styles.input}
            />

            <Text style={styles.label}>MONTO SUGERIDO</Text>
            <View style={styles.montoRow}>
              {["$", "USD"].map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setForm((p) => ({ ...p, moneda: m }))}
                  style={[styles.monedaBtn, (form.moneda || "$") === m && styles.monedaOn]}
                >
                  <Text style={[styles.monedaTxt, (form.moneda || "$") === m && styles.monedaTxtOn]}>{m}</Text>
                </Pressable>
              ))}
              <TextInput
                value={form.monto_sugerido}
                onChangeText={(t) => setForm((p) => ({ ...p, monto_sugerido: t.replace(/[^0-9]/g, "") }))}
                placeholder="Ej: 2000"
                placeholderTextColor={t.placeholder}
                keyboardType="number-pad"
                style={[styles.input, styles.flex1, { marginBottom: 0 }]}
              />
            </View>

            <Text style={styles.label}>FECHA LÍMITE</Text>
            <DateField
              value={form.fecha_limite}
              onChange={(v) => setForm((p) => ({ ...p, fecha_limite: v }))}
              style={styles.input}
            />

            <Text style={styles.label}>RESPONSABLE</Text>
            <View style={styles.respList}>
              <Pressable
                onPress={() => setForm((p) => ({ ...p, responsable_id: "" }))}
                style={[styles.respRow, !form.responsable_id && styles.respOn]}
              >
                <Text style={styles.respTxt}>— Sin asignar —</Text>
              </Pressable>
              {usuarios.map((u) => (
                <Pressable
                  key={u.id}
                  onPress={() => setForm((p) => ({ ...p, responsable_id: u.id }))}
                  style={[styles.respRow, form.responsable_id === u.id && styles.respOn]}
                >
                  <Text style={styles.respTxt}>
                    {u.nombre}
                    {u.apellido ? ` ${u.apellido}` : ""}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={onGuardar} disabled={saving} style={styles.saveBtn}>
                <Text style={styles.saveTxt}>{saving ? "Guardando..." : "Guardar"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PagosModal({ colecta, alumnos, getPago, canToggle, onToggle, onClose }) {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  if (!colecta) return null;
  const toggleable = canToggle(colecta);
  const faltantes = alumnos.filter((a) => getPago(colecta.id, a.id)?.estado !== "pagado");

  const recordar = async () => {
    if (!faltantes.length) return;
    setEnviando(true);
    setEnviado(false);
    const { data: uh } = await supabase
      .from("usuario_hijos")
      .select("usuario_id")
      .in("hijo_id", faltantes.map((a) => a.id));
    const userIds = [...new Set((uh || []).map((r) => r.usuario_id))];
    if (userIds.length) {
      // "colecta" en el switch del Edge Function siempre dice "Nueva
      // colecta" — un type fuera del switch cae al default (título
      // genérico "tribbu" + el mensaje), que es lo que corresponde acá sin
      // tener que tocar/redesplegar la función por un recordatorio.
      await sendPush({ type: "recordatorio_pago", payload: { mensaje: `Recordatorio: te falta aportar a "${colecta.titulo}"`, userIds } });
    }
    setEnviando(false);
    setEnviado(true);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.pagosHeader}>
            <Text style={styles.modalTitle}>{colecta.titulo}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialCommunityIcons name="close" size={18} color={t.textFaint} />
            </Pressable>
          </View>
          <ScrollView>
            {alumnos.map((a) => {
              const pago = getPago(colecta.id, a.id);
              const pagado = pago?.estado === "pagado";
              return (
                <View key={a.id} style={styles.pagoAlumnoRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.alumnoNombre}>
                      {a.nombre} {a.apellido}
                    </Text>
                    {pagado && pago.fecha_pago ? (
                      <Text style={styles.meta}>Pagado el {fmtF(pago.fecha_pago)}</Text>
                    ) : null}
                  </View>
                  {toggleable ? (
                    <Pressable
                      onPress={() => onToggle(colecta.id, a.id, pago?.estado)}
                      style={[styles.pagoBtn, pagado && styles.pagoBtnOn]}
                    >
                      <Text style={[styles.pagoTxt, pagado && styles.pagoTxtOn]}>
                        {pagado ? "✓ Pagado" : "Marcar pagado"}
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={[styles.estadoChip, pagado && styles.estadoChipOn]}>
                      <Text style={[styles.estadoTxt, pagado && styles.estadoTxtOn]}>
                        {pagado ? "✓ Pagado" : "Pendiente"}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
            {alumnos.length === 0 ? <Text style={styles.empty}>Sin alumnos en el curso</Text> : null}
          </ScrollView>

          {toggleable && alumnos.length > 0 ? (
            <View style={styles.pagosFooter}>
              <Text style={styles.pagosFooterTxt}>
                {faltantes.length === 0 ? "Todos aportaron ✓" : `Faltan ${faltantes.length} de ${alumnos.length}`}
              </Text>
              {faltantes.length > 0 ? (
                <Pressable onPress={recordar} disabled={enviando} style={styles.recordarBtn}>
                  <Text style={styles.recordarTxt}>{enviando ? "Enviando..." : enviado ? "✓ Enviado" : "Recordar a los que faltan"}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  flex1: { flex: 1 },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: t.textMuted, marginBottom: SPACE.lg },
  empty: { textAlign: "center", paddingVertical: 40, color: t.textFaint, fontSize: 13 },
  nuevaBtn: { alignSelf: "flex-start", backgroundColor: t.accent, borderRadius: RADIUS.lg, paddingVertical: 10, paddingHorizontal: 18, marginBottom: SPACE.lg, minHeight: 44, justifyContent: "center" },
  nuevaTxt: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  deudaBanner: { backgroundColor: t.warningSoft, borderWidth: 1.5, borderColor: "#FDE68A", borderRadius: RADIUS.xl, padding: 14, marginBottom: SPACE.lg },
  deudaTitulo: { fontSize: 14.5, fontWeight: "800", color: "#B45309" },
  deudaSub: { fontSize: 12, color: "#92400E", marginTop: 3 },
  notaEncuadre: { fontSize: 11.5, color: t.textFaint, lineHeight: 16, textAlign: "center", marginTop: 4, marginBottom: 8 },
  colectaCard: { padding: 0, marginBottom: 14, overflow: "hidden", borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.borderStrong, shadowOpacity: 0, elevation: 0 },
  cerrada: { opacity: 0.6 },
  colectaHeader: { padding: 14, borderBottomWidth: 1, borderBottomColor: t.border, flexDirection: "row", gap: 12 },
  colectaIconBox: { width: 38, height: 38, borderRadius: RADIUS.md, backgroundColor: t.warningSoft, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  colectaIcon: { fontSize: 17 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3 },
  tagDot: { width: 8, height: 8, borderRadius: RADIUS.full },
  tagTxt: { fontSize: 11, fontWeight: "700", color: t.textMuted, flexShrink: 1 },
  colectaTitulo: { fontSize: 14.5, fontWeight: "700", color: t.textStrong },
  colectaDesc: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 4, flexWrap: "wrap" },
  meta: { fontSize: 12, color: t.textMuted },
  progressWrap: { padding: 14, borderBottomWidth: 1, borderBottomColor: t.border },
  progressTop: { flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 6 },
  progressMontoGrande: { fontSize: 19, fontWeight: "900", color: t.textStrong, fontVariant: ["tabular-nums"] },
  progressMontoChico: { fontSize: 12.5, fontWeight: "600", color: t.textFaint, fontVariant: ["tabular-nums"] },
  bar: { height: 6, borderRadius: RADIUS.full, backgroundColor: SLATE[200], overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: t.success, borderRadius: RADIUS.full },
  progressSub: { fontSize: 11, color: t.textFaint, marginTop: 4 },
  aporteUnicoWrap: { padding: 14 },
  aporteBtn: { minHeight: 44, borderRadius: RADIUS.lg, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  aporteBtnOn: { backgroundColor: t.successSoft, borderWidth: 1.5, borderColor: t.success },
  aporteTxt: { fontSize: 13.5, fontWeight: "800", color: "#FFFFFF" },
  aporteTxtOn: { color: t.success },
  misAlumnos: { padding: 14 },
  alumnoPagoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  alumnoNombre: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  pagoBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: t.borderStrong, backgroundColor: t.surface },
  pagoBtnOn: { backgroundColor: t.success, borderColor: t.success },
  pagoTxt: { fontSize: 12, fontWeight: "700", color: t.textMuted },
  pagoTxtOn: { color: "#FFFFFF" },
  estadoChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS.full, backgroundColor: t.warningSoft },
  estadoChipOn: { backgroundColor: t.successSoft },
  estadoTxt: { fontSize: 12, fontWeight: "700", color: "#B45309" },
  estadoTxtOn: { color: t.success },
  colectaActions: { flexDirection: "row", gap: 6, padding: 12, flexWrap: "wrap", alignItems: "center" },
  verPagosBtn: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.lg, paddingVertical: 8, paddingHorizontal: 12, minHeight: 44, justifyContent: "center" },
  verPagosTxt: { fontSize: 12, fontWeight: "700", color: BLUE[600] },
  iconBtn: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.lg, paddingVertical: 8, paddingHorizontal: 10, minHeight: 44, alignItems: "center", justifyContent: "center" },
  iconTxt: { fontSize: 12, fontWeight: "700", color: t.textMuted },
  // Modal
  overlay: { flex: 1, backgroundColor: t.overlay, alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 440, maxHeight: "88%", backgroundColor: t.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.borderStrong, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: t.textStrong, letterSpacing: -0.2, marginBottom: 12 },
  label: { ...TYPE.label, color: t.textFaint, marginBottom: 6, marginTop: SPACE.sm },
  input: { minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: t.borderStrong, backgroundColor: t.surfaceSunken, paddingHorizontal: 12, fontSize: 14, color: t.text, marginBottom: 4 },
  montoRow: { flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 4 },
  monedaBtn: { borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: t.surface, minHeight: 44, justifyContent: "center" },
  monedaOn: { borderColor: SLATE[900], backgroundColor: SLATE[900] },
  monedaTxt: { fontSize: 12, fontWeight: "600", color: t.textMuted },
  monedaTxtOn: { color: "#FFFFFF", fontWeight: "700" },
  respList: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.md, overflow: "hidden", maxHeight: 180 },
  respRow: { minHeight: 44, justifyContent: "center", paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  respOn: { backgroundColor: t.accentSoft },
  respTxt: { fontSize: 14, color: t.text },
  modalBtns: { flexDirection: "row", gap: 8, marginTop: 16 },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center" },
  cancelTxt: { color: t.textMuted, fontSize: 14, fontWeight: "700" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: RADIUS.lg, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
  saveTxt: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  pagosHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  pagoAlumnoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: t.border },
  pagosFooter: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.border, gap: 10 },
  pagosFooterTxt: { fontSize: 12.5, fontWeight: "700", color: t.textMuted, textAlign: "center" },
  recordarBtn: { minHeight: 44, borderRadius: RADIUS.md, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" },
  recordarTxt: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
});
