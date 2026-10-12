"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type PointerEvent,
} from "react";
import {
  MousePointer2,
  Brush,
  Minus,
  MoveVertical,
  Square,
  ListFilter,
  ChartColumn,
  Type,
  Undo2,
  Ruler,
} from "lucide-react";
import { createPortal } from "react-dom";
import type { IChartApi, ISeriesApi, Logical } from "lightweight-charts";
import {
  drawingTools,
  drawingHandles,
  resizedDrawingPoints,
  logicalAtTime,
  readDrawings,
  timeAtLogical,
  type Drawing,
  type DrawingTool,
  type DrawingPoint,
} from "../domain/drawings";
import { candleIntervals, type Candle, type Timeframe } from "../domain/market";
import { Choice } from "./controls";
import { DrawingsRenderer } from "./drawings-renderer";
import { useProfiles } from "./profile-provider";
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
  tickSize = 0.01,
}: {
  api: DrawingChart;
  bars: Candle[];
  symbol: string;
  timeframe: Timeframe;
  tickSize?: number;
}) {
  const profileId = useProfiles()?.active;
  useEffect(() => {
    undoStack.current = [];
    setUndoCount(0);
    cancel();
    setSelectedId(undefined);
    setObjectEditor(undefined);
  }, [profileId]);
  const [tool, setTool] = useState<DrawingTool | "navigate">("navigate");
  const [color, setColor] = useState("#ffffff");
  const [width, setWidth] = useState<1 | 2 | 3 | 4>(2);
  const [textValue, setTextValue] = useState("Текст");
  const [selectedId, setSelectedId] = useState<string>();
  const [objectEditor, setObjectEditor] = useState<{
    id: string;
    x: number;
    y: number;
  }>();
  const [storedDrawings, setStoredDrawings] = useStored<Drawing[]>(
    `vector.drawings.v1:${symbol}:${timeframe}`,
    [],
  );
  const drawings = useMemo(
    () => readDrawings(storedDrawings),
    [storedDrawings],
  );
  const undoStack = useRef<Drawing[][]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const setDrawings = useCallback<Dispatch<SetStateAction<Drawing[]>>>(
    (next) => {
      setStoredDrawings((previous) => {
        const before = readDrawings(previous);
        const after = readDrawings(
          typeof next === "function" ? next(before) : next,
        );
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          undoStack.current = [...undoStack.current.slice(-49), before];
          setUndoCount(undoStack.current.length);
        }
        return after;
      });
    },
    [setStoredDrawings],
  );
  function undo() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    cancel();
    setStoredDrawings(previous);
    setUndoCount(undoStack.current.length);
    setSelectedId(undefined);
    setObjectEditor(undefined);
  }
  const [draft, setDraft] = useState<Drawing>();
  const active = useRef<Drawing | undefined>(undefined);
  const pointer = useRef<number | null>(null);
  const measuring = useRef(false);
  const drag = useRef<
    { drawing: Drawing; origin: DrawingPoint; corner?: number } | undefined
  >(undefined);
  const [hoverId, setHoverId] = useState<string>();
  const renderer = useRef(new DrawingsRenderer());
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
    const onContextMenu = (event: MouseEvent) => {
      if (
        !bars.length ||
        (event.target instanceof Element &&
          event.target.closest(".frvp-context-panel"))
      )
        return;
      const rect = api.container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = hitAt(event);
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
      setTool("navigate");
      setSelectedId(hit.id);
      setObjectEditor({
        id: hit.id,
        x: Math.max(8, Math.min(x, rect.width - 390)),
        y: Math.max(
          8,
          Math.min(y, rect.height - Math.min(650, rect.height - 16)),
        ),
      });
    };
    api.container.addEventListener("contextmenu", onContextMenu);
    return () =>
      api.container.removeEventListener("contextmenu", onContextMenu);
  }, [api, drawings, bars, timeframe]);
  useEffect(() => {
    renderer.current.configure(
      draft ? [...drawings.filter((d) => d.id !== draft.id), draft] : drawings,
      bars,
      candleIntervals[timeframe],
      selectedId,
      hoverId,
      tickSize,
    );
  }, [drawings, draft, bars, timeframe, selectedId, hoverId, tickSize]);
  function cancel() {
    measuring.current = false;
    drag.current = undefined;
    active.current = undefined;
    pointer.current = null;
    setDraft(undefined);
  }
  function updateObject(id: string, values: Partial<Drawing>) {
    setDrawings((previous) =>
      previous.map((drawing) =>
        drawing.id === id ? { ...drawing, ...values } : drawing,
      ),
    );
  }
  function updateProfile(
    id: string,
    values: Partial<NonNullable<Drawing["profile"]>>,
  ) {
    setDrawings((previous) =>
      previous.map((drawing) =>
        drawing.id === id
          ? {
              ...drawing,
              profile: {
                rows: drawing.profile?.rows ?? 150,
                valueArea: drawing.profile?.valueArea ?? 70,
                showPoc: drawing.profile?.showPoc ?? true,
                showValueArea: drawing.profile?.showValueArea ?? true,
                autoExtendRight: drawing.profile?.autoExtendRight ?? false,
                ...drawing.profile,
                ...values,
              },
            }
          : drawing,
      ),
    );
  }
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")
      )
        return;
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        if (undoStack.current.length) {
          e.preventDefault();
          undo();
        }
        return;
      }
      if (e.key === "Escape") {
        cancel();
        setTool("navigate");
        setSelectedId(undefined);
        setObjectEditor(undefined);
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
  }, [selectedId, setStoredDrawings]);
  function point(e: {
    clientX: number;
    clientY: number;
  }): DrawingPoint | undefined {
    if (!bars.length) return;
    const rect = api.container.getBoundingClientRect(),
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
  function hitAt(e: { clientX: number; clientY: number }) {
    if (!point(e)) return undefined;
    const rect = api.container.getBoundingClientRect();
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    return [...drawings].reverse().find((d) => {
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
      if (
        (d.id === selectedId || d.id === hoverId) &&
        cornerAt(d, e) !== undefined
      )
        return true;
      if (d.tool === "horizontal") return Math.abs(y - pts[0].y) < 9;
      if (d.tool === "vertical") return Math.abs(x - pts[0].x) < 9;
      if (d.tool === "text")
        return (
          Math.abs(y - pts[0].y) < 16 &&
          x >= pts[0].x - 8 &&
          x <= pts[0].x + Math.max(50, (d.text ?? "Текст").length * 8)
        );
      if (d.tool === "rectangle") {
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
      if (d.tool === "volume-profile") {
        const [a, b] = pts;
        if (cornerAt(d, e) !== undefined) return true;
        const left = Math.min(a.x, b.x),
          right = Math.max(a.x, b.x),
          top = Math.min(a.y, b.y),
          bottom = Math.max(a.y, b.y);
        const nearFrame =
          segmentDistance({ x: left, y: top }, { x: right, y: top }) < 6 ||
          segmentDistance({ x: right, y: top }, { x: right, y: bottom }) < 6 ||
          segmentDistance({ x: right, y: bottom }, { x: left, y: bottom }) <
            6 ||
          segmentDistance({ x: left, y: bottom }, { x: left, y: top }) < 6;
        if (nearFrame) return true;
        const data = renderer.current.profileData(d);
        if (!data.max) return false;
        const price = api.series.coordinateToPrice(y);
        if (price === null) return false;
        const row = Math.max(
          0,
          Math.min(
            data.rows - 1,
            Math.floor(
              ((price - data.low) / (data.high - data.low)) * data.rows,
            ),
          ),
        );
        const y1 = api.series.priceToCoordinate(
            data.low + ((row + 1) / data.rows) * (data.high - data.low),
          ),
          y2 = api.series.priceToCoordinate(
            data.low + (row / data.rows) * (data.high - data.low),
          ),
          magnitude =
            d.profile?.volume === "delta"
              ? Math.abs(data.up[row] - data.down[row])
              : data.bins[row],
          maximum =
            d.profile?.volume === "delta"
              ? Math.max(...data.up.map((v, i) => Math.abs(v - data.down[i])))
              : data.max,
          rowWidth =
            (right - left) *
            ((d.profile?.widthPercent ?? 100) / 100) *
            (magnitude / (maximum || 1)),
          rowLeft = d.profile?.placement === "right" ? right - rowWidth : left;
        if (
          data.bins[row] > 0 &&
          y1 !== null &&
          y2 !== null &&
          x >= rowLeft - 5 &&
          x <= rowLeft + rowWidth + 5 &&
          y >= Math.min(y1, y2) - 4 &&
          y <= Math.max(y1, y2) + 4
        )
          return true;
        const lineEnd =
          d.profile?.extendLevels === true
            ? api.chart.timeScale().width()
            : right;
        const levelHit = (level: number) => {
          const levelY = api.series.priceToCoordinate(level);
          return (
            levelY !== null &&
            x >= left - 5 &&
            x <= lineEnd + 5 &&
            Math.abs(y - levelY) < 6
          );
        };
        if (
          d.profile?.showPoc !== false &&
          levelHit(
            data.low + ((data.poc + 0.5) / data.rows) * (data.high - data.low),
          )
        )
          return true;
        if (
          d.profile?.showValueArea !== false &&
          (levelHit(
            data.low + (data.vaLow / data.rows) * (data.high - data.low),
          ) ||
            levelHit(
              data.low +
                ((data.vaHigh + 1) / data.rows) * (data.high - data.low),
            ))
        )
          return true;
        return false;
      }
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
  }
  function cornerAt(drawing: Drawing, e: { clientX: number; clientY: number }) {
    const rect = api.container.getBoundingClientRect();
    const corners = drawingHandles(drawing);
    const index = corners.findIndex((p) => {
      const x = api.chart
        .timeScale()
        .logicalToCoordinate(
          logicalAtTime(bars, p.time, candleIntervals[timeframe]) as Logical,
        );
      const y = api.series.priceToCoordinate(p.price);
      return (
        x !== null &&
        y !== null &&
        Math.hypot(e.clientX - rect.left - x, e.clientY - rect.top - y) < 11
      );
    });
    return index < 0 ? undefined : index;
  }
  function profilePoints(
    start: DrawingPoint,
    end: DrawingPoint,
  ): DrawingPoint[] {
    const snap = (time: number) =>
      timeAtLogical(
        bars,
        Math.round(logicalAtTime(bars, time, candleIntervals[timeframe])),
        candleIntervals[timeframe],
      );
    const from = snap(start.time),
      to = snap(end.time);
    const range = bars.filter(
      (b) => b.time >= Math.min(from, to) && b.time <= Math.max(from, to),
    );
    const high = range.length
      ? Math.max(...range.map((b) => b.high))
      : Math.max(start.price, end.price);
    const low = range.length
      ? Math.min(...range.map((b) => b.low))
      : Math.min(start.price, end.price);
    return [
      { time: from, price: high },
      { time: to, price: low },
    ];
  }
  function down(e: PointerEvent<HTMLDivElement> | globalThis.PointerEvent) {
    if (
      e.button !== 0 ||
      pointer.current !== null ||
      (e.target as Element)?.closest(
        ".frvp-context-panel, .whale-chart-overlay",
      )
    )
      return;
    const p = point(e);
    if (!p) return;
    if (measuring.current) {
      e.preventDefault();
      e.stopPropagation();
      move(e);
      const measurement = active.current;
      cancel();
      setDraft(measurement);
      setTool("navigate");
      return;
    }
    if (e.shiftKey || tool === "ruler") {
      e.preventDefault();
      e.stopPropagation();
      setTool("ruler");
      measuring.current = true;
      drag.current = undefined;
      active.current = {
        id: "temporary-ruler",
        tool: "ruler",
        color: "#8899bb",
        points: [p, p],
      };
      setDraft(active.current);
      return;
    }
    if (tool === "navigate") {
      setDraft(undefined);
      const hit = hitAt(e);
      setSelectedId(hit?.id);
      setObjectEditor(undefined);
      if (hit) {
        e.preventDefault();
        e.stopPropagation();
        api.container.setPointerCapture(e.pointerId);
        pointer.current = e.pointerId;
        drag.current = { drawing: hit, origin: p, corner: cornerAt(hit, e) };
        active.current = hit;
      }
      return;
    }
    if (drawings.length >= 200) return;
    e.preventDefault();
    if (active.current) {
      move(e);
      const d = active.current;
      if (readDrawings([d]).length) {
        setDrawings((prev) => [...prev, d]);
        setSelectedId(d.id);
      }
      cancel();
      setTool("navigate");
      return;
    }
    active.current = {
      id:
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      tool,
      color,
      width,
      points: tool === "volume-profile" ? profilePoints(p, p) : [p],
      ...(tool === "text" ? { text: textValue } : {}),
      ...(tool === "volume-profile"
        ? {
            profile: {
              rows: 150,
              valueArea: 70,
              showPoc: true,
              showValueArea: true,
              autoExtendRight: false,
            },
          }
        : {}),
    };
    setDraft(active.current);
  }
  function move(e: PointerEvent<HTMLDivElement> | globalThis.PointerEvent) {
    if (tool === "navigate" && pointer.current === null) {
      const hit = hitAt(e);
      setHoverId(hit?.id);
      api.container.style.cursor = hit
        ? cornerAt(hit, e) === undefined
          ? "move"
          : "nwse-resize"
        : "";
    }
    if (pointer.current === e.pointerId && drag.current) {
      const p = point(e);
      if (!p) return;
      const { drawing, origin, corner } = drag.current;
      let points: DrawingPoint[];
      if (corner !== undefined) {
        points = resizedDrawingPoints(drawing, corner, p);
      } else {
        points = drawing.points.map((v) => ({
          time: v.time + p.time - origin.time,
          price: v.price + p.price - origin.price,
        }));
      }
      active.current = { ...drawing, points };
      setDraft(active.current);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const d = active.current;
    if (!d) return;
    const p = point(e);
    if (!p) return;
    const points =
      d.tool === "volume-profile"
        ? profilePoints(d.points[0], p)
        : d.tool === "brush"
          ? d.points.length < 2000
            ? [...d.points, p]
            : d.points
          : d.tool === "horizontal" ||
              d.tool === "vertical" ||
              d.tool === "text"
            ? [p]
            : [d.points[0], p];
    active.current = { ...d, points };
    setDraft(active.current);
  }
  function up(e: PointerEvent<HTMLDivElement> | globalThis.PointerEvent) {
    if (pointer.current !== e.pointerId) return;
    move(e);
    const d = active.current;
    if (d && readDrawings([d]).length) {
      if (drag.current)
        setDrawings((prev) => prev.map((old) => (old.id === d.id ? d : old)));
      else setDrawings((prev) => [...prev, d]);
      setTool("navigate");
      setSelectedId(d.id);
    }
    cancel();
    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId))
      target.releasePointerCapture(e.pointerId);
  }
  useEffect(() => {
    if (tool !== "navigate" || api.disposed) return;
    const container = api.container;
    // Leave chart navigation untouched unless a drawing is under the pointer.
    const mouseDown = (e: MouseEvent) => {
      if (drag.current || measuring.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const leave = () => {
      if (pointer.current === null) {
        setHoverId(undefined);
        container.style.cursor = "";
      }
    };
    container.addEventListener("pointerdown", down, true);
    container.addEventListener("pointermove", move, true);
    container.addEventListener("pointerup", up, true);
    container.addEventListener("mousedown", mouseDown, true);
    container.addEventListener("pointercancel", cancel);
    container.addEventListener("pointerleave", leave);
    return () => {
      container.removeEventListener("pointerdown", down, true);
      container.removeEventListener("pointermove", move, true);
      container.removeEventListener("pointerup", up, true);
      container.removeEventListener("mousedown", mouseDown, true);
      container.removeEventListener("pointercancel", cancel);
      container.removeEventListener("pointerleave", leave);
      container.style.cursor = "";
    };
  }, [api, tool, drawings, bars, timeframe]);
  return (
    <div className="drawing-toolbar">
      <div
        className="drawing-actions"
        role="group"
        aria-label="Инструменты рисования"
      >
        <button
          type="button"
          title="Навигация и выбор фигур"
          aria-label="Навигация и выбор фигур"
          aria-pressed={tool === "navigate"}
          onClick={() => {
            cancel();
            setTool("navigate");
          }}
        >
          <MousePointer2 size={17} />
          <span className="sr-only">Навигация и выбор</span>
        </button>
        {Object.entries(drawingTools).map(([id, label]) => (
          <button
            type="button"
            key={id}
            title={
              id === "ruler"
                ? "Линейка · Shift + ЛКМ, два клика"
                : `${label} · два клика`
            }
            aria-label={label}
            disabled={!bars.length}
            aria-pressed={tool === id}
            onClick={() => {
              cancel();
              setTool(id as DrawingTool);
            }}
          >
            {(() => {
              const Icon = {
                brush: Brush,
                ruler: Ruler,
                horizontal: Minus,
                vertical: MoveVertical,
                rectangle: Square,
                fibonacci: ListFilter,
                "volume-profile": ChartColumn,
                text: Type,
              }[id as DrawingTool];
              return <Icon size={17} />;
            })()}
            <span className="sr-only">{label}</span>
          </button>
        ))}
        <details className="drawing-style">
          <summary title="Оформление новых фигур">Стиль</summary>
          <div>
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
                onChange={(e) =>
                  setWidth(Number(e.target.value) as 1 | 2 | 3 | 4)
                }
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
          </div>
        </details>
        <button
          type="button"
          aria-label="Отменить действие"
          disabled={!undoCount}
          onClick={undo}
          title="Отменить действие · Ctrl+Z"
        >
          <Undo2 size={17} />
        </button>
      </div>
      {drawings.length >= 200 && (
        <p role="status">Достигнут лимит 200 объектов. Удалите ненужные.</p>
      )}
      {objectEditor &&
        (() => {
          const profile = drawings.find(
            (drawing) => drawing.id === objectEditor.id,
          );
          if (!profile) return null;
          const values: NonNullable<Drawing["profile"]> = profile.profile ?? {
            rows: 150,
            valueArea: 70,
            showPoc: true,
            showValueArea: true,
            autoExtendRight: false,
          };
          return createPortal(
            <section
              className="frvp-context-panel"
              style={{ left: objectEditor.x, top: objectEditor.y }}
              aria-label={`Настройки: ${drawingTools[profile.tool]}`}
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.stopPropagation()}
            >
              <header>
                <strong>{drawingTools[profile.tool]}</strong>
                <button
                  type="button"
                  aria-label="Закрыть настройки объекта"
                  onClick={() => setObjectEditor(undefined)}
                >
                  ×
                </button>
              </header>
              <label>
                <span>Цвет</span>
                <input
                  type="color"
                  aria-label="Цвет объекта"
                  value={profile.color}
                  onChange={(event) =>
                    updateObject(profile.id, { color: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Толщина</span>
                <select
                  aria-label="Толщина объекта"
                  value={profile.width ?? 2}
                  onChange={(event) =>
                    updateObject(profile.id, {
                      width: Number(event.target.value) as 1 | 2 | 3 | 4,
                    })
                  }
                >
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value}px
                    </option>
                  ))}
                </select>
              </label>
              {profile.tool === "horizontal" && (
                <>
                  <label>
                    <span>Цена</span>
                    <input
                      aria-label="Цена уровня"
                      type="number"
                      step="any"
                      value={profile.points[0].price}
                      onChange={(event) => {
                        const price = Number(event.target.value);
                        if (Number.isFinite(price))
                          updateObject(profile.id, {
                            points: [{ ...profile.points[0], price }],
                          });
                      }}
                    />
                  </label>
                  <label>
                    <span>Цена на линии</span>
                    <input
                      type="checkbox"
                      checked={profile.showPrice !== false}
                      onChange={(event) =>
                        updateObject(profile.id, {
                          showPrice: event.target.checked,
                        })
                      }
                    />
                  </label>
                </>
              )}
              {profile.tool === "text" && (
                <label>
                  <span>Текст</span>
                  <input
                    aria-label="Текст объекта"
                    value={profile.text ?? "Текст"}
                    maxLength={100}
                    onChange={(event) =>
                      updateObject(profile.id, { text: event.target.value })
                    }
                  />
                </label>
              )}
              {profile.tool === "volume-profile" && (
                <>
                  <label>
                    <span>Размер строк</span>
                    <Choice
                      label="Размер строк FRVP"
                      value={values.rowLayout ?? "rows"}
                      onChange={(v) =>
                        updateProfile(profile.id, {
                          rowLayout: v as "rows" | "ticks",
                        })
                      }
                      items={[
                        ["rows", "Количество строк"],
                        ["ticks", "Тиков в строке"],
                      ]}
                    />
                  </label>
                  {values.rowLayout === "ticks" && (
                    <label>
                      <span>Тиков в строке</span>
                      <input
                        type="number"
                        min={1}
                        max={1000000}
                        value={values.ticksPerRow ?? 1}
                        onChange={(e) =>
                          updateProfile(profile.id, {
                            ticksPerRow: Math.max(
                              1,
                              Math.min(
                                1000000,
                                Math.round(Number(e.target.value) || 1),
                              ),
                            ),
                          })
                        }
                      />
                    </label>
                  )}
                  <label>
                    <span>Количество строк</span>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      value={values.rows}
                      onChange={(event) =>
                        updateProfile(profile.id, {
                          rows: Math.max(
                            10,
                            Math.min(500, Number(event.target.value) || 10),
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Область стоимости, %</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={values.valueArea}
                      onChange={(event) =>
                        updateProfile(profile.id, {
                          valueArea: Math.max(
                            1,
                            Math.min(100, Number(event.target.value) || 1),
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Показывать POC</span>
                    <input
                      type="checkbox"
                      checked={values.showPoc}
                      onChange={(event) =>
                        updateProfile(profile.id, {
                          showPoc: event.target.checked,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Показывать VAH / VAL</span>
                    <input
                      type="checkbox"
                      checked={values.showValueArea}
                      onChange={(event) =>
                        updateProfile(profile.id, {
                          showValueArea: event.target.checked,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Продолжать расчёт вправо</span>
                    <input
                      type="checkbox"
                      checked={values.autoExtendRight === true}
                      onChange={(event) =>
                        updateProfile(profile.id, {
                          autoExtendRight: event.target.checked,
                        })
                      }
                    />
                  </label>
                </>
              )}
              {profile.tool === "volume-profile" && (
                <>
                  <label>
                    <span>Объём</span>
                    <Choice
                      label="Объём FRVP"
                      value={values.volume ?? "up-down"}
                      onChange={(v) =>
                        updateProfile(profile.id, {
                          volume: v as "total" | "up-down" | "delta",
                        })
                      }
                      items={[
                        ["total", "Общий"],
                        ["up-down", "Покупки / продажи"],
                        ["delta", "Дельта"],
                      ]}
                    />
                  </label>
                  <label>
                    <span>Расположение</span>
                    <Choice
                      label="Расположение FRVP"
                      value={values.placement ?? "left"}
                      onChange={(v) =>
                        updateProfile(profile.id, {
                          placement: v as "left" | "right",
                        })
                      }
                      items={[
                        ["left", "Слева"],
                        ["right", "Справа"],
                      ]}
                    />
                  </label>
                  <label>
                    <span>Ширина, % диапазона</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={values.widthPercent ?? 100}
                      onChange={(e) =>
                        updateProfile(profile.id, {
                          widthPercent: Math.max(
                            1,
                            Math.min(100, Number(e.target.value) || 1),
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Непрозрачность, %</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={values.opacity ?? 50}
                      onChange={(e) =>
                        updateProfile(profile.id, {
                          opacity: Math.max(
                            0,
                            Math.min(100, Number(e.target.value) || 0),
                          ),
                        })
                      }
                    />
                  </label>
                  {(
                    [
                      ["upColor", "Покупки", profile.color],
                      ["downColor", "Продажи", "#ef7185"],
                      ["valueAreaUpColor", "VA: покупки", "#42a5f5"],
                      ["valueAreaDownColor", "VA: продажи", "#90caf9"],
                      ["pocColor", "POC", "#ffb74d"],
                      ["valueAreaColor", "VAH / VAL", "#42a5f5"],
                    ] as const
                  ).map(([key, label, fallback]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <input
                        type="color"
                        value={values[key] ?? fallback}
                        onChange={(e) =>
                          updateProfile(profile.id, { [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    <span>Подписи POC / VAH / VAL</span>
                    <input
                      type="checkbox"
                      checked={values.showLabels !== false}
                      onChange={(e) =>
                        updateProfile(profile.id, {
                          showLabels: e.target.checked,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Продлевать линии вправо</span>
                    <input
                      type="checkbox"
                      checked={values.extendLevels === true}
                      onChange={(e) =>
                        updateProfile(profile.id, {
                          extendLevels: e.target.checked,
                        })
                      }
                    />
                  </label>
                  <small>
                    Объём распределяется по OHLCV загруженных свечей. Режим
                    тиков ограничен 500 строками.
                  </small>
                </>
              )}
              <button
                type="button"
                className="drawing-delete"
                onClick={() => {
                  setDrawings((previous) =>
                    previous.filter((drawing) => drawing.id !== profile.id),
                  );
                  setSelectedId(undefined);
                  setObjectEditor(undefined);
                }}
              >
                Удалить объект
              </button>
            </section>,
            api.container,
          );
        })()}
      {tool !== "navigate" &&
        createPortal(
          <div
            className="drawing-input"
            aria-label="Область рисования"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={cancel}
            onLostPointerCapture={() => {
              if (pointer.current !== null) cancel();
            }}
          />,
          api.container,
        )}
    </div>
  );
}
