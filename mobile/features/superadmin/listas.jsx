// Útiles y libros en el panel del colegio (espejo de
// src/features/superadmin/listas.jsx): elegís ciclo lectivo y curso, y se edita
// con las mismas pantallas que ven las familias (features/info, modo `gestion`).
import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { CursoListSelector } from "../../components/CursoListSelector";
import { PestanasPanel } from "../../components/SubTabs";
import { Sheet } from "../../components/Sheet";
import { Button } from "../../components/Button";
import { Libros, Utiles } from "../info";
import { CargarExcel } from "./listasExcel";
import { aniosDeCursos, copiarLista, destinosDeCopia } from "@shared/listasCurso";

const PESTANAS = [{ id: "utiles", label: "Útiles" }, { id: "libros", label: "Libros" }];
const ORDEN_NOMBRE = (a, b) => String(a.nombre).localeCompare(String(b.nombre), "es");

export function ListasAdmin({ cursos, anoActual }) {
  const anios = aniosDeCursos(cursos);
  const [anoElegido, setAnoElegido] = useState(null);
  const ano = anoElegido ?? (anios.includes(anoActual) ? anoActual : anios[0]);
  const delAno = cursos.filter((c) => c.año_lectivo === ano).sort(ORDEN_NOMBRE);
  const [cursoId, setCursoId] = useState(null);
  const curso = delAno.find((c) => c.id === cursoId) || null;
  const [tipo, setTipo] = useState("utiles");
  const [copiar, setCopiar] = useState(false);
  const [excel, setExcel] = useState(false);
  const [version, setVersion] = useState(0); // recarga la lista después de subir un Excel
  const cursoIds = useMemo(() => (cursoId ? [cursoId] : []), [cursoId]);

  const Lista = tipo === "utiles" ? Utiles : Libros;
  return (
    <View>
      <Text style={s.label}>CICLO LECTIVO</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.anios}>
        {anios.map((a) => (
          <Pressable
            key={a}
            onPress={() => { setAnoElegido(a); setCursoId(null); }}
            style={[s.anio, a === ano && s.anioOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: a === ano }}
          >
            <Text style={[s.anioTxt, a === ano && s.anioTxtOn]}>{a}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={s.label}>CURSO</Text>
      <CursoListSelector cursos={delAno} seleccionados={cursoId ? [cursoId] : []} onToggle={setCursoId} multi={false} maxHeight={180} />

      <View style={s.tipoExcel}>
        <PestanasPanel items={PESTANAS} activo={tipo} onIr={setTipo} />
        <Pressable onPress={() => setExcel((v) => !v)} style={s.copiar} accessibilityRole="button">
          <Text style={s.copiarTxt}>{excel ? "Cerrar la carga desde Excel" : "Cargar desde Excel"}</Text>
        </Pressable>
      </View>
      {excel ? (
        <CargarExcel key={`${tipo}-${ano}`} tipo={tipo} ano={ano} cursos={delAno} cursoActual={curso} onHecho={() => setVersion((n) => n + 1)} />
      ) : null}

      {!curso ? (
        <Text style={s.vacio}>Elegí un curso para ver y editar sus listas, o cargá muchos cursos de una vez desde Excel.</Text>
      ) : (
        <View style={s.lista}>
          <Pressable onPress={() => setCopiar(true)} style={s.copiar} accessibilityRole="button">
            <Text style={s.copiarTxt}>Copiar a otros cursos</Text>
          </Pressable>
          <Lista key={`${tipo}-${curso.id}-${version}`} gestion cursoId={curso.id} cursoIds={cursoIds} />
        </View>
      )}

      {curso ? <CopiarSheet visible={copiar} tipo={tipo} curso={curso} cursos={cursos} onClose={() => setCopiar(false)} /> : null}
    </View>
  );
}

function CopiarSheet({ visible, tipo, curso, cursos, onClose }) {
  const [sel, setSel] = useState([]);
  const [copiando, setCopiando] = useState(false);
  const toggle = (id) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const cerrar = () => { setSel([]); onClose(); };

  const copiar = async () => {
    if (!sel.length || copiando) return;
    setCopiando(true);
    const { agregados, error } = await copiarLista(supabase, tipo, curso.id, sel);
    setCopiando(false);
    if (error) { Alert.alert("No se pudo copiar la lista", error.message); return; }
    cerrar();
    Alert.alert("Listo", agregados ? `${agregados} ${agregados === 1 ? "ítem copiado" : "ítems copiados"}.` : "Esos cursos ya tenían todo lo de esta lista.");
  };

  return (
    <Sheet visible={visible} onClose={cerrar} title={`Copiar los ${tipo === "utiles" ? "útiles" : "libros"} de ${curso.nombre}`}>
      <Text style={s.nota}>Se suman a los cursos que elijas, incluso los del año que viene. Lo que un curso ya tiene no se repite.</Text>
      <CursoListSelector cursos={destinosDeCopia(cursos, curso)} seleccionados={sel} onToggle={toggle} maxHeight={260} />
      <View style={s.accion}>
        <Button title={copiando ? "Copiando…" : "Copiar"} onPress={copiar} disabled={!sel.length || copiando} />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: "#94A3B8", marginBottom: 6, marginTop: 4 },
  anios: { gap: 7, paddingBottom: 12 },
  anio: { minHeight: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", justifyContent: "center" },
  anioOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  anioTxt: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  anioTxtOn: { color: "#FFFFFF", fontWeight: "700" },
  vacio: { textAlign: "center", paddingVertical: 32, color: "#94A3B8", fontSize: 13 },
  tipoExcel: { marginTop: 16 },
  lista: { marginTop: 4 },
  copiar: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", marginBottom: 6 },
  copiarTxt: { fontSize: 13, fontWeight: "700", color: "#2563EB" },
  nota: { fontSize: 13, color: "#64748B", lineHeight: 18, marginBottom: 12 },
  accion: { marginTop: 14 },
});
