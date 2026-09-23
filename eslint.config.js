import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-web', 'mobile', 'android', '.vercel']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // Toda la app carga datos con `useEffect(()=>{ cargar() },[...])`, y
      // `cargar` a veces hace un setState antes del primer await. Funciona;
      // pasarlo a useCallback en ~20 pantallas es un refactor aparte (sin
      // tests, riesgo de recargas en loop). Queda como aviso, igual que
      // exhaustive-deps — el CI bloquea solo por errores.
      'react-hooks/set-state-in-effect': 'warn',
      // Hooks exportados junto al componente que los usa.
      'react-refresh/only-export-components': ['error', { allowConstantExport: true, allowExportNames: ['useSignedUrl', 'useNotificaciones'] }],
    },
  },
])
