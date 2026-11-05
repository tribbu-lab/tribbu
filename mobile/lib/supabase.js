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
import { fetchQueAnotaCambios } from "./cambios";

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
  // Anota cada escritura (ver lib/cambios.js): useRecarga no saltea la
  // recarga de una pantalla si hubo cambios desde que se cargó.
  global: { fetch: fetchQueAnotaCambios },
});

// Cliente que no guarda nada ni toca la sesión abierta: valida otra cuenta antes
// de pasarse a ella. En el cliente principal, un setSession con un refresh token
// inválido borra la sesión actual y saca al usuario al login.
export const crearClienteTemporal = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "tribbu-cuenta-temporal" },
  });

// Refrescar el token solo cuando la app está en foreground.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
