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
  ArrowUpRight,
  Slash,
  Rows2,
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
import type { IChartApi, ISeriesApi, Logical, UTCTimestamp } from "lightweight-charts";
import {
  fractionalLogicalAtCoordinate,
  coordinateAtFractionalLogical,
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
import { FrvpSettings } from "./frvp-settings";
import { defaultProfile } from "../domain/drawings";
import { DrawingsRenderer } from "./drawings-renderer";
import { useProfiles } from "./profile-provider";
import { useStored, useResource } from "../hooks/use-resource";
import type { MarketExchange } from "../domain/exchanges";
import type { CandleResponse } from "../domain/market";
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
  exchange = "binance",
  timeframe,
  tickSize = 0.01,
}: {
  api: DrawingChart;
  bars: Candle[];
  symbol: string;
  exchange?: MarketExchange;
  timeframe: Timeframe;
  tickSize?: number;
}) {
  const profileContext = useProfiles();
  const profileId = profileContext?.active;
  useEffect(() => {
    undoStack.current = [];
    setUndoCount(0);
    cancel();
    setSelectedId(undefined);
    setObjectEditor(undefined);
  }, [profileId, symbol, timeframe]);
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
  const legacyProfiles = useMemo(() => {
    const byId = new Map<string, Drawing>();
    for (const tf of [
      "1m",
      "3m",
      "5m",
      "15m",
      "30m",
      "1h",
      "2h",
      "4h",
      "1d",
      "1w",
    ]) {
      const key = `vector.drawings.v1:${symbol}:${tf}`;
      let raw: unknown = [];
      if (profileContext) raw = profileContext.getValue(key, []);
      else {
        try {
          raw = JSON.parse(localStorage.getItem(key) ?? "[]");
        } catch {}
      }
      for (const d of readDrawings(raw))
        byId.set(d.id, d);
    }
    const oldShared = `vector.drawings.v1:${symbol}:frvp`;
    let raw: unknown = [];
    if (profileContext) raw = profileContext.getValue(oldShared, []);
    else { try { raw = JSON.parse(localStorage.getItem(oldShared) ?? "[]"); } catch {} }
    for (const d of readDrawings(raw)) byId.set(d.id, d);
    return [...byId.values()].slice(-200);
  }, [symbol, profileContext?.active, profileContext?.settings]);
  const [storedDrawings, updateStoredDrawings] = useStored<Drawing[]>(
    `vector.drawings.v1:${symbol}:all`, legacyProfiles,
  );
  const currentDrawings = useRef(storedDrawings);
  currentDrawings.current = storedDrawings;
  const setStoredDrawings = useCallback<Dispatch<SetStateAction<Drawing[]>>>(
    (next) => {
      const resolved = typeof next === "function" ? next(currentDrawings.current) : next;
      currentDrawings.current = resolved;
      updateStoredDrawings(resolved);
    }, [updateStoredDrawings],
  );
  const drawings = useMemo(
    () => readDrawings(storedDrawings),
    [storedDrawings],
  );
  const profiles = drawings.filter(
    (d) =>
      d.tool === "volume-profile" &&
      (!d.profile?.timeframes || d.profile.timeframes.includes(timeframe)),
  );
  const profileStart = profiles.length
    ? Math.min(...profiles.flatMap((d) => d.points.map((p) => p.time)))
    : 0;
  // Keep the URL stable during the current minute while still including the open bar.
  const profileNow = Math.floor(Date.now() / 60000) * 60 + 60;
  const profileEnd = profiles.length ? Math.min(profileNow, Math.max(...profiles.map(d =>
    d.profile?.autoExtendRight ? profileNow : Math.max(...d.points.map(p => p.time)) + (d.profile?.endInterval ?? candleIntervals[timeframe])
  ))) : 0;
  const lowerFrame = (
    Object.entries(candleIntervals) as [Timeframe, number][]
  ).find(
    ([tf, seconds]) =>
      !["8h", "12h"].includes(tf) &&
      seconds < candleIntervals[timeframe] &&
      profileStart > 0 &&
      Math.ceil((profileEnd - profileStart) / seconds) + 2 <= 5000 &&
      profileStart <= (bars.at(-1)?.time ?? 0),
  )?.[0];
  const lowerCount = lowerFrame
    ? Math.max(
        300,
        Math.min(
          12000,
          Math.ceil(
            (profileEnd - profileStart) / candleIntervals[lowerFrame],
          ) + 2,
        ),
      )
    : 300;
  const lower = useResource<CandleResponse>(
    `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${lowerFrame ?? timeframe}&count=${lowerCount}&exchange=${exchange}&before=${Math.max(0, Math.floor(profileEnd - 1))}`,
    60000,
    Boolean(lowerFrame),
  );
  const profileBars =
    lowerFrame && lower.data?.source !== "demo" ? lower.data?.data : undefined;
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
  const channelSecondPointPlaced = useRef(false);
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
      (draft
        ? [...drawings.filter((d) => d.id !== draft.id), draft]
        : drawings
      ).filter(
        (d) =>
          !d.profile?.timeframes || d.profile.timeframes.includes(timeframe),
      ),
      bars,
      candleIntervals[timeframe],
      selectedId,
      hoverId,
      tickSize,
      profileBars ?? bars,
    );
  }, [
    drawings,
    draft,
    bars,
    timeframe,
    selectedId,
    hoverId,
    tickSize,
    profileBars,
  ]);
  function cancel() {
    channelSecondPointPlaced.current = false;
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
        (e.code === "KeyZ" || e.key.toLowerCase() === "z")
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
    const logical = fractionalLogicalAtCoordinate(api.chart.timeScale(), x),
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
      if (d.profile?.timeframes && !d.profile.timeframes.includes(timeframe))
        return false;
      const projected = d.points.map((anchor) => ({
        x: coordinateAtFractionalLogical(api.chart.timeScale(),
            logicalAtTime(bars, anchor.time, candleIntervals[timeframe])),
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
          lastX = api.chart
            .timeScale()
            .logicalToCoordinate((bars.length - 1) as Logical),
          right = d.profile?.autoExtendRight
            ? Math.max(a.x, b.x, lastX ?? b.x)
            : Math.max(a.x, b.x),
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
          d.profile?.showHistogram !== false &&
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
          (d.profile?.showVal ?? d.profile?.showValueArea) !== false &&
          levelHit(data.low + (data.vaLow / data.rows) * (data.high - data.low))
        )
          return true;
        if (
          (d.profile?.showVah ?? d.profile?.showValueArea) !== false &&
          levelHit(
            data.low + ((data.vaHigh + 1) / data.rows) * (data.high - data.low),
          )
        )
          return true;
        return false;
      }
      if (d.tool === "trend" || d.tool === "arrow") return segmentDistance(pts[0], pts[1]) < 9;
      if (d.tool === "channel") {
        const [a,b,c] = pts, offset = c.y - a.y;
        return segmentDistance(a,b) < 9 || segmentDistance({x:a.x,y:a.y+offset},{x:b.x,y:b.y+offset}) < 9;
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
      const x = coordinateAtFractionalLogical(api.chart.timeScale(),
          logicalAtTime(bars, p.time, candleIntervals[timeframe]));
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
        ".frvp-context-panel, .whale-chart-overlay, .heatmap-quick",
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
      const isChannelSecond = active.current.tool === "channel" && !channelSecondPointPlaced.current;
      move(e);
      if (isChannelSecond && active.current.points.length === 2) {
        channelSecondPointPlaced.current = true;
        active.current = {...active.current, points:[...active.current.points, p]};
        setDraft(active.current);
        return;
      }
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
              ...defaultProfile,
              endInterval: candleIntervals[timeframe],
            },
          }
        : {}),
    };
    if (tool === "brush") {
      pointer.current = e.pointerId;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    setDraft(active.current);
  }
  function move(e: PointerEvent<HTMLDivElement> | globalThis.PointerEvent) {
    if (tool !== "navigate" && !api.disposed) {
      const anchor = point(e);
      const x = e.clientX - api.container.getBoundingClientRect().left;
      const index = api.chart.timeScale().coordinateToLogical(x);
      const bar = index === null ? undefined : bars[Math.round(index)];
      if (anchor && bar) api.chart.setCrosshairPosition(anchor.price, bar.time as UTCTimestamp, api.series);
      else api.chart.clearCrosshairPosition();
    }
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
    if (!d || (d.tool === "brush" && pointer.current !== e.pointerId)) return;
    const p = point(e);
    if (!p) return;
    const points =
      d.tool === "volume-profile"
        ? profilePoints(d.points[0], p)
        : d.tool === "channel" && d.points.length >= 3
          ? [d.points[0], d.points[1], p]
        : d.tool === "brush"
          ? (() => {
              const native = "nativeEvent" in e ? e.nativeEvent : e;
              const samples = native.getCoalescedEvents?.() ?? [];
              const additions = [...samples, native].map(point).filter((v): v is DrawingPoint => !!v);
              return [...d.points, ...additions].slice(0, 2000);
            })()
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
    if (tool === "navigate" && !api.disposed) api.chart.clearCrosshairPosition();
  }, [api, tool]);
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
                : id === "channel" ? `${label} · три клика`
                : id === "brush"
                  ? `${label} · удерживайте левую кнопку мыши`
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
                trend: Slash,
                arrow: ArrowUpRight,
                channel: Rows2,
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
              {profile.tool !== "volume-profile" && (
                <>
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
                </>
              )}
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
                <FrvpSettings
                  drawing={profile}
                  onProfile={(values) => updateProfile(profile.id, values)}
                  onPoints={(points) => updateObject(profile.id, { points })}
                  timeframe={timeframe}
                />
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
            onPointerLeave={() => api.chart.clearCrosshairPosition()}
            onLostPointerCapture={() => {
              if (pointer.current !== null) cancel();
            }}
          />,
          api.container,
        )}
    </div>
  );
}
