import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    // `out/**` is the static-export build output. Without it here, `eslint .`
    // lints the generated minified bundles after any build.
    ignores: [".next/**", "out/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // `const { person: _person, ...rest } = record` is how this codebase drops
      // joined relations before writing a record back. Without
      // `ignoreRestSiblings` the discarded bindings read as unused variables,
      // which would push the code toward a manual field-by-field copy that goes
      // stale every time the model gains a field.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
