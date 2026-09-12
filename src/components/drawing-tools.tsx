"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import {
  drawingTools,
  readDrawings,
  timeAtLogical,
  type Drawing,
  type DrawingTool,
  type DrawingPoint,
} from "../domain/drawings";
import { candleIntervals, type Candle, type Timeframe } from "../domain/market";
import { DrawingsRenderer } from "./drawings-renderer";
export interface DrawingChart {
  disposed?: boolean;
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  container: HTMLElement;
}
export function DrawingTools({
  api,
  bars,
  symbol,
  timeframe,
}: {
  api: DrawingChart;
  bars: Candle[];
  symbol: string;
  timeframe: Timeframe;
}) {
  const [tool, setTool] = useState<DrawingTool | "navigate">("navigate");
  const [color, setColor] = useState("#99a5ff");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [draft, setDraft] = useState<Drawing>();
  const active = useRef<Drawing | undefined>(undefined);
  const pointer = useRef<number | null>(null);
  const renderer = useRef(new DrawingsRenderer());
  const key = `vector.drawings.v1:${symbol}:${timeframe}`;
  useEffect(() => {
    try {
      setDrawings(readDrawings(JSON.parse(localStorage.getItem(key) || "[]")));
    } catch {
      setStorageError("Не удалось прочитать сохранённую разметку.");
    }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify(drawings));
    } catch {
      setStorageError(
        "Разметка доступна в этой вкладке, но не сохранена: хранилище недоступно или заполнено.",
      );
    }
  }, [drawings, ready, key]);
  useEffect(() => {
    const r = renderer.current;
    if (api.disposed) return;
    api.series.attachPrimitive(r);
    return () => {
      if (!api.disposed) api.series.detachPrimitive(r);
      else r.detached();
    };
  }, [api]);
  useEffect(() => {
    renderer.current.configure(
      draft ? [...drawings, draft] : drawings,
      bars,
      candleIntervals[timeframe],
    );
  }, [drawings, draft, bars, timeframe]);
  function cancel() {
    active.current = undefined;
    pointer.current = null;
    setDraft(undefined);
  }
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancel();
        setTool("navigate");
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  function point(e: PointerEvent<HTMLDivElement>): DrawingPoint | undefined {
    if (!bars.length) return;
    const rect = e.currentTarget.getBoundingClientRect(),
      x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    if (
      x < 0 ||
      x > api.chart.timeScale().width() ||
      y < 0 ||
      y > api.series.getPane().getHeight()
    )
      return;
    const logical = api.chart.timeScale().coordinateToLogical(x),
      price = api.series.coordinateToPrice(y);
    if (logical === null || price === null) return;
    return {
      time: timeAtLogical(bars, logical, candleIntervals[timeframe]),
      price,
    };
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (
      tool === "navigate" ||
      e.button !== 0 ||
      pointer.current !== null ||
      drawings.length >= 200
    )
      return;
    const p = point(e);
    if (!p) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = e.pointerId;
    active.current = {
      id:
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      tool,
      color,
      points: [p],
    };
    setDraft(active.current);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = active.current;
    if (!d || pointer.current !== e.pointerId) return;
    const p = point(e);
    if (!p) return;
    const points =
      d.tool === "brush"
        ? d.points.length < 2000
          ? [...d.points, p]
          : d.points
        : d.tool === "horizontal" || d.tool === "vertical"
          ? [p]
          : [d.points[0], p];
    active.current = { ...d, points };
    setDraft(active.current);
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (pointer.current !== e.pointerId) return;
    move(e);
    const d = active.current;
    if (d && readDrawings([d]).length) setDrawings((prev) => [...prev, d]);
    cancel();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return (
    <div className="drawing-toolbar">
      <div
        className="drawing-actions"
        role="group"
        aria-label="Инструменты рисования"
      >
        <button
          type="button"
          aria-pressed={tool === "navigate"}
          onClick={() => {
            cancel();
            setTool("navigate");
          }}
        >
          Навигация
        </button>
        {Object.entries(drawingTools).map(([id, label]) => (
          <button
            type="button"
            key={id}
            disabled={!ready || !bars.length}
            aria-pressed={tool === id}
            onClick={() => {
              cancel();
              setTool(id as DrawingTool);
            }}
          >
            {label}
          </button>
        ))}
        <label>
          Цвет{" "}
          <input
            type="color"
            aria-label="Цвет новых элементов"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!drawings.length}
          onClick={() => setDrawings((prev) => prev.slice(0, -1))}
        >
          Отменить добавление
        </button>
      </div>
      <p>
        {tool === "navigate"
          ? "Выберите инструмент для разметки графика."
          : "Нажмите и перетащите в области свечей. Esc — отмена и возврат к навигации."}{" "}
        Сохранение: {symbol}, {timeframe}.
      </p>
      {storageError && <p role="status">{storageError}</p>}
      {drawings.length >= 200 && (
        <p role="status">Достигнут лимит 200 объектов. Удалите ненужные.</p>
      )}
      <details>
        <summary>Объекты ({drawings.length})</summary>
        <ul>
          {drawings.map((d, i) => (
            <li key={d.id}>
              <span style={{ color: d.color }}>
                {i + 1}. {drawingTools[d.tool]}
              </span>
              <input
                type="color"
                aria-label={`Цвет объекта ${i + 1}`}
                value={d.color}
                onChange={(e) =>
                  setDrawings((prev) =>
                    prev.map((x) =>
                      x.id === d.id ? { ...x, color: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label={`Удалить объект ${i + 1}`}
                onClick={() =>
                  setDrawings((prev) => prev.filter((x) => x.id !== d.id))
                }
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      </details>
      {tool !== "navigate" &&
        createPortal(
          <div
            className="drawing-input"
            aria-label="Область рисования"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={cancel}
            onLostPointerCapture={cancel}
          />,
          api.container,
        )}
    </div>
  );
}
