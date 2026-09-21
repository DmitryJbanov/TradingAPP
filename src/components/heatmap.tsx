"use client";
import { useEffect, useRef, useState } from "react";
import type { useHeatmap } from "../hooks/use-heatmap";
import {
  heatmapColor,
  heatmapPriceIndex,
  heatmapRanges,
  heatmapRangeLabels,
  heatmapFullView,
  panHeatmap,
  zoomHeatmap,
  type HeatmapView,
  type HeatmapParams,
} from "../domain/heatmap";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
type State = ReturnType<typeof useHeatmap>;

export function HeatmapSettings({
  state,
  onChange,
  onClose,
}: {
  state: State;
  onChange: (params: HeatmapParams) => void;
  onClose: () => void;
}) {
  const p = state.settings;
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="settings-dialog">
        <DialogHeader>
          <DialogTitle>CoinGlass Heatmap · Model 3</DialogTitle>
          <DialogDescription>
            Настройки сохраняются сразу. Для нового периода загрузите карту
            заново.
          </DialogDescription>
        </DialogHeader>
        <label className="settings-row">
          Порог {Math.round(p.threshold * 100)}%
          <input
            type="range"
            min="0"
            max="100"
            value={p.threshold * 100}
            onChange={(e) =>
              onChange({ ...p, threshold: Number(e.target.value) / 100 })
            }
          />
        </label>
        <label className="settings-row">
          Шкала
          <select
            value={p.scale}
            onChange={(e) =>
              onChange({
                ...p,
                scale: e.target.value as HeatmapParams["scale"],
              })
            }
          >
            <option value="log">Логарифмическая</option>
            <option value="linear">Линейная</option>
            <option value="percentile">Перцентили</option>
          </select>
        </label>
        <label className="settings-row">
          Цвета
          <select
            value={p.scheme}
            onChange={(e) =>
              onChange({
                ...p,
                scheme: e.target.value as HeatmapParams["scheme"],
              })
            }
          >
            <option value="coinglass">CoinGlass</option>
            <option value="fire">Огонь</option>
            <option value="ice">Лёд</option>
            <option value="mono">Монохром</option>
          </select>
        </label>
        <label className="settings-row">
          Свечи на тепловой карте
          <input
            type="checkbox"
            checked={p.showCandles}
            onChange={(e) => onChange({ ...p, showCandles: e.target.checked })}
          />
        </label>
        <label className="settings-row">
          Уровни последнего среза на графике
          <input
            type="checkbox"
            checked={p.showLevels}
            onChange={(e) => onChange({ ...p, showLevels: e.target.checked })}
          />
        </label>
        <label className="settings-row">
          Количество уровней
          <input
            type="number"
            min="1"
            max="50"
            value={p.limit}
            onChange={(e) =>
              onChange({
                ...p,
                limit: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
              })
            }
          />
        </label>
        <button className="button" onClick={onClose}>
          Готово
        </button>
      </DialogContent>
    </Dialog>
  );
}

