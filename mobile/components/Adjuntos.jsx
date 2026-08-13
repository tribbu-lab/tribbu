// Adjuntos (imágenes/PDF) para recordatorios y eventos — equivalente RN de
// src/components/Adjuntos.jsx de la web.
// - AdjuntosInput: control de carga para modales (botones Imagen/PDF, tope 3,
//   error visible, ✕ para quitar). Sube vía lib/media al bucket "adjuntos".
// - AdjuntosList: render de solo lectura para filas (miniaturas con lightbox
//   para imágenes; chip que abre el PDF con el visor del sistema).
// Cada adjunto es { url, tipo: "imagen"|"pdf", nombre }.

import { useState } from "react";
import { View, Text, Pressable, Image, Modal, Linking, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { sanitize, safeUrl } from "@shared/helpers";
import { THEMES, SPACE, RADIUS } from "@shared/tokens";
import { pickAndUploadImage, pickAndUploadDocument } from "../lib/media";

export const MAX_ADJUNTOS = 3;
const t = THEMES.light;

export function AdjuntosInput({ adjuntos = [], onChange, cursoId, onUploadingChange }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  const subir = async (kind) => {
    setError("");
    setSubiendo(true);
    onUploadingChange?.(true);
    try {
      const res =
        kind === "pdf"
          ? await pickAndUploadDocument({ bucket: "adjuntos", pathPrefix: `${cursoId}/` })
          : await pickAndUploadImage({ bucket: "adjuntos", pathPrefix: `${cursoId}/` });
      if (res?.url) {
        onChange([
          ...adjuntos,
          {
            url: res.url,
            tipo: kind === "pdf" ? "pdf" : "imagen",
            nombre: sanitize(res.nombre || "").slice(0, 80) || (kind === "pdf" ? "documento.pdf" : "imagen"),
          },
        ]);
      }
    } catch (e) {
      setError(e.message || "No se pudo subir el archivo");
    }
    setSubiendo(false);
    onUploadingChange?.(false);
  };

  const quitar = (i) => {
    setError("");
    onChange(adjuntos.filter((_, ix) => ix !== i));
  };

  return (
    <View>
      {adjuntos.length > 0 ? (
        <View style={styles.listWrap}>
          {adjuntos.map((a, i) => (
            <View key={i} style={[styles.item, a.tipo === "pdf" && styles.itemPdf]}>
              {a.tipo === "imagen" ? (
                <Image source={{ uri: a.url }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <>
                  <MaterialCommunityIcons name="file-pdf-box" size={18} color={t.danger} />
                  <Text style={styles.pdfName} numberOfLines={1}>{a.nombre}</Text>
                </>
              )}
              <Pressable onPress={() => quitar(i)} hitSlop={8} style={styles.remove} accessibilityLabel="Quitar adjunto">
                <MaterialCommunityIcons name="close" size={12} color={t.onAccent} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {adjuntos.length < MAX_ADJUNTOS ? (
        <View style={styles.pickRow}>
          <Pressable onPress={() => subir("imagen")} disabled={subiendo} style={styles.pickBtn}>
            <MaterialCommunityIcons name="image-outline" size={16} color={subiendo ? t.textFaint : t.textMuted} />
            <Text style={[styles.pickTxt, subiendo && { color: t.textFaint }]}>
              {subiendo ? "Subiendo..." : "Imagen"}
            </Text>
          </Pressable>
          <Pressable onPress={() => subir("pdf")} disabled={subiendo} style={styles.pickBtn}>
            <MaterialCommunityIcons name="file-pdf-box" size={16} color={subiendo ? t.textFaint : t.textMuted} />
            <Text style={[styles.pickTxt, subiendo && { color: t.textFaint }]}>
              {subiendo ? "Subiendo..." : "PDF"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.errorTxt}>{error}</Text> : null}
    </View>
  );
}

export function AdjuntosList({ adjuntos }) {
  const [preview, setPreview] = useState(null);
  const items = adjuntos || [];
  if (items.length === 0) return null;

  const abrirPdf = (a) => {
    const url = safeUrl(a.url);
    if (url) Linking.openURL(url);
  };

  return (
    <>
      <View style={styles.listWrap}>
        {items.map((a, i) =>
          a.tipo === "imagen" ? (
            <Pressable key={i} onPress={() => setPreview(a)}>
              <Image source={{ uri: a.url }} style={styles.thumbLg} resizeMode="cover" />
            </Pressable>
          ) : (
            <Pressable key={i} onPress={() => abrirPdf(a)} style={styles.pdfChip}>
              <MaterialCommunityIcons name="file-pdf-box" size={15} color={t.danger} />
              <Text style={styles.pdfChipTxt} numberOfLines={1}>{a.nombre || "Documento"}</Text>
            </Pressable>
          )
        )}
      </View>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.lightbox} onPress={() => setPreview(null)}>
          {preview ? <Image source={{ uri: preview.url }} style={styles.lightboxImg} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  listWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm, marginTop: 6 },

  // input: ítems ya subidos
  item: {
    borderWidth: 1,
    borderColor: t.borderStrong,
    borderRadius: RADIUS.md,
    backgroundColor: t.surfaceSunken,
    padding: 3,
  },
  itemPdf: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 26,
    maxWidth: 170,
  },
  thumb: { width: 52, height: 52, borderRadius: RADIUS.sm },
  pdfName: { fontSize: 11, fontWeight: "600", color: t.textMuted, flexShrink: 1 },
  remove: {
    position: "absolute",
    top: -7,
    right: -7,
    width: 20,
    height: 20,
    borderRadius: RADIUS.full,
    backgroundColor: t.danger,
    alignItems: "center",
    justifyContent: "center",
  },

  // input: botones de carga
  pickRow: { flexDirection: "row", gap: SPACE.sm, marginTop: 6 },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  pickTxt: { fontSize: 12, fontWeight: "700", color: t.textMuted },
  errorTxt: { fontSize: 11.5, fontWeight: "600", color: t.danger, marginTop: 6 },

  // list (solo lectura)
  thumbLg: { width: 56, height: 56, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong },
  pdfChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
    maxWidth: 180,
  },
  pdfChipTxt: { fontSize: 11.5, fontWeight: "700", color: t.accent, flexShrink: 1 },

  // lightbox
  lightbox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACE.xl,
  },
  lightboxImg: { width: "100%", height: "80%", borderRadius: RADIUS.lg },
});
