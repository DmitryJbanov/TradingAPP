"use client";
import { IndicatorPresets } from "./indicator-presets";
import { useState } from "react";
import { Info } from "lucide-react";
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
import { Choice } from "./controls";

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
  const [base, setBase] = useState(instance);
  const [params, setParams] = useState(() => coinglassParams(instance.params));
  const [saved] = useState(() => coinglassParams(instance.params));
  const snapshotId = state.snapshotId;
  const [compare, setCompare] = useState(false);
  const [candles, setCandles] = useState(true);
  const [tab, setTab] = useState("map");
  const [error, setError] = useState("");
  const now = useSnapshotClock();
  const source = useResource<{ snapshot: CoinglassSnapshot }>(
    `/api/coinglass/snapshot?symbol=${encodeURIComponent(symbol)}&snapshotId=${snapshotId ?? ""}`,
    0,
    !!snapshotId,
  );
  const snapshot = source.data?.snapshot;
  const normalized = coinglassParams(params);
  const valid =
    (
      [
        "minRelative",
        "minProminence",
        "limit",
        "hoverMs",
        "rangeDays",
        "requestLimit",
        "staleHours",
      ] as const
    ).every((k) => normalized[k] === params[k]) &&
    normalized.volumeOpacities.every(
      (value, index) => value === params.volumeOpacities[index],
    );
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
      | "requestLimit"
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
      {candles && displayReport && (
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
              report={displayReport}
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
      ...base,
      params: { ...normalized, snapshotIds: {} },
      color: normalized.volumeColors[0],
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
        className="coinglass-dialog cg-visual-dialog cg-visual-dialog-wide"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>CoinGlass · визуальная настройка</DialogTitle>
        </DialogHeader>
        <IndicatorPresets
          instance={{ ...base, params: coinglassParams(params) }}
          onLoad={(next) => {
            setBase(next);
            setParams(coinglassParams(next.params));
            setError("");
          }}
        />
        <div className="cg-source">
          {snapshot ? (
            <p>
              <b>
                {snapshot.asset} · {snapshot.rangeDays} дн.
              </b>{" "}
              · снимок {new Date(snapshot.collectedAt).toLocaleString("ru-RU")}{" "}
              · цена {Number(snapshot.currentPrice).toLocaleString("en-US")} USD
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
          <div className="cg-load-controls">
            <label className="cg-load-period">
              Период сбора
              <Choice
                label="Период сбора уровней ликвидаций"
                value={String(params.rangeDays)}
                onChange={(value) =>
                  setParams((p) => ({ ...p, rangeDays: Number(value) }))
                }
                items={[1, 7, 14, 30, 90, 180, 365].map((days) => [
                  String(days),
                  days === 14 ? "2 недели" : `${days} дн.`,
                ])}
              />
            </label>
            <button
              className="button"
              disabled={working || !valid}
              onClick={() => {
                const next = { ...base, params: normalized };
                onApply(next);
                void state.run(next);
              }}
            >
              {working ? "Сбор выполняется…" : "Обновить данные CoinGlass"}
            </button>
          </div>
          {working && state.job?.params?.rangeDays !== undefined && (
            <p className="cg-help">
              Сейчас загружается период {state.job.params.rangeDays} дн.
              Выбранный период {params.rangeDays} дн. можно загрузить после
              завершения текущего сбора.
            </p>
          )}
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
              Интенсивности получены из данных CoinGlass; точность зависит от
              источника снимка. Максимум и пороги вычисляются по всей карте,
              независимо от масштаба. Цена снимка может отличаться от текущей
              цены инструмента.
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
              <Choice
                label="Относительно цены снимка"
                value={params.side}
                onChange={(value) =>
                  setParams((p) => ({
                    ...p,
                    side: value as CoinglassParams["side"],
                  }))
                }
                items={[
                  ["both", "С обеих сторон"],
                  ["above", "Выше цены"],
                  ["below", "Ниже цены"],
                ]}
              />
            </label>
            <details open>
              <summary>Оформление</summary>
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
              <label>
                <input
                  type="checkbox"
                  checked={normalized.showCumulativeVolume}
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      showCumulativeVolume: e.target.checked,
                    }))
                  }
                />{" "}
                Показывать кумулятивный объём на графике
                <Info
                  size={14}
                  aria-label="Справка о дельте кумулятивного объёма"
                  style={{
                    marginLeft: 6,
                    verticalAlign: "middle",
                    color: "var(--muted-foreground)",
                  }}
                >
                  <title>
                    Дельта = ликвидность выше текущей цены минус ликвидность
                    ниже неё в пределах отклонения курсора. Плюс означает, что
                    сверху объём больше; минус — что снизу больше.
                  </title>
                </Info>
              </label>
            </details>
            <details open>
              <summary>Уровни на графике: цвет и прозрачность</summary>
              <label>
                <input
                  type="checkbox"
                  checked={normalized.showLevels}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, showLevels: e.target.checked }))
                  }
                />{" "}
                Показывать цветные уровни на графике
              </label>
              <p className="cg-help">
                Цвета назначаются по логарифмическому объёму от минимального к
                максимальному на карте.
              </p>
              <p className="cg-help">
                Справа на графике отображается профиль накопленного объёма по
                ценовым уровням; сумма показана над профилем.
              </p>
              {(
                [
                  "Очень низкий",
                  "Низкий",
                  "Средний",
                  "Выше среднего",
                  "Высокий",
                  "Максимальный",
                ] as const
              ).map((label, index) => (
                <div className="cg-volume-tier" key={label}>
                  <span>{label} объём</span>
                  <input
                    type="color"
                    aria-label={`Цвет: ${label} объём`}
                    value={normalized.volumeColors[index]}
                    onChange={(e) =>
                      setParams((p) => ({
                        ...p,
                        volumeColors: p.volumeColors.map((color, i) =>
                          i === index ? e.target.value : color,
                        ) as CoinglassParams["volumeColors"],
                      }))
                    }
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    aria-label={`Прозрачность: ${label} объём`}
                    value={normalized.volumeOpacities[index]}
                    onChange={(e) =>
                      setParams((p) => ({
                        ...p,
                        volumeOpacities: p.volumeOpacities.map((opacity, i) =>
                          i === index ? Number(e.target.value) : opacity,
                        ) as CoinglassParams["volumeOpacities"],
                      }))
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    aria-label={`Прозрачность: ${label} объём, %`}
                    value={normalized.volumeOpacities[index]}
                    onChange={(e) =>
                      setParams((p) => ({
                        ...p,
                        volumeOpacities: p.volumeOpacities.map((opacity, i) =>
                          i === index
                            ? e.target.value === ""
                              ? NaN
                              : Number(e.target.value)
                            : opacity,
                        ) as CoinglassParams["volumeOpacities"],
                      }))
                    }
                  />
                </div>
              ))}
            </details>
            <details>
              <summary>Сбор и актуальность</summary>
              {field("requestLimit", "Лимит записей в запросе", 1, 1440, 1)}
              <p className="cg-help">
                Период и лимит записей применяются при запуске / обновлении
                парсинга. Для сохранённого снимка нужен новый сбор. Это лимит
                запроса; число полученных ценовых уровней может отличаться.
                {snapshot &&
                  ` Текущий снимок: ${snapshot.rangeDays} дн.${snapshot.requestLimit ? `, лимит ${snapshot.requestLimit}` : ""}.`}
              </p>
              {field("staleHours", "Считать устаревшим через, ч", 1, 720, 1)}
            </details>
            <details>
              <summary>Оформление кумулятивного объёма</summary>
              <label className="settings-row">
                Область, px
                <input
                  type="number"
                  min="140"
                  max="700"
                  step="10"
                  value={params.cumulativeWidth}
                  onChange={(event) =>
                    setParams((p) => ({
                      ...p,
                      cumulativeWidth: Math.max(
                        140,
                        Math.min(700, Number(event.target.value) || 140),
                      ),
                    }))
                  }
                />
              </label>
              <input
                aria-label="Ширина области кумулятивного объёма"
                type="range"
                min="140"
                max="700"
                step="10"
                value={params.cumulativeWidth}
                onChange={(event) =>
                  setParams((p) => ({
                    ...p,
                    cumulativeWidth: Number(event.target.value),
                  }))
                }
              />
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
