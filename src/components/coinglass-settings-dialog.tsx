"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { IndicatorInstance } from "../domain/workspace";
import type { Candle, Timeframe } from "../domain/market";
import {
  coinglassDefaults,
  coinglassParams,
  type CoinglassParams,
  type CoinglassSnapshot,
} from "../domain/coinglass";
import type { ChartPalette } from "./chart";
import { useResource } from "../hooks/use-resource";
import {
  useCoinglassPreview,
  useSnapshotClock,
} from "../hooks/use-coinglass-preview";
import type { useCoinglass } from "../hooks/use-coinglass";
import { CoinglassMap } from "./coinglass-map";
import { CoinglassCandles } from "./coinglass-candles";

export function CoinglassSettingsDialog({
  instance,
  symbol,
  state,
  bars,
  palette,
  timeframe,
  candleSource,
  onClose,
  onApply,
}: {
  instance: IndicatorInstance;
  symbol: string;
  state: ReturnType<typeof useCoinglass>;
  bars: Candle[];
  palette: ChartPalette;
  timeframe: Timeframe;
  candleSource?: string;
  onClose: () => void;
  onApply: (next: IndicatorInstance) => void;
}) {
  const [params, setParams] = useState(() => coinglassParams(instance.params));
  const [saved] = useState(() => coinglassParams(instance.params));
  const [snapshotId, setSnapshotId] = useState(state.snapshotId);
  const [compare, setCompare] = useState(false);
  const [candles, setCandles] = useState(true);
  const [tab, setTab] = useState("map");
  const [error, setError] = useState("");
  const latestId = state.job?.result?.snapshotId;
  const now = useSnapshotClock();
  const source = useResource<{ snapshot: CoinglassSnapshot }>(
    `/api/coinglass/snapshot?symbol=${encodeURIComponent(symbol)}&snapshotId=${snapshotId ?? ""}`,
    0,
    !!snapshotId,
  );
  const snapshot = source.data?.snapshot;
  const normalized = coinglassParams(params);
  const valid = (
    [
      "minRelative",
      "minProminence",
      "limit",
      "hoverMs",
      "lineWidth",
      "staleHours",
    ] as const
  ).every((k) => normalized[k] === params[k]);
  const preview = useCoinglassPreview(
    symbol,
    snapshot?.snapshotId,
    normalized,
    valid,
  );
  const baseline = useCoinglassPreview(
    symbol,
    snapshot?.snapshotId,
    saved,
    compare,
  );
  const report = preview.data;
  const displayReport =
    report ?? (preview.loading ? preview.previousData : undefined);
  const working =
    state.submitting ||
    state.job?.state === "running" ||
    state.job?.state === "queued";
  const editNumber = (key: keyof CoinglassParams, value: string) =>
    setParams((p) => ({ ...p, [key]: value === "" ? NaN : Number(value) }));
  const field = (
    key:
      | "minRelative"
      | "minProminence"
      | "limit"
      | "hoverMs"
      | "lineWidth"
      | "staleHours",
    label: string,
    min: number,
    max: number,
    step: number,
    slider = false,
  ) => (
    <div className="cg-field" key={key}>
      <label htmlFor={`cg-${key}`}>{label}</label>
      <div>
        {slider && (
          <input
            aria-label={`${label}: ползунок`}
            type="range"
            min={min}
            max={max}
            step={step}
            value={normalized[key]}
            onChange={(e) => editNumber(key, e.target.value)}
          />
        )}
        <input
          id={`cg-${key}`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isNaN(params[key]) ? "" : params[key]}
          onChange={(e) => editNumber(key, e.target.value)}
        />
      </div>
    </div>
  );
  const candlePreview = (
    <>
      <label>
        <input
          type="checkbox"
          checked={candles}
          onChange={(e) => setCandles(e.target.checked)}
        />{" "}
        Показать уровни на свечном графике
      </label>
      {candles && report && (
        <section>
          <p>
            {symbol} · {timeframe} ·{" "}
            {candleSource === "demo"
              ? "DEMO — демонстрационные свечи"
              : candleSource === "stale"
                ? "Устаревшие свечи"
                : "Свечной график"}
            . Уровни снимка проецируются на весь график; это не исторические
            сигналы.
          </p>
          {bars.length ? (
            <CoinglassCandles
              bars={bars}
              palette={palette}
              params={normalized}
              report={report}
              baseline={compare ? baseline.data : undefined}
            />
          ) : (
            <p>Свечи не загружены.</p>
          )}
        </section>
      )}
    </>
  );
  function apply() {
    if (!valid || !snapshot || !report || preview.loading) {
      setError("Дождитесь расчёта для текущих параметров.");
      return;
    }
    onApply({
      ...instance,
      params: {
        ...normalized,
        snapshotIds: {
          ...normalized.snapshotIds,
          [snapshot.asset]: snapshot.snapshotId,
        },
      },
      color: normalized.aboveColor,
    });
    onClose();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="coinglass-dialog cg-visual-dialog"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>CoinGlass · визуальная настройка</DialogTitle>
        </DialogHeader>
        <div className="cg-source">
          {snapshot ? (
            <p>
              <b>{snapshot.asset} · 90 дней</b> · снимок{" "}
              {new Date(snapshot.collectedAt).toLocaleString("ru-RU")} · цена{" "}
              {Number(snapshot.currentPrice).toLocaleString("en-US")} USD
            </p>
          ) : (
            <p>
              {source.loading && snapshotId
                ? "Загрузка карты…"
                : "Полная карта ещё не загружена. Запустите сбор данных."}
            </p>
          )}
          {snapshot &&
            now - Date.parse(snapshot.collectedAt) >
              normalized.staleHours * 3600000 && (
              <p className="warning">
                Снимок старше {normalized.staleHours} ч. Пороги пересчитываются
                по этим сохранённым данным.
              </p>
            )}
          {latestId && latestId !== snapshotId && (
            <button className="button" onClick={() => setSnapshotId(latestId)}>
              {snapshotId
                ? "Перейти на новый снимок от"
                : "Открыть собранную карту от"}{" "}
              {new Date(state.job!.result!.collectedAt).toLocaleString("ru-RU")}
            </button>
          )}
          <button
            className="button"
            disabled={working || !valid}
            onClick={() => void state.run({ ...instance, params: normalized })}
          >
            {working ? "Сбор выполняется…" : "Обновить данные CoinGlass"}
          </button>
          {working && (
            <progress
              max={100}
              value={state.job?.progress ?? 0}
              aria-label="Прогресс сбора карты"
            />
          )}
          {state.job && <p role="status">{state.job.message}</p>}
          {(source.error || state.error) && (
            <p role="alert">{source.error || state.error}</p>
          )}
          {source.error && (
            <button className="button" onClick={() => void source.refresh()}>
              Повторить загрузку
            </button>
          )}
        </div>
        <div className="cg-layout">
          <main className="cg-main">
            <div className="cg-toolbar">
              <button
                type="button"
                className="button"
                aria-pressed={tab === "map"}
                onClick={() => setTab("map")}
              >
                Интерактивная карта
              </button>
              <button
                type="button"
                className="button"
                aria-pressed={tab === "image"}
                onClick={() => setTab("image")}
              >
                Снимок CoinGlass
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={(e) => setCompare(e.target.checked)}
                />{" "}
                Сравнить с сохранёнными параметрами
              </label>
            </div>
            {compare && (
              <p className="cg-help">
                Сравнение на одном снимке: «+» — уровень добавится, «−» —
                исчезнет. {baseline.loading ? "Расчёт сравнения…" : ""}
              </p>
            )}
            {baseline.error && compare && (
              <p role="alert">
                Не удалось сравнить: {baseline.error}{" "}
                <button onClick={baseline.retry}>Повторить</button>
              </p>
            )}
            {preview.loading && <p role="status">Пересчёт…</p>}
            {preview.error && (
              <p role="alert">
                {preview.error}{" "}
                <button className="button" onClick={preview.retry}>
                  Повторить расчёт
                </button>
              </p>
            )}
            {!valid && (
              <p role="alert">Проверьте диапазоны числовых параметров.</p>
            )}
            {tab === "map" && displayReport && (
              <div
                aria-busy={preview.loading}
                className={preview.loading ? "cg-pending" : ""}
              >
                <CoinglassMap
                  beforeTable={candlePreview}
                  report={displayReport}
                  params={{ ...normalized, ...displayReport.result.params }}
                  baseline={compare ? baseline.data : undefined}
                />
              </div>
            )}
            {tab === "image" &&
              (snapshot?.imageDataUrl?.startsWith("data:image/png;base64,") ? (
                <figure>
                  {/* A local chart crop data URL; Next image optimization cannot improve it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="cg-source-image"
                    src={snapshot.imageDataUrl}
                    alt="Исходная карта CoinGlass на момент сбора"
                  />
                  <figcaption>
                    Исходный снимок. Изменение параметров показано на
                    интерактивной карте.
                  </figcaption>
                </figure>
              ) : (
                <p>
                  Изображение для этого снимка недоступно. Числовая карта
                  доступна на соседней вкладке.
                </p>
              ))}
            {tab === "image" && candlePreview}
            <p className="cg-help">
              Интенсивности получены из округлённых подсказок CoinGlass.
              Максимум и пороги вычисляются по всей карте, независимо от
              масштаба. Цена снимка может отличаться от текущей цены
              инструмента.
            </p>
          </main>
          <aside className="cg-settings">
            <h3>Отбор уровней</h3>
            {field(
              "minRelative",
              "Минимальная высота / максимум",
              0,
              1,
              0.01,
              true,
            )}
            {field(
              "minProminence",
              "Минимальная выраженность / максимум",
              0,
              1,
              0.01,
              true,
            )}
            <p className="cg-help">
              0.50 = 50%. Выраженность — разница между вершиной и основанием по
              соседним впадинам, делённая на максимум карты.
            </p>
            {field("limit", "Количество ближайших уровней", 1, 50, 1)}
            <label className="cg-field">
              Относительно цены снимка
              <select
                value={params.side}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    side: e.target.value as CoinglassParams["side"],
                  }))
                }
              >
                <option value="both">С обеих сторон</option>
                <option value="above">Выше цены</option>
                <option value="below">Ниже цены</option>
              </select>
            </label>
            <details open>
              <summary>Оформление</summary>
              <label className="cg-field">
                Выше цены
                <input
                  type="color"
                  value={params.aboveColor}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, aboveColor: e.target.value }))
                  }
                />
              </label>
              <label className="cg-field">
                Ниже цены
                <input
                  type="color"
                  value={params.belowColor}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, belowColor: e.target.value }))
                  }
                />
              </label>
              {field("lineWidth", "Толщина линий", 1, 4, 1)}
              <label>
                <input
                  type="checkbox"
                  checked={params.showLabels}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, showLabels: e.target.checked }))
                  }
                />{" "}
                Подписи уровней
              </label>
            </details>
            <details>
              <summary>Сбор и актуальность</summary>
              {field("hoverMs", "Задержка сбора, мс", 50, 250, 10)}
              <p className="cg-help">
                Используется только при следующем сборе. На отбор сохранённых
                точек не влияет.
                {snapshot ? ` Этот снимок: ${snapshot.hoverMs} мс.` : ""}
              </p>
              {field("staleHours", "Считать устаревшим через, ч", 1, 720, 1)}
            </details>
            <button
              type="button"
              className="button"
              onClick={() =>
                setParams({
                  ...coinglassDefaults,
                  snapshotIds: params.snapshotIds,
                })
              }
            >
              По умолчанию
            </button>
          </aside>
        </div>
        <footer className="cg-footer">
          {error && <span role="alert">{error}</span>}
          <button className="button" onClick={onClose}>
            Отмена
          </button>
          <button
            className="button"
            disabled={!report || !snapshot || !valid || preview.loading}
            onClick={apply}
          >
            Применить
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
