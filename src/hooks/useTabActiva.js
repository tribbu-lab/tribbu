// src/hooks/useTabActiva.js
//
// App.jsx deja montadas (ocultas con display:none) las pestañas ya visitadas,
// así volver a una es instantáneo en vez de recargarla desde cero. Este
// contexto le dice a cada pantalla si es la visible: useCargar (y el Muro)
// no cargan mientras están ocultas y recargan en segundo plano al volver.
// Fuera de una pestaña (modales, Super Admin, hooks de App) vale el default:
// siempre activa, comportamiento de siempre.
import { createContext, useContext } from "react";

export const TAB_ACTIVA = { activa: true };
export const TAB_OCULTA = { activa: false };
export const TabActivaContext = createContext(TAB_ACTIVA);

export const useTabActiva = () => useContext(TabActivaContext).activa;
