import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => {
  return {
    plugins: [
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: { entry: "server" },
      }),
      viteReact(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    server: {
      port: 8080,
    },
  };
});
