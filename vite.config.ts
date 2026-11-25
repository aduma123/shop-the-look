import { defineConfig, type Plugin } from "vite";
import { handleApi } from "./server/handler.ts";

// Serves /api/analyze from the Vite dev and preview servers, so one command runs the app.
function api(): Plugin {
  const middleware = (req: any, res: any, next: () => void) => {
    handleApi(req, res).then((handled) => handled || next(), next);
  };
  return {
    name: "shop-the-look-api",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig({ plugins: [api()] });
