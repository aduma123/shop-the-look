// Production server: serves the built app from dist/ and the /api routes.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./handler.ts";

const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const port = Number(process.env.PORT ?? 3000);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  if (await handleApi(req, res)) return;

  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
  let file = join(root, path === "/" ? "index.html" : path);
  if (!file.startsWith(root)) file = join(root, "index.html");

  try {
    const body = await readFile(file);
    res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
    res.end(body);
  } catch {
    res.setHeader("Content-Type", TYPES[".html"]);
    res.end(await readFile(join(root, "index.html")));
  }
}).listen(port, () => console.log(`Shop the Look on http://localhost:${port}`));
