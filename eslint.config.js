import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        bootstrap: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-empty": ["warn", { "allowEmptyCatch": true }],
      "no-control-regex": "off",
      "no-useless-escape": "warn",
      "no-useless-assignment": "off",
    },
  },
  {
    ignores: [
      ".agents/**",
      "src/vendor/**",
      "dist/**",
      "build/**",
      "src-tauri/**",
      "node_modules/**",
      "scratch/**"
    ],
  },
];
