// Contexto de sesión — equivalente RN del bootstrap + modelo "Mi acceso" que
// vive en src/App.jsx de la web.
//
// Carga la sesión de Supabase (persistida en AsyncStorage), arma el `usuario`,
// deriva `items` = hijos del usuario + cursos donde es Room Parent, y expone el
// `cursoIdx` activo con su `rolEfectivo` ("padre" | "admin"). El Super Admin
// (usuario.rol === "super") se maneja como flujo aparte en la navegación.

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { getHijoColor, setHijoColor } from "@shared/helpers";
import { HIJO_COLOR_DEFAULT } from "@shared/theme";
import { registerForPush, savePushToken } from "../push/register";

const SessionContext = createContext(null);

const shapeUsuario = (data) => ({
  ...data,
  hijos: [...new Set((data.usuario_hijos || []).map((r) => r.hijo_id))],
  cursos: (data.usuario_cursos || []).map((r) => r.curso_id),
  cursosConRol: (data.usuario_cursos || []).map((r) => ({
    curso_id: r.curso_id,
    rol: r.rol || "padre",
  })),
});

export function SessionProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [cursoIdx, setCursoIdx] = useState(0);
  const [hijoColorsVer, setHijoColorsVer] = useState(0); // fuerza recálculo al cambiar color

  const cargarUsuario = useCallback(async (authUser) => {
    const { data } = await supabase
      .from("usuarios")
      .select("*, usuario_hijos(hijo_id), usuario_cursos(curso_id, rol)")
      .eq("auth_id", authUser.id)
      .eq("activo", true)
      .single();
    if (data) setUsuario(shapeUsuario(data));
    else setUsuario(null);
  }, []);

  // Bootstrap + suscripción a cambios de auth.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) await cargarUsuario(session.user);
      if (mounted) setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) cargarUsuario(session.user);
      else setUsuario(null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [cargarUsuario]);

  // Cargar "items" (hijos + cursos admin) cuando hay usuario no-super.
  useEffect(() => {
    if (!usuario || usuario.rol === "super") {
      setItems([]);
      return;
    }
    let cancel = false;
    (async () => {
      const [{ data: uhData }, { data: ucData }] = await Promise.all([
        supabase
          .from("usuario_hijos")
          .select("hijo_id, hijos(*, cursos(nombre,color,avatar))")
          .eq("usuario_id", usuario.id),
        supabase
          .from("usuario_cursos")
          .select("curso_id")
          .eq("usuario_id", usuario.id)
          .eq("rol", "admin"),
      ]);
      if (cancel) return;
      const cursosAdmin = new Set((ucData || []).map((r) => r.curso_id));
      const next = (uhData || [])
        .map((r) => r.hijos)
        .filter(Boolean)
        .map((h) => ({
          ...h,
          _tipo: "hijo",
          rolEfectivo: cursosAdmin.has(h.curso_id) ? "admin" : "padre",
        }));
      setItems(next);
      setCursoIdx(0);
    })();
    return () => {
      cancel = true;
    };
  }, [usuario]);

  // Registrar el push token de Expo cuando hay usuario logueado.
  useEffect(() => {
    if (!usuario?.id) return;
    let cancel = false;
    (async () => {
      const token = await registerForPush();
      if (!cancel && token) await savePushToken(usuario.id, token);
    })();
    return () => {
      cancel = true;
    };
  }, [usuario?.id]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUsuario(null);
    setItems([]);
    setCursoIdx(0);
  }, []);

  const setColorHijo = useCallback(
    (item, color) => {
      if (!item || !usuario?.id) return;
      if (color === null) {
        // restablecer = guardar el default (el shim no expone delete por clave aquí)
        setHijoColor(usuario.id, item.id, HIJO_COLOR_DEFAULT);
      } else {
        setHijoColor(usuario.id, item.id, color);
      }
      setHijoColorsVer((v) => v + 1);
    },
    [usuario?.id]
  );

  const colorDeItem = useCallback(
    (item) => {
      if (!item || item._tipo !== "hijo") return "#3B82F6";
      const saved = getHijoColor(usuario?.id, item.id);
      return saved && saved !== HIJO_COLOR_DEFAULT ? saved : item.color || "#3B82F6";
      // hijoColorsVer en deps fuerza recálculo tras setColorHijo
    },
    [usuario?.id, hijoColorsVer] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const value = useMemo(() => {
    const itemActual = items[cursoIdx] || null;
    const rolEfectivo = itemActual?.rolEfectivo || "padre";
    return {
      usuario,
      authLoading,
      isSuper: usuario?.rol === "super",
      items,
      cursoIdx,
      setCursoIdx,
      itemActual,
      cursoId: itemActual?.curso_id ?? null,
      cursoNombre: itemActual?.cursos?.nombre ?? null,
      rolEfectivo,
      isAdmin: rolEfectivo === "admin",
      esPadre: rolEfectivo === "padre",
      hijoActivoId: itemActual?._tipo === "hijo" ? itemActual.id : null,
      misHijos: items.filter((i) => i._tipo === "hijo").map((i) => i.id),
      colorDeItem,
      setColorHijo,
      logout,
      reloadUsuario: () =>
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) cargarUsuario(session.user);
        }),
    };
  }, [usuario, authLoading, items, cursoIdx, colorDeItem, setColorHijo, logout, cargarUsuario]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
