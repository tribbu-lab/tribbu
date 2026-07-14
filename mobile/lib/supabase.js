// Cliente Supabase para React Native.
// - storage: AsyncStorage (la sesión sobrevive al reinicio de la app)
// - autoRefreshToken según AppState (foreground/background)
// - detectSessionInUrl:false (no hay URL en nativo)

import "react-native-url-polyfill/auto";
import "./config"; // efecto: inyecta env en @shared antes de crear el cliente

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { getRuntimeConfig } from "@shared/runtimeConfig";

const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Configurá mobile/.env"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refrescar el token solo cuando la app está en foreground.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
