// Claves del proyecto para las Edge Functions.
//
// Supabase inyecta las claves nuevas como JSON ({"default":"sb_secret_…"}) en
// SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS. Las legacy
// (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY, JWT firmados con el secreto
// viejo) dejan de servir cuando se revoca el Legacy JWT secret, así que se usan
// solo si las nuevas no están.
function primeraClave(json: string | undefined): string | undefined {
  if (!json) return undefined;
  try {
    const o = JSON.parse(json) as Record<string, string>;
    return o.default ?? Object.values(o)[0];
  } catch {
    return undefined;
  }
}

/** Clave de servicio (salta RLS): solo del lado del servidor. */
export const CLAVE_SERVICIO =
  primeraClave(Deno.env.get("SUPABASE_SECRET_KEYS")) ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Clave pública, para crear un cliente con el JWT del usuario que llama. */
export const CLAVE_PUBLICA =
  primeraClave(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")) ?? Deno.env.get("SUPABASE_ANON_KEY")!;
