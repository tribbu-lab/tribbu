// Layout en pantallas anchas (tablets y plegables en Android, que pueden rotar:
// ver plugins/withPantallasGrandes). La app es phone-first: en una pantalla
// ancha el contenido va en una columna centrada en vez de estirarse a todo el
// ancho. En un celular la columna siempre es más angosta que el máximo y los
// insets laterales son 0, así que nada cambia.

import { useSafeAreaInsets } from "react-native-safe-area-context";

export const ANCHO_MAX_CONTENIDO = 720;

// Columna centrada con ancho máximo (sumar a un View que ya ocupa el alto).
export const columnaCentrada = { width: "100%", maxWidth: ANCHO_MAX_CONTENIDO, alignSelf: "center" };

// Insets laterales: en horizontal, el recorte de cámara o la barra de
// navegación pueden quedar a un costado de la pantalla.
export function useInsetsLaterales() {
  const insets = useSafeAreaInsets();
  return { paddingLeft: insets.left, paddingRight: insets.right };
}
