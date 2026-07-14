// Inyecta la config de entorno de la WEB (Vite) en el holder compartido.
//
// Debe importarse ANTES que cualquier módulo que cree el cliente de Supabase
// (`./supabase`), porque éste lee la config en tiempo de import. Por eso es el
// primer import de `main.jsx`. El mobile (Expo) tiene su propio equivalente.

import { setRuntimeConfig } from "./lib/runtimeConfig";

setRuntimeConfig({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});
