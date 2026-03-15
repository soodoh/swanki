import { defineConfig } from "vite";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

const webRoot = path.resolve(__dirname, "../web");
const monoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  resolve: {
    alias: {
      "@/": webRoot + "/src/",
    },
    // Resolve transitive deps via the web app and monorepo root node_modules
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // Tell esbuild to look in web and root node_modules for transitive deps
    esbuildOptions: {
      resolveExtensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx"],
      nodePaths: [
        path.resolve(__dirname, "node_modules"),
        path.resolve(webRoot, "node_modules"),
        path.resolve(monoRoot, "node_modules"),
      ],
    },
  },
  server: {
    fs: {
      allow: [__dirname, webRoot, monoRoot],
    },
  },
  plugins: [tailwindcss(), tsconfigPaths(), viteReact()],
});
