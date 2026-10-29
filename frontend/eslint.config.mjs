import pluginQuery from "@tanstack/eslint-plugin-query";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...pluginQuery.configs["flat/recommended"],
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "react/no-danger": "error",
    },
  },
  {
    files: ["src/components/seo/json-ld.tsx"],
    rules: {
      "react/no-danger": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "e2e/**",
    "src/lib/api/schema.d.ts",
  ]),
]);

export default eslintConfig;
