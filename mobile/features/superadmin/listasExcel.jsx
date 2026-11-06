// Carga de útiles o libros desde Excel en el panel de la app (espejo del modal
// de src/features/superadmin/listas.jsx; las reglas están en @shared/listasCurso).
// Va en la misma pantalla, no en un Modal: el selector de archivos del sistema se
// abre encima y en iOS los modales no se apilan bien.
import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { exportRowsToExcel } from "../../lib/media";
import { Button } from "../../components/Button";
import { aplicarLista, COLUMNAS_LISTA, existentesDeLista, filasModeloLista, hayParaCargar, leerLista, resumenLectura, textoCargado } from "@shared/listasCurso";

export function CargarExcel({ tipo, ano, cursos, cursoActual, onHecho }) {
  const [leido, setLeido] = useState(null);
  const [borrar, setBorrar] = useState(false);
  const [trabajando, setTrabajando] = useState("");
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");
  const nombreLista = tipo === "utiles" ? "útiles" : "libros";
  const ids = cursos.map((c) => c.id);

  const descargarModelo = async () => {
    setError("");
    try {
      const rows = filasModeloLista(tipo, await existentesDeLista(supabase, tipo, ids), cursos);
      await exportRowsToExcel({ rows, cols: COLUMNAS_LISTA[tipo].map((c) => ({ wch: c === "Curso" ? 16 : 26 })), nombreHoja: nombreLista, fileName: `${tipo}_${ano}` });
    } catch (e) {
      setError(`No se pudo armar el modelo: ${e.message}`);
    }
  };

  const elegir = async () => {
    setError("");
    setHecho("");
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      setTrabajando("Leyendo el archivo…");
      setLeido(null);
      setBorrar(false);
      const b64 = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: "base64" });
      const wb = XLSX.read(b64, { type: "base64" });
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      const existentes = await existentesDeLista(supabase, tipo, ids);
      setLeido({ archivo: res.assets[0].name, ...leerLista(tipo, filas, { cursos, existentes, cursoPorDefecto: cursoActual?.id || null }) });
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e.message}`);
    }
    setTrabajando("");
  };

  const cargar = async () => {
    setTrabajando("Cargando…");
    setError("");
    const e = await aplicarLista(supabase, tipo, leido, { borrarSobrantes: borrar });
    setTrabajando("");
    if (e) {
      setError(`No se pudo cargar: ${e.message}`);
      return;
    }
    setHecho(`Listo: ${textoCargado(leido, borrar)}.`);
    setLeido(null);
    onHecho?.();
  };

  const resumen = leido ? resumenLectura(leido) : "";
  const nombresCursos = leido ? leido.cursoIds.map((id) => cursos.find((c) => c.id === id)?.nombre).join(", ") : "";
  return (
    <View style={s.card}>
      <Text style={s.titulo}>Cargar {nombreLista} desde Excel · {ano}</Text>
      <Text style={s.nota}>Una fila por ítem, con estas columnas: {COLUMNAS_LISTA[tipo].join(", ")}. El curso tiene que estar escrito como en tribbu{cursoActual ? `; si lo dejás vacío, va a ${cursoActual.nombre}` : ""}. Lo que tiene el mismo nombre se actualiza y las familias no pierden sus marcas.</Text>
      <Pressable onPress={descargarModelo} style={s.modelo} accessibilityRole="button">
        <MaterialCommunityIcons name="download-outline" size={18} color="#2563EB" />
        <Text style={s.modeloTxt}>Descargar modelo</Text>
      </Pressable>
      <Button title={leido ? "Elegir otro archivo" : "Elegir archivo"} variant="secondary" onPress={elegir} disabled={!!trabajando} />
      {trabajando === "Leyendo el archivo…" ? <Text style={s.nota}>{trabajando}</Text> : null}

      {leido ? (
        <View style={s.previa}>
          <Text style={s.archivo}>{leido.archivo}</Text>
          {resumen ? <Text style={s.resumen}>{resumen}{nombresCursos ? ` en ${nombresCursos}` : ""}.</Text> : <Text style={s.error}>No encontramos nada para cargar.</Text>}
          {leido.errores.length ? (
            <View style={s.avisos}>
              <Text style={s.avisoTit}>{leido.errores.length} {leido.errores.length === 1 ? "fila no se va a cargar" : "filas no se van a cargar"}:</Text>
              {leido.errores.slice(0, 8).map((x) => <Text key={x.fila} style={s.aviso}>Fila {x.fila}: {x.motivo}</Text>)}
              {leido.errores.length > 8 ? <Text style={s.aviso}>…y {leido.errores.length - 8} más.</Text> : null}
            </View>
          ) : null}
          {leido.sobran.length ? (
            <Pressable onPress={() => setBorrar((v) => !v)} style={s.opcion} accessibilityRole="checkbox" accessibilityState={{ checked: borrar }}>
              <MaterialCommunityIcons name={borrar ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color={borrar ? "#2563EB" : "#94A3B8"} />
              <Text style={s.opcionTxt}>Borrar {leido.sobran.length === 1 ? "el ítem" : `los ${leido.sobran.length} ítems`} de esos cursos que no {leido.sobran.length === 1 ? "está" : "están"} en el archivo. Las familias que {leido.sobran.length === 1 ? "lo" : "los"} habían marcado pierden esa marca.</Text>
            </Pressable>
          ) : null}
          <View style={s.accion}>
            <Button title={trabajando === "Cargando…" ? "Cargando…" : "Cargar"} onPress={cargar} disabled={!hayParaCargar(leido, borrar) || !!trabajando} />
          </View>
        </View>
      ) : null}
      {hecho ? <Text style={s.hecho}>{hecho}</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 14, marginBottom: 14 },
  titulo: { fontSize: 14.5, fontWeight: "800", color: "#0F172A", marginBottom: 4 },
  nota: { fontSize: 12.5, color: "#64748B", lineHeight: 18, marginTop: 4 },
  modelo: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, alignSelf: "flex-start" },
  modeloTxt: { fontSize: 13, fontWeight: "700", color: "#2563EB" },
  previa: { marginTop: 12 },
  archivo: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  resumen: { fontSize: 13, color: "#334155", marginTop: 3 },
  avisos: { marginTop: 10, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", borderRadius: 10, padding: 10 },
  avisoTit: { fontSize: 13, fontWeight: "700", color: "#92400E", marginBottom: 2 },
  aviso: { fontSize: 12.5, color: "#92400E" },
  opcion: { flexDirection: "row", gap: 8, marginTop: 12, minHeight: 44 },
  opcionTxt: { flex: 1, fontSize: 13, color: "#334155", lineHeight: 18 },
  accion: { marginTop: 12 },
  hecho: { fontSize: 13, fontWeight: "700", color: "#047857", marginTop: 10 },
  error: { fontSize: 13, color: "#DC2626", marginTop: 8 },
});
