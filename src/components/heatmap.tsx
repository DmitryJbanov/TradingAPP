"use client";
import { useEffect, useRef } from "react";
import type { useHeatmap } from "../hooks/use-heatmap";
import { heatmapColor, type HeatmapParams } from "../domain/heatmap";
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
            365 дней. Настройки сохраняются сразу.
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
}: {
  state: State;
  openSettings: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { data, model, settings, visible } = state;
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
    const cw = PW / (model.lastX + 1),
      ch = PH / data.y.length;
    for (const [x, y, value] of model.visible) {
      const strength = model.intensity(value);
      const color =
        settings.threshold === 1
          ? 1
          : Math.max(
              0,
              (strength - settings.threshold) / (1 - settings.threshold),
            );
      ctx.fillStyle = heatmapColor(color, settings.scheme);
      ctx.fillRect(
        L + x * cw,
        T + (data.y.length - 1 - y) * ch,
        Math.max(1, cw),
        Math.max(1, ch),
      );
    }
    ctx.fillStyle = "#dce2ee";
    ctx.font = "13px system-ui";
    for (let i = 0; i < 6; i++) {
      const yi = Math.round((i * (data.y.length - 1)) / 5);
      ctx.fillText(
        data.y[yi].toLocaleString("en-US", { maximumFractionDigits: 8 }),
        4,
        T + (data.y.length - 1 - yi) * ch + 5,
      );
      ctx.fillText(
        String(Math.round((i * model.lastX) / 5)),
        L + (i * PW) / 5 - 10,
        H - 28,
      );
    }
    ctx.fillText("Цена, USD", 4, 14);
    ctx.fillText("Индекс времени CoinGlass →", L, H - 5);
  }, [data, model, settings.scheme, settings.threshold, visible]);
  if (!state.instance || !state.visible) return null;
  return (
    <section className="heatmap-panel" aria-label="CoinGlass Heatmap">
      <div className="section-heading">
        <h2>CoinGlass Heatmap · Model 3 · 365d</h2>
        <button className="button" onClick={openSettings}>
          Настройки карты
        </button>
      </div>
      <div className="heatmap-actions">
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
      {state.job && <p role="status">{state.job.message}</p>}
      {state.data ? (
        <>
          <p className="muted">
            {state.data.symbol} ·{" "}
            {state.imported
              ? "Импортированный JSON (до перезагрузки страницы)"
              : `Снимок ${state.data.collectedAt ? new Date(state.data.collectedAt).toLocaleString("ru-RU") : ""}`}{" "}
            · {state.data.liquidation_levels.length.toLocaleString()} ячеек
          </p>
          <canvas
            ref={canvas}
            width={1200}
            height={440}
            aria-label={`Карта ликвидаций ${state.data.symbol}: цена и индекс времени`}
          />
          <p className="muted">
            Уровни на основном графике — сильнейшие ячейки последнего среза
            карты. Исторические ячейки показаны по исходным индексам CoinGlass.
          </p>
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
