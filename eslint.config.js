import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // `const semIdTs = ({ id, ts, ...resto }) => resto` — desestruturar para
      // OMITIR chaves é padrão legítimo; o rest sibling conta como uso.
      'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Scripts de Node (rodam fora do browser: build e utilitários de terminal)
  {
    files: ['vite.config.js', 'eslint.config.js', 'onboarding.js'],
    languageOptions: { globals: globals.node },
  },
  // Contexts exportam Provider + hook + constantes juntos por design
  // (padrão de Context do React); o fast-refresh parcial é aceitável aqui.
  {
    files: ['src/store/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
