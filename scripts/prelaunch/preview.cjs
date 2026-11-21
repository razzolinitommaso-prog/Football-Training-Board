// Local-only real application with synthetic API data. Never connects to production.
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  { createRequire } = require("node:module");
(async () => {
  const root = path.resolve(__dirname, "../.."),
    src = path.join(root, "artifacts/football-training-board/src"),
    web = createRequire(path.join(src, "../package.json")),
    out = path.join(root, ".tools/prelaunch/app.js");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await createRequire(web.resolve("vite"))("esbuild").build({
    entryPoints: [path.join(__dirname, "entry.tsx")],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    define: {
      "import.meta.env": '{"BASE_URL":"/","DEV":true,"VITE_API_URL":""}',
    },
    loader: { ".svg": "dataurl", ".png": "dataurl", ".css": "empty" },
    plugins: [
      {
        name: "fixture-api",
        setup(b) {
          b.onResolve({ filter: /\?url$/ }, () => ({
            path: "asset-url",
            namespace: "fixture-url",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture-url" }, () => ({
            contents: "export default " + JSON.stringify("/fixture-worker.mjs"),
            loader: "js",
          }));
          b.onResolve({ filter: /custom-fetch$/ }, () => ({
            path: path.join(__dirname, "fixtures.ts"),
          }));
        },
      },
    ],
    nodePaths: [
      path.join(src, "../node_modules"),
      path.join(root, "lib/api-zod/node_modules"),
    ],
    alias: {
      "@/hooks/use-auth": path.join(__dirname, "auth.ts"),
      "@workspace/api-zod": path.join(root, "lib/api-zod/src/index.ts"),
      "@": src,
    },
  });
  const assets = path.join(src, "../dist/public/assets"),
    css = fs.readFileSync(
      path.join(
        assets,
        fs.readdirSync(assets).find((n) => n.endsWith(".css")),
      ),
    );
  http
    .createServer((req, res) => {
      if (req.url.startsWith("/api/")) {
        res.statusCode = 403;
        return res.end("No real API in prelaunch fixture");
      }
      if (req.url === "/app.js") {
        res.setHeader("Content-Type", "application/javascript");
        return res.end(fs.readFileSync(out));
      }
      if (req.url === "/style.css") {
        res.setHeader("Content-Type", "text/css");
        return res.end(css);
      }
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>FTB · Collaudo locale · dati simulati</title><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      );
    })
    .listen(5203, "127.0.0.1", () =>
      console.log("Local synthetic app http://127.0.0.1:5203"),
    );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
