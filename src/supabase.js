import { createClient } from '@supabase/supabase-js';
import { getRuntimeConfig } from './lib/runtimeConfig';

const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();

if(!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno de Supabase (URL / anon key). Llamá a setRuntimeConfig(...) antes de importar este módulo.');
}

// Cliente que no guarda nada ni toca la sesión abierta: valida otra cuenta antes
// de pasarse a ella (specs/perfil-multicuenta.md).
export const crearClienteTemporal = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "tribbu-cuenta-temporal" },
  });

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Procesa el `#access_token=…&type=recovery` del link del mail de reseteo
    // y dispara el evento PASSWORD_RECOVERY (lo escucha App.jsx).
    detectSessionInUrl: true,
    // Fijado a propósito: es el default hoy, pero un bump de
    // @supabase/supabase-js a PKCE cambiaría el link a `?code=` +
    // exchangeCodeForSession y rompería el hash del mail sin aviso.
    flowType: "implicit",
  },
});
