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
    dedupe: ["react", "react-dom"],
    preserveSymlinks: false,
  },
  // Bun stores transitive deps in node_modules/.bun/ rather than hoisting them.
  // Vite needs to find them in the web app's and root's node_modules.
  ssr: {
    resolve: {
      conditions: ["import", "module", "browser", "default"],
    },
  },
  optimizeDeps: {
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
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    viteReact(),
    // Resolve bare imports from the web app's node_modules
    {
      name: "resolve-web-deps",
      enforce: "pre",
      resolveId(source, importer) {
        // Only intercept bare imports (not relative/absolute paths)
        if (
          source.startsWith(".") ||
          source.startsWith("/") ||
          source.startsWith("@/")
        ) {
          return null;
        }
        // If the importer is from the web app, try resolving from web's node_modules
        if (
          importer &&
          (importer.includes("/apps/web/") || importer.includes("/packages/"))
        ) {
          try {
            const resolved = require.resolve(source, {
              paths: [
                path.resolve(webRoot, "node_modules"),
                path.resolve(monoRoot, "node_modules"),
              ],
            });
            return resolved;
          } catch {
            return null;
          }
        }
        return null;
      },
    },
  ],
});
