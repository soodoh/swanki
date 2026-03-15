import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Forge plugin forces CJS for preload.
        // Use .cjs so it works with "type": "module".
        entryFileNames: "[name].cjs",
      },
    },
  },
});
