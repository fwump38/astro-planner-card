// Tiny static server for the dev harness: `npm run build && npm run serve`, then open http://localhost:8123/dev/
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".map": "application/json" };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, path.endsWith("/") ? `${path}index.html` : path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  let body;
  try {
    body = await readFile(file);
  } catch {
    return res.writeHead(404).end("not found");
  }
  res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" }).end(body);
}).listen(8123, () => console.log("http://localhost:8123/dev/"));
