import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "../src/server/market-service";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "public");
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (url.pathname.startsWith("/api/")) {
      let body: Buffer | undefined;
      if (
        req.method === "POST" &&
        [
          "/api/coinglass/run",
          "/api/coinglass/preview",
          "/api/coinglass/heatmap-run",
          "/api/coinglass/fear-greed-run",
          "/api/coinglass/rsi-heatmap-run",
        ].includes(url.pathname)
      ) {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8192) {
            res.writeHead(413);
            res.end("Request too large");
            return;
          }
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      const requestHeaders = new Headers();
      for (const key of ["content-type", "origin", "host"])
        if (typeof req.headers[key] === "string")
          requestHeaders.set(key, req.headers[key]);
      const response = await handleApi(
        new Request(url, {
          method: req.method,
          headers: requestHeaders,
          body: body?.toString("utf-8"),
        }),
        {
          COINGLASS_SERVICE_URL: process.env.COINGLASS_SERVICE_URL,
          COINGLASS_TOKEN: process.env.COINGLASS_TOKEN,
          DATA_MODE: process.env.DATA_MODE,
          TWELVE_DATA_API_KEY: process.env.TWELVE_DATA_API_KEY,
        },
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    let file = resolve(root, "." + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) throw Error();
    } catch {
      if (
        url.pathname === "/" ||
        /^\/backlog\/?$/.test(url.pathname) ||
        /^\/pair\/[^/]+\/?$/.test(url.pathname) ||
        /^\/fear-greed\/?$/.test(url.pathname)
        || /^\/rsi-heatmap\/?$/.test(url.pathname)
      )
        file = resolve(root, "index.html");
      else {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
    }
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "Cache-Control": url.pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(500);
    res.end("Internal error");
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(
  Number(process.env.PORT ?? 3000),
  process.env.HOST ?? "0.0.0.0",
  () => console.log("DiVMoney listening on port " + (process.env.PORT ?? 3000)),
);
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
