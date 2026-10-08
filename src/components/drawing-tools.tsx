"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { IChartApi, ISeriesApi, Logical } from "lightweight-charts";
import {
  drawingTools,
  logicalAtTime,
  readDrawings,
  timeAtLogical,
  type Drawing,
  type DrawingTool,
  type DrawingPoint,
} from "../domain/drawings";
import { candleIntervals, type Candle, type Timeframe } from "../domain/market";
import { DrawingsRenderer } from "./drawings-renderer";
import { useStored } from "../hooks/use-resource";
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
  const [tool, setTool] = useState<DrawingTool | "navigate" | "select">(
    "navigate",
  );
  const [color, setColor] = useState("#ffffff");
  const [width, setWidth] = useState<1 | 2 | 3 | 4>(2);
  const [textValue, setTextValue] = useState("Текст");
  const [selectedId, setSelectedId] = useState<string>();
  const [storedDrawings, setStoredDrawings] = useStored<Drawing[]>(`vector.drawings.v1:${symbol}:${timeframe}`, []);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [draft, setDraft] = useState<Drawing>();
  const active = useRef<Drawing | undefined>(undefined);
  const pointer = useRef<number | null>(null);
  const drag = useRef<
    { id: string; origin: DrawingPoint; points: DrawingPoint[] } | undefined
  >(undefined);
  const renderer = useRef(new DrawingsRenderer());
  const key = `vector.drawings.v1:${symbol}:${timeframe}`;
  useEffect(() => {
    setDrawings(readDrawings(storedDrawings));
    setReady(true);
  }, [key, storedDrawings]);
  useEffect(() => {
    if (!ready) return;
    try {
      setStoredDrawings(drawings);
    } catch {
      setStorageError(
        "Разметка доступна в этой вкладке, но не сохранена: хранилище недоступно или заполнено.",
      );
    }
  }, [drawings, ready, setStoredDrawings]);
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
      selectedId,
    );
  }, [drawings, draft, bars, timeframe, selectedId]);
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
        setSelectedId(undefined);
      }
      if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
        const target = e.target as HTMLElement | null;
        if (
          target?.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")
        )
          return;
        e.preventDefault();
        setDrawings((prev) => prev.filter((d) => d.id !== selectedId));
        setSelectedId(undefined);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [selectedId]);
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
    if (tool === "select") {
      if (e.button !== 0 || pointer.current !== null) return;
      const p = point(e);
      if (!p) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = [...drawings].reverse().find((d) => {
        const projected = d.points.map((anchor) => ({
          x: api.chart
            .timeScale()
            .logicalToCoordinate(
              logicalAtTime(
                bars,
                anchor.time,
                candleIntervals[timeframe],
              ) as Logical,
            ),
          y: api.series.priceToCoordinate(anchor.price),
        }));
        if (projected.some((v) => v.x === null || v.y === null)) return false;
        const pts = projected as { x: number; y: number }[];
        if (d.tool === "horizontal") return Math.abs(y - pts[0].y) < 9;
        if (d.tool === "vertical") return Math.abs(x - pts[0].x) < 9;
        if (d.tool === "text")
          return (
            Math.abs(y - pts[0].y) < 16 &&
            x >= pts[0].x - 8 &&
            x <= pts[0].x + Math.max(50, (d.text ?? "Текст").length * 8)
          );
        if (d.tool === "rectangle" || d.tool === "volume-profile") {
          const [a, b] = pts;
          return (
            x >= Math.min(a.x, b.x) - 8 &&
            x <= Math.max(a.x, b.x) + 8 &&
            y >= Math.min(a.y, b.y) - 8 &&
            y <= Math.max(a.y, b.y) + 8
          );
        }
        const segmentDistance = (
          a: { x: number; y: number },
          b: { x: number; y: number },
        ) => {
          const dx = b.x - a.x,
            dy = b.y - a.y;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1),
            ),
          );
          return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
        };
        if (d.tool === "brush")
          return pts.slice(1).some((v, i) => segmentDistance(pts[i], v) < 9);
        if (d.tool === "fibonacci") {
          const [a, b] = pts;
          return (
            x >= Math.min(a.x, b.x) - 6 &&
            x <= Math.max(a.x, b.x) + 6 &&
            [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].some(
              (ratio) => Math.abs(y - (a.y + (b.y - a.y) * ratio)) < 7,
            )
          );
        }
        return pts.some((v) => Math.hypot(v.x - x, v.y - y) < 11);
      });
      setSelectedId(hit?.id);
      if (hit) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        pointer.current = e.pointerId;
        drag.current = { id: hit.id, origin: p, points: hit.points };
      }
      return;
    }
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
      width,
      points: [p],
      ...(tool === "text" ? { text: textValue } : {}),
      ...(tool === "volume-profile"
        ? {
            profile: {
              rows: 150,
              valueArea: 70,
              showPoc: true,
              showValueArea: true,
            },
          }
        : {}),
    };
    setDraft(active.current);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (tool === "select" && pointer.current === e.pointerId && drag.current) {
      const p = point(e);
      if (!p) return;
      const { id, origin, points } = drag.current;
      const dt = p.time - origin.time;
      const dp = p.price - origin.price;
      setDrawings((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                points: points.map((v) => ({
                  time: v.time + dt,
                  price: v.price + dp,
                })),
              }
            : d,
        ),
      );
      return;
    }
    const d = active.current;
    if (!d || pointer.current !== e.pointerId) return;
    const p = point(e);
    if (!p) return;
    const points =
      d.tool === "brush"
        ? d.points.length < 2000
          ? [...d.points, p]
          : d.points
        : d.tool === "horizontal" || d.tool === "vertical" || d.tool === "text"
          ? [p]
          : [d.points[0], p];
    active.current = { ...d, points };
    setDraft(active.current);
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (pointer.current !== e.pointerId) return;
    if (tool === "select") {
      move(e);
      pointer.current = null;
      drag.current = undefined;
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      return;
    }
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
        <button
          type="button"
          aria-pressed={tool === "select"}
          onClick={() => {
            cancel();
            setTool("select");
          }}
        >
          Выбрать
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
        <label>
          Толщина{" "}
          <select
            aria-label="Толщина новых объектов"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value) as 1 | 2 | 3 | 4)}
          >
            {[1, 2, 3, 4].map((v) => (
              <option key={v} value={v}>
                {v}px
              </option>
            ))}
          </select>
        </label>
        {tool === "text" && (
          <label>
            Текст{" "}
            <input
              value={textValue}
              maxLength={100}
              onChange={(e) => setTextValue(e.target.value)}
            />
          </label>
        )}
        <button
          type="button"
          disabled={!drawings.length}
          onClick={() => setDrawings((prev) => prev.slice(0, -1))}
        >
          Отменить добавление
        </button>
      </div>
      {storageError && <p role="status">{storageError}</p>}
      {drawings.length >= 200 && (
        <p role="status">Достигнут лимит 200 объектов. Удалите ненужные.</p>
      )}
      <details>
        <summary>Объекты ({drawings.length})</summary>
        <ul>
          {drawings.map((d, i) => (
            <li key={d.id}>
              <button
                type="button"
                className={selectedId === d.id ? "drawing-selected" : ""}
                onClick={() => {
                  setSelectedId(d.id);
                  setTool("select");
                }}
                style={{ color: d.color }}
              >
                {i + 1}. {drawingTools[d.tool]}
              </button>
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
              <label>
                Толщина{" "}
                <select
                  aria-label={`Толщина объекта ${i + 1}`}
                  value={d.width ?? 2}
                  onChange={(e) =>
                    setDrawings((prev) =>
                      prev.map((x) =>
                        x.id === d.id
                          ? {
                              ...x,
                              width: Number(e.target.value) as 1 | 2 | 3 | 4,
                            }
                          : x,
                      ),
                    )
                  }
                >
                  {[1, 2, 3, 4].map((v) => (
                    <option key={v} value={v}>
                      {v}px
                    </option>
                  ))}
                </select>
              </label>
              {d.tool === "horizontal" && (
                <label>
                  Цена{" "}
                  <input
                    type="number"
                    value={d.points[0].price}
                    onChange={(e) =>
                      setDrawings((prev) =>
                        prev.map((x) =>
                          x.id === d.id
                            ? {
                                ...x,
                                points: [
                                  {
                                    ...x.points[0],
                                    price: Number(e.target.value),
                                  },
                                ],
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
              )}
              {d.tool === "horizontal" && (
                <label>
                  <input
                    type="checkbox"
                    checked={d.showPrice !== false}
                    onChange={(e) =>
                      setDrawings((prev) =>
                        prev.map((x) =>
                          x.id === d.id
                            ? { ...x, showPrice: e.target.checked }
                            : x,
                        ),
                      )
                    }
                  />{" "}
                  Цена на линии
                </label>
              )}
              {d.tool === "text" && (
                <label>
                  Текст{" "}
                  <input
                    value={d.text ?? "Текст"}
                    maxLength={100}
                    onChange={(e) =>
                      setDrawings((prev) =>
                        prev.map((x) =>
                          x.id === d.id ? { ...x, text: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
              )}
              <button
                type="button"
                aria-label={`Удалить объект ${i + 1}`}
                onClick={() => {
                  setDrawings((prev) => prev.filter((x) => x.id !== d.id));
                  if (selectedId === d.id) setSelectedId(undefined);
                }}
              >
                Удалить
              </button>
              {d.tool === "volume-profile" && (
                <details>
                  <summary>Настройки профиля</summary>
                  <label>
                    Количество строк
                    <input
                      type="number"
                      min="10"
                      max="200"
                      value={d.profile?.rows ?? 150}
                      onChange={(e) =>
                        setDrawings((prev) =>
                          prev.map((x) =>
                            x.id === d.id
                              ? {
                                  ...x,
                                  profile: {
                                    rows: Math.max(
                                      10,
                                      Math.min(
                                        200,
                                        Number(e.target.value) || 10,
                                      ),
                                    ),
                                    valueArea: x.profile?.valueArea ?? 70,
                                    showPoc: x.profile?.showPoc ?? true,
                                    showValueArea:
                                      x.profile?.showValueArea ?? true,
                                  },
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Объём области стоимости, %
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={d.profile?.valueArea ?? 70}
                      onChange={(e) =>
                        setDrawings((prev) =>
                          prev.map((x) =>
                            x.id === d.id
                              ? {
                                  ...x,
                                  profile: {
                                    rows: x.profile?.rows ?? 150,
                                    valueArea: Math.max(
                                      1,
                                      Math.min(
                                        100,
                                        Number(e.target.value) || 1,
                                      ),
                                    ),
                                    showPoc: x.profile?.showPoc ?? true,
                                    showValueArea:
                                      x.profile?.showValueArea ?? true,
                                  },
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={d.profile?.showPoc ?? true}
                      onChange={(e) =>
                        setDrawings((prev) =>
                          prev.map((x) =>
                            x.id === d.id
                              ? {
                                  ...x,
                                  profile: {
                                    rows: x.profile?.rows ?? 150,
                                    valueArea: x.profile?.valueArea ?? 70,
                                    showPoc: e.target.checked,
                                    showValueArea:
                                      x.profile?.showValueArea ?? true,
                                  },
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    Показывать POC
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={d.profile?.showValueArea ?? true}
                      onChange={(e) =>
                        setDrawings((prev) =>
                          prev.map((x) =>
                            x.id === d.id
                              ? {
                                  ...x,
                                  profile: {
                                    rows: x.profile?.rows ?? 150,
                                    valueArea: x.profile?.valueArea ?? 70,
                                    showPoc: x.profile?.showPoc ?? true,
                                    showValueArea: e.target.checked,
                                  },
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    Показывать VAH / VAL
                  </label>
                </details>
              )}
            </li>
          ))}
        </ul>
      </details>
      {tool !== "navigate" &&
        createPortal(
          <div
            className={
              tool === "select" ? "drawing-input is-select" : "drawing-input"
            }
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
