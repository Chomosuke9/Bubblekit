import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

import path from "node:path";                // <-- tambah
import { fileURLToPath } from "node:url";    // <-- tambah
const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url)); // <-- tambah

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,

      parser: tseslint.parser, // <-- tambah (lebih aman di flat config)

      parserOptions: {         // <-- tambah
        tsconfigRootDir,       // <-- FIX UTAMA
        project: ["./tsconfig.app.json"], // ← FIX UTAM
        // atau: project: true
      },
    },
  },
]);
