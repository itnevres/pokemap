import { defineConfig } from "C:/Programming Projects/PokeMap/node_modules/vite/dist/node/index.js";
import react from "C:/Programming Projects/PokeMap/packages/ui/node_modules/@vitejs/plugin-react/dist/index.js";
export default defineConfig({
  root: "C:/Programming Projects/PokeMap/packages/ui",
  plugins: [react()],
  server: { port: Number(process.env.UI_PORT), strictPort: true, proxy: { "/api": `http://127.0.0.1:${process.env.HUB_PORT}` } },
});
