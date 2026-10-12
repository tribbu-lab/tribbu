// src/hooks/useConfirmar.jsx — confirmación con el modal de la app, en vez de
// window.confirm: en algunos navegadores embebidos (vista previa del escritorio,
// WebViews) window.confirm devuelve false al instante sin mostrar nada, y la
// acción "no hacía nada" (pasó con Unificar materias y Quitar clase).
//
//   const [confirmar, confirmUI] = useConfirmar();
//   if (!(await confirmar({ titulo, detalle, textoConfirmar }))) return;
//   ...
//   return <>{confirmUI}...</>;
import { useCallback, useRef, useState } from "react";
import { ConfirmDestructivoModal } from "../components/ConfirmDestructivoModal";

export function useConfirmar() {
  const [pedido, setPedido] = useState(null); // { titulo, detalle, textoConfirmar, colorAccion }
  const resolver = useRef(null);

  const confirmar = useCallback((opts) => new Promise((resolve) => {
    resolver.current = resolve;
    setPedido(opts);
  }), []);

  const cerrar = (valor) => {
    resolver.current?.(valor);
    resolver.current = null;
    setPedido(null);
  };

  const confirmUI = pedido ? (
    <ConfirmDestructivoModal
      titulo={pedido.titulo}
      detalle={pedido.detalle}
      textoConfirmar={pedido.textoConfirmar || "Confirmar"}
      colorAccion={pedido.colorAccion}
      onCancelar={() => cerrar(false)}
      onConfirmar={() => cerrar(true)}
    />
  ) : null;

  return [confirmar, confirmUI];
}
