// Contexto de sesión — equivalente RN del bootstrap + modelo "Mi acceso" que
// vive en src/App.jsx de la web.
//
// Carga la sesión de Supabase (persistida en AsyncStorage), arma el `usuario`,
// deriva `items` = hijos del usuario + cursos donde es Room Parent, y expone el
// `cursoIdx` activo con su `rolEfectivo` ("padre" | "room"). El Super Admin
// (usuario.rol === "super") se maneja como flujo aparte en la navegación.

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { getHijoColor, setHijoColor } from "@shared/helpers";
import { HIJO_COLOR_DEFAULT } from "@shared/theme";
import { SELECT_USUARIO_SESION, armarUsuario } from "@shared/sesion";
import { registerForPush, savePushToken } from "../push/register";

const SessionContext = createContext(null);


export function SessionProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [cursoIdx, setCursoIdx] = useState(0);
  const [colegiosPorId, setColegiosPorId] = useState({});
  const [hijoColorsVer, setHijoColorsVer] = useState(0); // fuerza recálculo al cambiar color

  const cargarUsuario = useCallback(async (authUser) => {
    const { data } = await supabase
      .from("usuarios")
      // Trae también los hijos con su curso: "Mi acceso" se arma sin otro viaje.
      .select(SELECT_USUARIO_SESION)
      .eq("auth_id", authUser.id)
      .eq("activo", true)
      .single();
    if (data) setUsuario(armarUsuario(data));
    else setUsuario(null);
  }, []);

  // Bootstrap + suscripción a cambios de auth.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) await cargarUsuario(session.user);
      if (mounted) setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION ya lo resolvió getSession() de arriba, y TOKEN_REFRESHED
      // (cada hora) no cambia quién es el usuario: recargarlo en esos dos
      // casos repetía el usuario y "Mi acceso" enteros en cada arranque.
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      if (session?.user) cargarUsuario(session.user);
      else setUsuario(null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [cargarUsuario]);

  // Cargar "items" (hijos + cursos admin) cuando hay usuario no-super.
  // super y colegio_admin no tienen "Mi acceso" — van directo a su panel.
  useEffect(() => {
    if (!usuario || usuario.rol === "super" || usuario.rol === "colegio_admin" || usuario.rol === "docente") {
      setItems([]);
      return;
    }
    let cancel = false;
    (async () => {
      // Hijos y cursos de Room Parent ya vienen con el usuario
      // (SELECT_USUARIO_SESION): sin otro viaje a usuario_hijos/usuario_cursos.
      const cursosAdmin = new Set((usuario.cursosConRol || []).filter((r) => r.rol === "room").map((r) => r.curso_id));
      const next = (usuario.usuario_hijos || [])
        .map((r) => r.hijos)
        .filter(Boolean)
        .map((h) => ({
          ...h,
          _tipo: "hijo",
          rolEfectivo: cursosAdmin.has(h.curso_id) ? "room" : "padre",
        }));
      // Con hijos en más de un curso, "Todos" es un acceso más (el primero y el
      // default): la vista unificada domina todas las pantallas vía cursoIds.
      const cursosDistintos = new Set(next.map((h) => h.curso_id).filter(Boolean));
      setItems(cursosDistintos.size > 1 ? [{ _tipo: "todos", id: "__todos__", nombre: "Todos" }, ...next] : next);
      setCursoIdx(0);

      // Logo del colegio para el header (ver App.jsx de la web, mismo patrón) —
      // un query chico, solo los colegios realmente en juego.
      const colegioIds = [...new Set(next.map((h) => h.cursos?.colegio_id).filter(Boolean))];
      if (colegioIds.length) {
        const { data: cols } = await supabase.from("colegios").select("id,nombre,logo_url,color_primario").in("id", colegioIds);
        if (!cancel) setColegiosPorId(Object.fromEntries((cols || []).map((c) => [c.id, c])));
      } else if (!cancel) {
        setColegiosPorId({});
      }
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

  // Solo el color personalizado (null si no eligió uno): tiñe el header,
  // igual que headerBg en la web (src/App.jsx).
  const colorCustomDeItem = useCallback(
    (item) => {
      if (!item || item._tipo !== "hijo") return null;
      const saved = getHijoColor(usuario?.id, item.id);
      return saved && saved !== HIJO_COLOR_DEFAULT ? saved : null;
    },
    [usuario?.id, hijoColorsVer] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Cursos distintos donde el usuario tiene hijos (excluye el pseudo-item "Todos").
  const cursosHijos = useMemo(
    () => [...new Set(items.filter((i) => i._tipo === "hijo").map((i) => i.curso_id).filter(Boolean))],
    [items]
  );

  const esVistaTodos = items[cursoIdx]?._tipo === "todos";

  // Tag por curso para la vista "Todos": primer nombre de cada hijo del curso +
  // su color de identidad (el mismo dot del selector del header).
  const tagPorCurso = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      if (it._tipo !== "hijo" || !it.curso_id) continue;
      const nombre = it.nombre?.split(" ")[0] || "";
      const prev = m.get(it.curso_id);
      if (prev) prev.nombre = `${prev.nombre}, ${nombre}`;
      else m.set(it.curso_id, { nombre, color: colorDeItem(it) });
    }
    return m;
  }, [items, colorDeItem]);

  // {nombre, color} del curso dado, SOLO en vista "Todos" (en vista por hijo
  // devuelve null, así las pantallas lo llaman incondicionalmente).
  const tagDeCurso = useCallback(
    (cid) => (esVistaTodos && cid ? tagPorCurso.get(cid) || null : null),
    [esVistaTodos, tagPorCurso]
  );

  const value = useMemo(() => {
    const itemActual = items[cursoIdx] || null;
    // En "Todos" no hay curso único: sin rol admin (las acciones por curso
    // requieren elegir un hijo) y cursoId null; las lecturas van por cursoIds.
    const rolEfectivo = esVistaTodos ? "padre" : itemActual?.rolEfectivo || "padre";
    const cursoId = esVistaTodos ? null : itemActual?.curso_id ?? null;
    // Igual criterio que colegioActivo en src/App.jsx (web): solo con un
    // colegio inequívoco (no en Todos, ni sin logo cargado).
    const colegioActivo = !esVistaTodos ? colegiosPorId[itemActual?.cursos?.colegio_id] : null;
    return {
      usuario,
      authLoading,
      isSuper: usuario?.rol === "super",
      // colegio_admin: mismo panel de administración que super pero acotado a
      // su colegio_id por RLS. NO es isSuper (no activa lógica de plataforma).
      esColegioAdmin: usuario?.rol === "colegio_admin",
      items,
      cursoIdx,
      setCursoIdx,
      itemActual,
      cursoId,
      cursoIds: esVistaTodos ? cursosHijos : cursoId ? [cursoId] : [],
      esVistaTodos,
      cursoNombre: esVistaTodos ? "Todos mis hijos" : itemActual?.cursos?.nombre ?? null,
      colegioActivo,
      rolEfectivo,
      isAdmin: rolEfectivo === "room",
      esPadre: rolEfectivo === "padre",
      hijoActivoId: itemActual?._tipo === "hijo" ? itemActual.id : null,
      misHijos: items.filter((i) => i._tipo === "hijo").map((i) => i.id),
      cursosHijos,
      tagDeCurso,
      colorDeItem,
      colorCustomDeItem,
      setColorHijo,
      logout,
      reloadUsuario: () =>
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) cargarUsuario(session.user);
        }),
    };
  }, [usuario, authLoading, items, cursoIdx, cursosHijos, esVistaTodos, colegiosPorId, tagDeCurso, colorDeItem, colorCustomDeItem, setColorHijo, logout, cargarUsuario]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
