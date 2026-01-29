import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, "index.html"),
        techCommand: resolve(__dirname, "tech/command/index.html"),
        techParts: resolve(__dirname, "tech/parts/index.html"),
        techDoors: resolve(__dirname, "tech/doors/index.html"),
        techManuals: resolve(__dirname, "tech/manuals/index.html"),
        techSummary: resolve(__dirname, "tech/summary/index.html"),
        door: resolve(__dirname, "door/index.html"),
        service: resolve(__dirname, "service/index.html"),
      },
    },
  },
  // Resolve @ alias for clean imports
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
