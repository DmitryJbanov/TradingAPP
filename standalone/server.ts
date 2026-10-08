import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "../src/server/market-service";
import { handleProfileApi, requireProfileUser, validProfileOrigin } from "./profiles";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "public");
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (url.pathname.startsWith("/api/")) {
      const requestHeaders = new Headers();
      for (const key of ["content-type", "origin", "host", "cookie"])
        if (typeof req.headers[key] === "string")
          requestHeaders.set(key, req.headers[key]);
      const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/profiles")) {
        if (["/api/auth/login", "/api/auth/register"].includes(url.pathname)) {
          const key = req.socket.remoteAddress ?? "unknown";
          const now = Date.now(); const attempt = authAttempts.get(key);
          const current = !attempt || now >= attempt.resetAt ? { count: 0, resetAt: now + 60_000 } : attempt;
          if (current.count >= 12) { res.writeHead(429, { "Retry-After": String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))) }); res.end("Too many authentication attempts"); return; }
          current.count++; authAttempts.set(key, current);
          if (authAttempts.size > 5000) for (const [ip, state] of authAttempts) if (now >= state.resetAt) authAttempts.delete(ip);
        }
        const incoming = new Request(requestUrl, { method: req.method, headers: requestHeaders });
        if (["POST", "PATCH", "DELETE"].includes(req.method ?? "") && !["/api/auth/register", "/api/auth/login"].includes(url.pathname) && !validProfileOrigin(incoming)) {
          res.writeHead(403, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Недопустимый источник запроса" })); return;
        }
        let body: Buffer | undefined;
        if (["POST", "PATCH", "DELETE"].includes(req.method ?? "")) {
          const chunks: Buffer[] = []; let size = 0;
          for await (const chunk of req) { size += chunk.length; if (size > 3_200_000) { res.writeHead(413); res.end("Request too large"); return; } chunks.push(chunk); }
          body = Buffer.concat(chunks);
        }
        const response = await handleProfileApi(new Request(requestUrl, { method: req.method, headers: requestHeaders, body: body?.toString("utf8") }));
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
      }
      if (["POST", "PATCH", "DELETE"].includes(req.method ?? "")) {
        const incoming = new Request(requestUrl, { method: req.method, headers: requestHeaders });
        if (!validProfileOrigin(incoming)) { res.writeHead(403); res.end("Forbidden"); return; }
        if (!requireProfileUser(incoming)) { res.writeHead(401); res.end("Authentication required"); return; }
      }
      let body: Buffer | undefined;
      if (
        req.method === "POST" &&
        [
          "/api/coinglass/run",
          "/api/coinglass/preview",
          "/api/coinglass/heatmap-run",
          "/api/coinglass/fear-greed-run",
          "/api/coinglass/rsi-heatmap-run",
          "/api/coinglass/whales-watch",
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
      const response = await handleApi(
        new Request(requestUrl, {
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
        /^\/fear-greed\/?$/.test(url.pathname) ||
        /^\/rsi-heatmap\/?$/.test(url.pathname) ||
        /^\/whales(?:\/watchlist|\/0x[0-9a-fA-F]{40})?\/?$/.test(url.pathname)
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
