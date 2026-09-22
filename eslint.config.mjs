import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Layering rules from docs/ARCHITECTURE.md. Keep this file the executable
// version of that document: if a rule here is relaxed, say why.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // domain/ is pure business logic: no framework, no database, no other layer.
  {
    files: ["src/lib/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/**", "next", "next/**", "react", "react-dom", "@supabase/**", "server-only", "node:*"],
              message:
                "src/lib/domain must stay pure: import only other domain files and pure libraries (docs/ARCHITECTURE.md).",
            },
          ],
        },
      ],
    },
  },

  // Application services depend on ports, not concrete providers. The
  // exceptions below predate the ports and shrink to nothing as Slices 3
  // (Meta) and 5 (WhatsApp) move them behind interfaces.
  {
    files: ["src/lib/services/**/*.ts"],
    ignores: ["src/lib/services/meta.ts", "src/lib/services/meta-backfill.ts", "src/lib/services/whatsapp.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/integrations/**"],
              message: "Services depend on ports (src/lib/ports), never a concrete adapter (docs/ARCHITECTURE.md).",
            },
          ],
        },
      ],
    },
  },

  // Adapters don't know the CRM: they must not reach into services.
  {
    files: ["src/lib/integrations/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/services/**"],
              message: "An integration adapter must not import application services (docs/ARCHITECTURE.md).",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
