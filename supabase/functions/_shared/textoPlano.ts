// Texto de un comunicado sin las marcas de formato (negrita, cursiva, títulos,
// links). Copia de textoPlano() de src/lib/formato.js (specs/comunicados-con-formato.md):
// las Edge Functions no importan src/. Si cambia una, cambiar la otra.
export function textoPlano(texto: string | null | undefined): string {
  return String(texto || "")
    .replace(/\r\n?/g, "\n")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:!?)])/gm, "$1$2")
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, "$1");
}
