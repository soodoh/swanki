import { defineConfig } from "@standard-config/oxlint";

export default defineConfig({
  react: true,
  ignorePatterns: ["node_modules/**", ".output/**", "src/routeTree.gen.ts"],
  rules: {
    "eslint/no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "react",
            importNames: ["default"],
            message: "Use named imports from 'react' instead",
          },
        ],
      },
    ],
  },
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
    {
      // sql.js APIs return `any` types; IDB APIs use `onsuccess`/`onerror` callbacks
      files: ["src/lib/offline/**/*.{ts,tsx}"],
      rules: {
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-restricted-types": "off",
        "typescript/no-redundant-type-constituents": "off",
        "unicorn/prefer-add-event-listener": "off",
      },
    },
  ],
});
