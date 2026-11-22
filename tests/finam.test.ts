import { test } from "node:test";
import assert from "node:assert/strict";
import { FinamService } from "../src/server/finam-service";
import { mergeLatestCandles } from "../src/domain/latest-candles";
import { handleApi } from "../src/server/market-service";

test("Finam uses read-only authentication, preserves exchange symbol and returns live candles and quotes", async () => {
  const paths: string[] = [];
  const api: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    if (path === "/v1/sessions") {
      assert.equal(JSON.parse(String(init?.body)).secret, "test-secret");
      return Response.json({ token: "test-session" });
    }
    if (path === "/v1/sessions/details")
      return Response.json({
        readonly: true,
        expires_at: new Date(Date.now() + 900000).toISOString(),
      });
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-session",
    );
    if (path === "/v1/assets")
      return Response.json({
        assets: [
          {
            symbol: "SBER@MISX",
            ticker: "SBER",
            mic: "MISX",
            name: "Сбербанк",
            type: "stock",
          },
          {
            symbol: "SBER@SPBX",
            ticker: "SBER",
            mic: "SPBX",
            name: "Сбербанк",
            type: "stock",
          },
          { symbol: "OLD@MISX", ticker: "OLD", mic: "MISX", is_archived: true },
        ],
      });
    if (path.endsWith("/quotes/latest"))
      return Response.json({
        quote: {
          last: { value: "300" },
          open: { value: "250" },
          timestamp: new Date().toISOString(),
        },
      });
    if (path.endsWith("/bars"))
      return Response.json({
        bars: [
          {
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            open: { value: "290" },
            high: { value: "305" },
            low: { value: "280" },
            close: { value: "300" },
            volume: { value: "10" },
          },
        ],
      });
    throw Error(`unexpected path ${path}`);
  };
  const service = new FinamService("test-secret", api);
  const found = await service.search("сбер");
  assert.deepEqual(
    found.data.map((x) => x.symbol),
    ["FINAM:SBER@MISX", "FINAM:SBER@SPBX"],
  );
  const result = await service.candles("FINAM:SBER@MISX", "4h", 300);
  assert.equal(result.provider, "Финам");
  assert.equal(result.data[0].close, 300);
  assert.match(result.warning!, /1 из 300/);
  const quote = await service.markets(["FINAM:SBER@MISX"]);
  assert.equal(quote.data[0].price, 300);
  assert.ok(Math.abs(quote.data[0].change - 20) < 1e-9);
  assert.equal(paths.filter((p) => p === "/v1/sessions").length, 1);
  assert.equal(paths.filter((p) => p === "/v1/assets").length, 1);
  await assert.rejects(
    service.candles("FINAM:SBER@MISX", "3m", 300),
    /не поддерживает/,
  );
  await assert.rejects(
    service.candles("FINAM:../../x", "4h", 300),
    /Некорректный/,
  );
});

test("Finam refuses tokens with trading rights", async () => {
  const api: typeof fetch = async (input) =>
    new URL(String(input)).pathname === "/v1/sessions"
      ? Response.json({ token: "session" })
      : Response.json({ readonly: false });
  await assert.rejects(
    new FinamService("secret", api).search("SBER"),
    /только для чтения/,
  );
});

test("Finam searches the alternative active catalogue if the account catalogue fails", async () => {
  const api: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/sessions") return Response.json({token:"session"});
    if (url.pathname === "/v1/sessions/details") return Response.json({readonly:true});
    if (url.pathname === "/v1/assets") return new Response("", {status:500});
    if (url.pathname === "/v1/assets/all" && url.searchParams.get("only_active") === "true")
      return Response.json({assets:[{symbol:"SBER@MISX",ticker:"SBER",mic:"MISX",name:"Сбербанк",type:"stock"}]});
    throw new Error("Unexpected request");
  };
  assert.equal((await new FinamService("secret", api).search("сбер")).data[0].symbol,"FINAM:SBER@MISX");
});

test("Finam candle polling accepts market-closure gaps only with overlap", () => {
  const candle = (time: number) => ({
    time,
    open: 10,
    high: 11,
    low: 9,
    close: 10,
    volume: 1,
  });
  const base = {
    source: "live" as const,
    provider: "Финам",
    exchange: "finam" as const,
    asOf: "2026-01-01T00:00:00Z",
  };
  const history = { ...base, data: [candle(100), candle(200)] };
  assert.equal(
    mergeLatestCandles(
      history,
      { ...base, data: [candle(200), candle(500)] },
      300,
      100,
    ).needsReload,
    false,
  );
  assert.equal(
    mergeLatestCandles(
      history,
      { ...base, data: [candle(500), candle(600)] },
      300,
      100,
    ).needsReload,
    true,
  );
});

test("Finam search and candles are routed through the market API", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/sessions")
      return Response.json({ token: "session" });
    if (url.pathname === "/v1/sessions/details")
      return Response.json({ readonly: true });
    if (url.pathname === "/v1/assets")
      return Response.json({
        assets: [
          {
            symbol: "SBER@MISX",
            ticker: "SBER",
            mic: "MISX",
            name: "Сбербанк",
            type: "stock",
          },
        ],
      });
    if (url.pathname.endsWith("/bars"))
      return Response.json({
        bars: [
          {
            timestamp: new Date(Date.now() - 86400_000).toISOString(),
            open: { value: "290" },
            high: { value: "305" },
            low: { value: "280" },
            close: { value: "300" },
            volume: { value: "10" },
          },
        ],
      });
    throw Error(`unexpected ${url.pathname}`);
  };
  try {
    const config = { FINAM_SECRET: "route-test" };
    const search = await handleApi(
      new Request("http://localhost/api/symbols?exchange=finam&q=SBER"),
      config,
    );
    assert.equal(search.status, 200);
    assert.equal(
      ((await search.json()) as { data: { symbol: string }[] }).data[0].symbol,
      "FINAM:SBER@MISX",
    );
    const candles = await handleApi(
      new Request(
        "http://localhost/api/candles?exchange=finam&symbol=FINAM%3ASBER%40MISX&interval=4h&count=300",
      ),
      config,
    );
    assert.equal(candles.status, 200);
    assert.equal(((await candles.json()) as { data: { close: number }[] }).data[0].close, 300);
  } finally {
    globalThis.fetch = original;
  }
});
