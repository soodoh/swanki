import { defineConfig } from "@standard-config/oxlint";

export default defineConfig({
  react: true,
  ignorePatterns: ["node_modules/**", ".output/**", "src/routeTree.gen.ts"],
  rules: {},
  overrides: [
    {
      files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
      rules: {
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/await-thenable": "off",
      },
    },
  ],
});
