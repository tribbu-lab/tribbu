// Inyecta la config de entorno del MOBILE (Expo) en los módulos compartidos.
//
// Equivalente a src/bootConfig.js de la web, pero leyendo EXPO_PUBLIC_* en vez
// de import.meta.env. Debe evaluarse ANTES de crear el cliente de Supabase, por
// eso lib/supabase.js lo importa primero (efecto de import).

import { setRuntimeConfig } from "@shared/runtimeConfig";
import { setStorageBackend } from "@shared/storage";
import { asyncStorageColorBackend } from "./hijoColors";

setRuntimeConfig({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

// getHijoColor/setHijoColor (en @shared/helpers) usan este backend síncrono.
setStorageBackend(asyncStorageColorBackend);
