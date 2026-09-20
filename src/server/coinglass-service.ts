import { resolveInstrument, SymbolError } from "./symbol-service";
import { coinglassParams, calculationParams } from "../domain/coinglass";
export interface CoinglassConfig {
  COINGLASS_SERVICE_URL?: string;
  COINGLASS_TOKEN?: string;
  DATA_MODE?: string;
}
export async function coinglassRequest(
  path: string,
  config: CoinglassConfig,
  payload?: unknown,
) {
  if (!config.COINGLASS_SERVICE_URL)
    throw new SymbolError("Сервис CoinGlass не настроен", 503);
  let response: Response;
  try {
    response = await fetch(
      config.COINGLASS_SERVICE_URL.replace(/\/$/, "") + path,
      {
        method: payload ? "POST" : "GET",
        headers: {
          ...(config.COINGLASS_TOKEN
            ? { Authorization: `Bearer ${config.COINGLASS_TOKEN}` }
            : {}),
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(4000),
      },
    );
  } catch {
    throw new SymbolError("Нет связи с фоновым сервисом CoinGlass", 503);
  }
  const body = (await response.json()) as any;
  if (!response.ok)
    throw new SymbolError(
      body.error || "Ошибка сервиса CoinGlass",
      response.status,
    );
  return body;
}
export async function coinglassAsset(symbol: string, config: CoinglassConfig) {
  const item = await resolveInstrument(symbol, config.DATA_MODE === "demo");
  if (
    item.category !== "crypto" ||
    !["USD", "USDT", "USDC"].includes(item.quote) ||
    !/^[A-Z0-9]{1,20}$/.test(item.base)
  )
    throw new SymbolError(
      "Карта CoinGlass доступна для криптопар в USD, USDT или USDC",
      400,
    );
  return item.base;
}
export async function handleCoinglass(
  request: Request,
  config: CoinglassConfig,
) {
  const url = new URL(request.url);
  const heatmap = url.pathname.startsWith("/api/coinglass/heatmap-");
  if (heatmap) url.pathname = url.pathname.replace("heatmap-", "");
  const prefix = heatmap ? "/heatmap" : "";
  try {
    if (
      ["/api/coinglass/status", "/api/coinglass/snapshot"].includes(
        url.pathname,
      ) &&
      request.method === "GET"
    ) {
      const symbol = url.searchParams.get("symbol");
      const asset = symbol ? await coinglassAsset(symbol, config) : undefined;
      const snapshotId = url.searchParams.get("snapshotId");
      if (snapshotId && !/^[a-f0-9]{32}$/.test(snapshotId))
        throw new SymbolError("Некорректный снимок", 400);
      if (url.pathname.endsWith("/snapshot") && !asset)
        throw new SymbolError("Не указан symbol", 400);
      return Response.json(
        await coinglassRequest(
          prefix +
            (url.pathname.endsWith("/snapshot") ? "/snapshot" : "/status") +
            (asset ? "?asset=" + encodeURIComponent(asset) : "") +
            (snapshotId ? "&snapshotId=" + snapshotId : ""),
          config,
        ),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (
      ["/api/coinglass/run", "/api/coinglass/preview"].includes(url.pathname) &&
      request.method === "POST"
    ) {
      const origin = request.headers.get("origin");
      if (
        origin &&
        new URL(origin).host !== (request.headers.get("host") ?? url.host)
      )
        throw new SymbolError("Недопустимый источник запроса", 403);
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        throw new SymbolError("Ожидается application/json", 415);
      const text = await request.text();
      if (text.length > 8192)
        throw new SymbolError("Запрос слишком большой", 413);
      let body: any;
      try {
        body = JSON.parse(text);
      } catch {
        throw new SymbolError("Некорректный JSON", 400);
      }
      if (!body || typeof body.symbol !== "string")
        throw new SymbolError("Не указан symbol", 400);
      const asset = await coinglassAsset(body.symbol, config);
      const normalized = calculationParams(coinglassParams(body.params));
      if (
        !heatmap &&
        (!body.params ||
          Object.entries(normalized).some(
            ([k, v]) =>
              !(
                ["rangeDays", "requestLimit"].includes(k) &&
                body.params[k] === undefined
              ) && body.params[k] !== v,
          ))
      )
        throw new SymbolError("Некорректные настройки расчёта", 400);
      const isPreview = url.pathname.endsWith("/preview");
      if (heatmap && isPreview)
        throw new SymbolError("Маршрут недоступен", 405);
      if (
        isPreview &&
        (typeof body.snapshotId !== "string" ||
          !/^[a-f0-9]{32}$/.test(body.snapshotId))
      )
        throw new SymbolError("Не указан корректный снимок", 400);
      return Response.json(
        await coinglassRequest(
          prefix + (isPreview ? "/preview" : "/jobs"),
          config,
          {
            asset,
            params: normalized,
            ...(isPreview ? { snapshotId: body.snapshotId } : {}),
          },
        ),
        {
          status: isPreview ? 200 : 202,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    return Response.json(
      { error: "Method or route not allowed" },
      { status: 405 },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof SymbolError ? e.message : "Ошибка запроса CoinGlass",
      },
      {
        status: e instanceof SymbolError ? e.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
