import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "apps/server/src/generated/**"] },
  ...tseslint.configs.recommended,
);
