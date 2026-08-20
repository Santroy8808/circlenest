import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "outputs/**",
      "tmp/**",
      "coverage/**",
      "public/downloads/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
];

export default eslintConfig;
