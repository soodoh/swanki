import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

const config: ForgeConfig = {
  packagerConfig: {
    name: "Swanki",
    asar: true,
    extraResource: ["./drizzle"],
  },
  rebuildConfig: {
    onlyModules: [],
  },
  makers: [
    { name: "@electron-forge/maker-squirrel", config: {} },
    { name: "@electron-forge/maker-dmg", config: {} },
    { name: "@electron-forge/maker-deb", config: {} },
    { name: "@electron-forge/maker-rpm", config: {} },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "electron/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
    }),
  ],
};

export default config;
