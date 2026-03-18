import { defineConfig } from "vite";
import { resolve } from "node:path";
import { builtinModules } from "node:module";

const nodeExternals = [
  "electron",
  ...builtinModules.flatMap((m) => [m, `node:${m}`]),
];

export default defineConfig({
  build: {
    outDir: ".vite/build",
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "src/preload.ts"),
      external: nodeExternals,
      output: {
        format: "cjs",
        entryFileNames: "[name].cjs",
        inlineDynamicImports: true,
      },
    },
  },
});
