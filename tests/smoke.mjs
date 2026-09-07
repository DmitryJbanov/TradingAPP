import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
const port = 3093;
const child = spawn(process.execPath, ["release/server.mjs"], {
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    DATA_MODE: process.env.SMOKE_LIVE === "1" ? "auto" : "demo",
  },
  stdio: ["ignore", "pipe", "inherit"],
});
let ready = false;
child.stdout.on("data", (d) => {
  if (String(d).includes("listening")) ready = true;
});
try {
  const deadline = Date.now() + 6000;
  while (!ready && Date.now() < deadline) {
    if (child.exitCode !== null) throw Error("Server exited");
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(ready, "server starts");
  const get = (path) => fetch(`http://127.0.0.1:${port}${path}`);
  const root = await get("/");
  assert.equal(root.status, 200);
  const html = await root.text();
  assert.ok(html.includes("Vector"));
  for (const asset of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) {
    assert.equal((await get(asset[1])).status, 200);
  }
  assert.equal((await get("/pair/BTCUSDT")).status, 200);
  assert.equal((await get("/missing.js")).status, 404);
  const health = await (await get("/api/health")).json();
  assert.equal(health.status, "ok");
  const markets = await (await get("/api/markets")).json();
  assert.equal(markets.data.length, 44);
  console.log(
    "Quote sources:",
    JSON.stringify(
      markets.data.reduce(
        (a, q) => ((a[q.source] = (a[q.source] ?? 0) + 1), a),
        {},
      ),
    ),
  );
  const bars = await (
    await get("/api/candles?symbol=BTCUSDT&interval=4h")
  ).json();
  assert.equal(bars.data.length, 400);
  console.log("Candle source:", bars.source);
  if (process.env.SMOKE_LIVE === "1") console.log("Provider events:", JSON.stringify((await (await get("/api/logs")).json()).data));
  assert.equal((await get("/api/candles?symbol=INVALID")).status, 400);
  console.log(
    "PASS standalone HTTP: root, direct pair URL, assets, 404, health, markets, candles, invalid symbol",
  );
} finally {
  child.kill("SIGTERM");
  await once(child, "exit");
}
