import { defineConfig } from "vite";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  resolve: {
    alias: {
      "@/": path.resolve(__dirname, "../web/src") + "/",
    },
  },
  plugins: [tailwindcss(), tsconfigPaths(), viteReact()],
});