export function HeatmapPanel({
  state,
  openSettings,
  onChange,
}: {
  state: State;
  openSettings: () => void;
  onChange: (params: HeatmapParams) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { data, model, settings, visible } = state;
  const [navigation, setNavigation] = useState({ data, view: heatmapFullView });
  const view = navigation.data === data ? navigation.view : heatmapFullView;
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    view: HeatmapView;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const changeView = (update: (current: HeatmapView) => HeatmapView) =>
    setNavigation((previous) => ({
      data,
      view: update(previous.data === data ? previous.view : heatmapFullView),
    }));
  useEffect(() => {
    const element = canvas.current;
    if (!element || !visible || !data) return;
    const wheel = (event: WheelEvent) => {
      const rect = element.getBoundingClientRect();
      const x = (((event.clientX - rect.left) * 1200) / rect.width - 95) / 1080;
      const y = (((event.clientY - rect.top) * 440) / rect.height - 20) / 370;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 440 : 1);
      setNavigation((previous) => ({
        data,
        view: zoomHeatmap(
          previous.data === data ? previous.view : heatmapFullView,
          Math.exp(Math.max(-1, Math.min(1, delta * 0.002))),
          x,
          y,
        ),
      }));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [data, visible]);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !data || !model || !visible) return;
    const W = 1200,
      H = 440,
      L = 95,
      T = 20,
      PW = 1080,
      PH = 370;
    ctx.fillStyle = "#12141c";
    ctx.fillRect(0, 0, W, H);
    const xStart = view.x * model.columns,
      yStart = view.y * data.y.length;
    const cw = PW / (model.columns * view.size),
      ch = PH / (data.y.length * view.size);
    ctx.save();
    ctx.beginPath();
    ctx.rect(L, T, PW, PH);
    ctx.clip();
    for (const [x, y, value] of model.visible) {
      const screenX = L + (x - xStart) * cw;
      const screenY = T + (data.y.length - 1 - y - yStart) * ch;
      if (
        screenX + cw < L ||
        screenX > L + PW ||
        screenY + ch < T ||
        screenY > T + PH
      )
        continue;
      const strength = model.intensity(value);
      const color =
        settings.threshold === 1
          ? 1
          : Math.max(
              0,
              (strength - settings.threshold) / (1 - settings.threshold),
            );
      ctx.fillStyle = heatmapColor(color, settings.scheme);
      ctx.fillRect(screenX, screenY, Math.max(1, cw), Math.max(1, ch));
    }
    if (settings.showCandles) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(L, T, PW, PH);
      ctx.clip();
      const priceY = (price: number) =>
        T +
        (data.y.length - 0.5 - heatmapPriceIndex(data.y, price) - yStart) * ch;
      for (const candle of data.candles) {
        const x = L + (candle.x + 0.5 - xStart) * cw;
        if (x + cw < L || x - cw > L + PW) continue;
        const open = priceY(candle.open),
          close = priceY(candle.close);
        const width = Math.max(1, Math.min(10, cw * 0.7));
        const top = Math.min(open, close),
          height = Math.max(1, Math.abs(open - close));
        const color = candle.close >= candle.open ? "#34d399" : "#fb7185";
        ctx.beginPath();
        ctx.moveTo(x, priceY(candle.high));
        ctx.lineTo(x, priceY(candle.low));
        ctx.strokeStyle = "#10131b";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillRect(x - width / 2, top, width, height);
        ctx.strokeStyle = "#10131b";
        ctx.strokeRect(x - width / 2, top, width, height);
      }
      ctx.restore();
    }
    ctx.restore();
    const candlesByX = new Map(data.candles.map((c) => [c.x, c]));
    ctx.fillStyle = "#dce2ee";
    ctx.font = "13px system-ui";
    for (let i = 0; i < 6; i++) {
      const row = Math.max(
        0,
        Math.min(
          data.y.length - 1,
          data.y.length - 0.5 - yStart - (i / 5) * data.y.length * view.size,
        ),
      );
      const yi = Math.floor(row);
      const price =
        data.y[yi] + (row - yi) * ((data.y[yi + 1] ?? data.y[yi]) - data.y[yi]);
      ctx.fillText(
        price.toLocaleString("en-US", { maximumFractionDigits: 8 }),
        4,
        T + (i * PH) / 5 + 5,
      );
      const xi = Math.max(
        0,
        Math.min(
          model.columns - 1,
          Math.floor(xStart + (i / 5) * model.columns * view.size),
        ),
      );
      const candle = candlesByX.get(xi);
      ctx.textAlign = i === 0 ? "left" : i === 5 ? "right" : "center";
      ctx.fillText(
        candle
          ? new Date(candle.time * 1000).toLocaleString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : String(xi),
        L + (i * PW) / 5,
        H - 28,
      );
      ctx.textAlign = "left";
    }
    ctx.fillText("Цена, USD", 4, 14);
    ctx.fillText(
      data.candles.length ? "Время CoinGlass →" : "Индекс времени CoinGlass →",
      L,
      H - 5,
    );
  }, [
    data,
    model,
    settings.scheme,
    settings.threshold,
    settings.showCandles,
    visible,
    view,
  ]);
  if (!state.instance || !state.visible) return null;
  return (
    <section className="heatmap-panel" aria-label="CoinGlass Heatmap">
      <div className="section-heading">
        <h2>CoinGlass Heatmap · Model 3</h2>
        <button className="button" onClick={openSettings}>
          Настройки карты
        </button>
      </div>
      <div className="heatmap-actions">
        <label>
          Период{" "}
          <select
            aria-label="Период Heatmap Model 3"
            value={settings.range}
            disabled={state.busy}
            onChange={(e) =>
              onChange({
                ...settings,
                range: e.target.value as HeatmapParams["range"],
              })
            }
          >
            {heatmapRanges.map((range) => (
              <option key={range} value={range}>
                {heatmapRangeLabels[range]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          disabled={state.busy}
          onClick={() => void state.run()}
        >
          {state.busy ? "Сбор карты…" : "Загрузить карту CoinGlass"}
        </button>
        <label>
          Импорт JSON
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void state.importFile(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {state.error && <p role="alert">{state.error}</p>}
      {state.job && (
        <p role={state.job.state === "error" ? "alert" : "status"}>
          {state.job.message}
        </p>
      )}
      {data && data.range !== settings.range && (
        <p className="muted">
          Выбран другой период. Загрузите карту заново; ниже показан предыдущий
          снимок за {heatmapRangeLabels[data.range]}.
        </p>
      )}
      {state.data ? (
        <>
          <p className="muted">
            {state.data.symbol} · {heatmapRangeLabels[state.data.range]} ·{" "}
            {state.imported
              ? "Импортированный JSON (до перезагрузки страницы)"
              : `Снимок ${state.data.collectedAt ? new Date(state.data.collectedAt).toLocaleString("ru-RU") : ""}`}{" "}
            · {state.data.liquidation_levels.length.toLocaleString()} ячеек
          </p>
          <div className="heatmap-actions">
            <button
              className="button"
              aria-label="Приблизить карту"
              onClick={() => changeView((v) => zoomHeatmap(v, 0.7))}
            >
              +
            </button>
            <button
              className="button"
              aria-label="Отдалить карту"
              onClick={() => changeView((v) => zoomHeatmap(v, 1 / 0.7))}
            >
              −
            </button>
            <button
              className="button"
              onClick={() => changeView(() => heatmapFullView)}
            >
              Вся карта
            </button>
            <span>Масштаб: {(1 / view.size).toFixed(1)}×</span>
          </div>
          <p className="muted">
            Колесо — масштаб у курсора; перетаскивание — движение по времени и
            цене. Двойной щелчок — вся карта.
          </p>
          <canvas
            ref={canvas}
            width={1200}
            height={440}
            aria-label={`Карта ликвидаций ${state.data.symbol}: цена и индекс времени`}
            tabIndex={0}
            style={{
              touchAction: "none",
              cursor: dragging ? "grabbing" : "grab",
            }}
            onDoubleClick={() => changeView(() => heatmapFullView)}
            onPointerDown={(event) => {
              if (event.button !== 0 || drag.current) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const x = ((event.clientX - rect.left) * 1200) / rect.width;
              const y = ((event.clientY - rect.top) * 440) / rect.height;
              if (x < 95 || x > 1175 || y < 20 || y > 390) return;
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                view,
              };
              setDragging(true);
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              if (!start || start.id !== event.pointerId) return;
              const rect = event.currentTarget.getBoundingClientRect();
              changeView(() =>
                panHeatmap(
                  start.view,
                  ((-(event.clientX - start.x) * 1200) / rect.width / 1080) *
                    start.view.size,
                  ((-(event.clientY - start.y) * 440) / rect.height / 370) *
                    start.view.size,
                ),
              );
            }}
            onPointerUp={(event) => {
              if (drag.current?.id !== event.pointerId) return;
              drag.current = null;
              setDragging(false);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragging(false);
            }}
            onLostPointerCapture={() => {
              drag.current = null;
              setDragging(false);
            }}
            onKeyDown={(event) => {
              const moves: Record<string, [number, number]> = {
                ArrowLeft: [-0.1, 0],
                ArrowRight: [0.1, 0],
                ArrowUp: [0, -0.1],
                ArrowDown: [0, 0.1],
              };
              if (moves[event.key]) {
                event.preventDefault();
                const [x, y] = moves[event.key];
                changeView((v) => panHeatmap(v, x * v.size, y * v.size));
              } else if (["+", "=", "-", "Home"].includes(event.key)) {
                event.preventDefault();
                changeView((v) =>
                  event.key === "Home"
                    ? heatmapFullView
                    : zoomHeatmap(v, event.key === "-" ? 1 / 0.7 : 0.7),
                );
              }
            }}
          />
          <p className="muted">
            Уровни на основном графике — сильнейшие ячейки последнего среза
            карты. Исторические ячейки показаны по исходным индексам CoinGlass.
          </p>
          {settings.showCandles && !data?.candles.length && (
            <p className="warning">
              В этом снимке нет данных свечей. Загрузите карту CoinGlass заново.
            </p>
          )}
          {!state.model?.visible.length && (
            <p>Нет ячеек выше выбранного порога.</p>
          )}
        </>
      ) : (
        <p className="muted">
          Загрузите карту или импортируйте JSON, полученный скриптами
          coinglass_heatmap.
        </p>
      )}
    </section>
  );
}
