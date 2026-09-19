import { test } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../src/server/market-service";
import {
  calculationParams,
  coinglassDefaults,
  coinglassParams,
} from "../src/domain/coinglass";
import { supportedIndicators } from "../src/domain/shared-indicators";
test("CoinGlass normalizes corrupt settings and preserves implemented remote indicator", () => {
  assert.equal(coinglassParams({ limit: NaN, aboveColor: "bad" }).limit, 5);
  assert.equal(
    coinglassParams({ limit: NaN, aboveColor: "bad" }).aboveColor,
    coinglassDefaults.aboveColor,
  );
  assert.equal(
    supportedIndicators([
      { id: "cg", definitionId: "coinglass", enabled: true },
    ]).length,
    1,
  );
});
test("CoinGlass validates proxy requests, submits jobs and merges worker logs", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; payload: any }[] = [];
  const config = {
    DATA_MODE: "demo",
    COINGLASS_SERVICE_URL: "http://collector:8090",
    COINGLASS_TOKEN: "test-token",
  };
  const settings = calculationParams(coinglassDefaults);
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      payload: init?.body ? JSON.parse(String(init.body)) : null,
    });
    assert.equal((init?.headers as any).Authorization, "Bearer test-token");
    return Response.json(
      url.endsWith("/events")
        ? {
            data: [
              {
                id: 1,
                level: "INFO",
                time: new Date().toISOString(),
                message: "CoinGlass: BTC: Сбор уровней",
              },
            ],
          }
        : { job: { asset: "BTC", state: "queued" } },
    );
  };
  const call = (path: string, body?: any, origin?: string) =>
    handleApi(
      new Request("http://local" + path, {
        method: body ? "POST" : "GET",
        headers: body
          ? {
              "Content-Type": "application/json",
              ...(origin ? { Origin: origin } : {}),
            }
          : {},
        body: body ? JSON.stringify(body) : undefined,
      }),
      config,
    );
  try {
    assert.equal(
      (
        await call(
          "/api/coinglass/run",
          { symbol: "BTCUSDT", params: settings },
          "http://evil",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/api/coinglass/run", {
          symbol: "BTCUSDT",
          params: { ...settings, limit: 900 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/api/coinglass/run",
          { symbol: "BTCUSDT", params: settings },
          "http://local",
        )
      ).status,
      202,
    );
    assert.deepEqual(calls.at(-1)?.payload, { asset: "BTC", params: settings });
    assert.equal(
      (await call("/api/coinglass/status?symbol=BTCUSDT")).status,
      200,
    );
    assert.ok(calls.at(-1)?.url.endsWith("asset=BTC"));
    const logs = (await (await call("/api/logs")).json()) as any;
    assert.ok(
      logs.data.some(
        (e: any) => e.id === -1 && e.message.includes("CoinGlass"),
      ),
    );
    assert.equal(
      (await handleApi(new Request("http://local/api/coinglass/status")))
        .status,
      503,
    );
    globalThis.fetch = async () => {
      throw new Error("secret transport details");
    };
    const failure = await call("/api/coinglass/status");
    assert.equal(failure.status, 503);
    assert.ok(!JSON.stringify(await failure.json()).includes("secret"));
  } finally {
    globalThis.fetch = original;
  }
});

test("CoinGlass preview is pinned, stateless and protected by proxy validation", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; body: unknown }[] = [];
  const config = {
    DATA_MODE: "demo",
    COINGLASS_SERVICE_URL: "http://collector:8090",
  };
  const id = "a".repeat(32);
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Response.json({ result: { snapshotId: id, levels: [] } });
  };
  const call = (path: string, body?: unknown, origin = "http://local") =>
    handleApi(
      new Request("http://local" + path, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: body ? JSON.stringify(body) : undefined,
      }),
      config,
    );
  try {
    const body = {
      symbol: "BTCUSDT",
      snapshotId: id,
      params: calculationParams(coinglassDefaults),
    };
    assert.equal((await call("/api/coinglass/preview", body)).status, 200);
    assert.equal(calls.at(-1)?.url, "http://collector:8090/preview");
    assert.deepEqual(calls.at(-1)?.body, {
      asset: "BTC",
      snapshotId: id,
      params: body.params,
    });
    assert.equal(
      (
        await call("/api/coinglass/preview", {
          ...body,
          snapshotId: "../session",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/api/coinglass/preview", {
          ...body,
          params: { ...body.params, minProminence: 2 },
        })
      ).status,
      400,
    );
    assert.equal(
      (await call("/api/coinglass/preview", body, "http://evil")).status,
      403,
    );
    assert.equal(calls.length, 1);
    assert.equal(
      (await call(`/api/coinglass/snapshot?symbol=BTCUSDT&snapshotId=${id}`))
        .status,
      200,
    );
    assert.equal(
      calls.at(-1)?.url,
      `http://collector:8090/snapshot?asset=BTC&snapshotId=${id}`,
    );
    assert.equal((await call("/api/coinglass/snapshot")).status, 400);
    globalThis.fetch = async () =>
      Response.json({ error: "Снимок недоступен" }, { status: 404 });
    assert.equal((await call("/api/coinglass/preview", body)).status, 404);
  } finally {
    globalThis.fetch = original;
  }
});
