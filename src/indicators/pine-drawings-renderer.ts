import type {
  Coordinate,
  PrimitiveHoveredItem,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { Candle } from "../domain/market";
import type { PineDrawing } from "../domain/pine-scripts";
import { logicalAtTime } from "../domain/drawings";
const paint = (value: unknown, fallback = "transparent") =>
  typeof value === "string" && value !== "NaN" && value !== "na" && value !== ""
    ? value
    : fallback;
const textSize = (value: unknown) =>
  typeof value === "number"
    ? Math.max(6, Math.min(64, value))
    : ({ tiny: 8, small: 10, normal: 12, large: 16, huge: 22 }[
        String(value).replace(/^size_/, "")
      ] ?? 12);

export class PineDrawingsRenderer implements ISeriesPrimitive<Time> {
  private tips: {
    left: number;
    top: number;
    width: number;
    height: number;
    text: string;
  }[] = [];
  private attachment: SeriesAttachedParameter<Time> | null = null;
  private drawings: PineDrawing = { boxes: [], lines: [], labels: [] };
  private bars: Candle[] = [];
  private view: IPrimitivePaneView = {
    zOrder: () => "top",
    renderer: () => this.renderer,
  };
  private renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      const attached = this.attachment;
      if (!attached || !this.bars.length) return;
      const timeScale = attached.chart.timeScale();
      const x = (value: unknown, location: unknown) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        return String(location).startsWith("bt") || location === "bar_time"
          ? timeScale.logicalToCoordinate(
              logicalAtTime(
                this.bars,
                n / 1000,
                this.bars.length > 1
                  ? this.bars[1].time - this.bars[0].time
                  : 60,
              ) as Logical,
            )
          : timeScale.logicalToCoordinate(n as Logical);
      };
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        context.save();
        this.tips = [];
        context.beginPath();
        context.rect(0, 0, mediaSize.width, mediaSize.height);
        context.clip();
        const linePoints = (line: Record<string, unknown>) => {
          const x1 = x(line.x1, line.xloc),
            x2 = x(line.x2, line.xloc),
            y1 = attached.series.priceToCoordinate(Number(line.y1)),
            y2 = attached.series.priceToCoordinate(Number(line.y2));
          if (x1 === null || x2 === null || y1 === null || y2 === null)
            return null;
          const extend = String(line.extend),
            left = extend === "l" || extend === "left" || extend === "both",
            right = extend === "r" || extend === "right" || extend === "both";
          if (x1 === x2)
            return [
              { x: x1, y: left ? 0 : y1 },
              { x: x2, y: right ? mediaSize.height : y2 },
            ];
          const slope = (y2 - y1) / (x2 - x1),
            lx = left ? 0 : Math.min(x1, x2),
            rx = right ? mediaSize.width : Math.max(x1, x2);
          return [
            { x: lx, y: y1 + (lx - x1) * slope },
            { x: rx, y: y1 + (rx - x1) * slope },
          ];
        };
        for (const fill of this.drawings.linefills ?? []) {
          if (!fill.line1 || !fill.line2) continue;
          const first = linePoints(fill.line1 as Record<string, unknown>),
            second = linePoints(fill.line2 as Record<string, unknown>);
          if (!first || !second) continue;
          context.fillStyle = paint(fill.color);
          context.beginPath();
          context.moveTo(first[0].x, first[0].y);
          context.lineTo(first[1].x, first[1].y);
          context.lineTo(second[1].x, second[1].y);
          context.lineTo(second[0].x, second[0].y);
          context.closePath();
          context.fill();
        }
        for (const poly of this.drawings.polylines ?? []) {
          if (!Array.isArray(poly.points)) continue;
          const points = poly.points
            .map((p) => ({
              x: x(p.time ?? p.index, poly.xloc),
              y: attached.series.priceToCoordinate(Number(p.price)),
            }))
            .filter(
              (p): p is { x: Coordinate; y: Coordinate } =>
                p.x !== null && p.y !== null,
            );
          if (points.length < 2) continue;
          context.beginPath();
          context.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            if (poly.curved) {
              const a = points[Math.max(0, i - 2)],
                b = points[i - 1],
                c = points[i],
                d = points[Math.min(points.length - 1, i + 1)];
              context.bezierCurveTo(
                b.x + (c.x - a.x) / 6,
                b.y + (c.y - a.y) / 6,
                c.x - (d.x - b.x) / 6,
                c.y - (d.y - b.y) / 6,
                c.x,
                c.y,
              );
            } else context.lineTo(points[i].x, points[i].y);
          }
          if (poly.closed) context.closePath();
          context.fillStyle = paint(poly.fill_color);
          context.fill();
          context.strokeStyle = paint(poly.line_color, "#2962ff");
          context.lineWidth = Math.max(
            1,
            Math.min(20, Number(poly.line_width) || 1),
          );
          context.setLineDash(
            String(poly.line_style).includes("dashed")
              ? [6, 4]
              : String(poly.line_style).includes("dotted")
                ? [2, 3]
                : [],
          );
          context.stroke();
        }
        context.setLineDash([]);
        for (const box of this.drawings.boxes) {
          const left = x(box.left, box.xloc),
            right = x(box.right, box.xloc),
            top = attached.series.priceToCoordinate(Number(box.top)),
            bottom = attached.series.priceToCoordinate(Number(box.bottom));
          if (
            left === null ||
            right === null ||
            top === null ||
            bottom === null
          )
            continue;
          const extend = String(box.extend).replace(/^extend[._]/, "");
          const x1 =
            extend === "l" || extend === "left" || extend === "both"
              ? 0
              : Math.min(left, right);
          const x2 =
            extend === "r" || extend === "right" || extend === "both"
              ? mediaSize.width
              : Math.max(left, right);
          const y1 = Math.min(top, bottom),
            y2 = Math.max(top, bottom);
          if (box.bgcolor && box.bgcolor !== "NaN") {
            context.fillStyle = String(box.bgcolor);
            context.fillRect(x1, y1, x2 - x1, y2 - y1);
          }
          if (box.border_color && box.border_color !== "NaN") {
            context.strokeStyle = String(box.border_color);
            context.lineWidth = Number(box.border_width) || 1;
            context.setLineDash(
              String(box.border_style).includes("dotted")
                ? [2, 3]
                : String(box.border_style).includes("dashed")
                  ? [6, 4]
                  : [],
            );
            context.strokeRect(x1, y1, x2 - x1, y2 - y1);
          }
          if (box.text) {
            context.fillStyle = String(box.text_color || "#fff");
            context.font = `${textSize(box.text_size)}px sans-serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(
              String(box.text),
              (x1 + x2) / 2,
              (y1 + y2) / 2,
              Math.max(0, x2 - x1 - 8),
            );
          }
        }
        for (const line of this.drawings.lines) {
          const ends = linePoints(line);
          if (!ends) continue;
          context.strokeStyle = String(line.color || "#99a5ff");
          context.lineWidth = Math.max(1, Number(line.width) || 1);
          context.setLineDash(
            String(line.style).includes("dotted")
              ? [2, 3]
              : String(line.style).includes("dashed")
                ? [6, 4]
                : [],
          );
          context.beginPath();
          context.moveTo(ends[0].x, ends[0].y);
          context.lineTo(ends[1].x, ends[1].y);
          context.stroke();
          const style = String(line.style);
          for (const [index, hasArrow] of [
            [0, style.includes("arrow_left") || style.includes("arrow_both")],
            [1, style.includes("arrow_right") || style.includes("arrow_both")],
          ] as const) {
            if (!hasArrow) continue;
            const point = ends[index],
              other = ends[1 - index],
              angle = Math.atan2(point.y - other.y, point.x - other.x),
              size = Math.max(6, context.lineWidth * 3);
            context.fillStyle = context.strokeStyle;
            context.beginPath();
            context.moveTo(point.x, point.y);
            context.lineTo(
              point.x - size * Math.cos(angle - 0.4),
              point.y - size * Math.sin(angle - 0.4),
            );
            context.lineTo(
              point.x - size * Math.cos(angle + 0.4),
              point.y - size * Math.sin(angle + 0.4),
            );
            context.closePath();
            context.fill();
          }
        }
        context.setLineDash([]);
        for (const label of this.drawings.labels) {
          const px = x(label.x, label.xloc);
          const time = Number(label.x) / 1000;
          const bar = this.bars.find(
            (b) =>
              b.time <= time &&
              b.time + (this.bars[1]?.time - this.bars[0].time || 60) > time,
          );
          const location = String(label.yloc);
          const py = attached.series.priceToCoordinate(
            location === "ab" || location.includes("abovebar")
              ? (bar?.high ?? Number(label.y))
              : ["bb", "bl"].includes(location) || location.includes("belowbar")
                ? (bar?.low ?? Number(label.y))
                : Number(label.y),
          );
          if (px === null || py === null) continue;
          const text = String(label.text ?? ""),
            color = paint(label.textcolor, "#fff");
          const size = textSize(label.size),
            rows = text.split("\n");
          context.font = `${size}px ${String(label.text_font_family).includes("mono") ? "monospace" : "sans-serif"}`;
          const width =
              Math.max(...rows.map((row) => context.measureText(row).width)) +
              8,
            height = rows.length * (size + 3) + 6;
          const style = String(label.style),
            direction = style.includes("down")
              ? -1
              : style.includes("up")
                ? 1
                : 0;
          const centerY = py + direction * (height / 2 + 6);
          if (label.tooltip)
            this.tips.push({
              left: px - width / 2,
              top: centerY - height / 2,
              width,
              height,
              text: String(label.tooltip),
            });
          const hasBackground =
            label.color && label.color !== "NaN" && label.color !== "";
          context.fillStyle = String(label.color || "transparent");
          if (
            hasBackground &&
            !style.includes("none") &&
            /circle|diamond|triangle|square|cross|arrow|flag/.test(style)
          ) {
            const r = Math.max(size, Math.min(width, height)) / 2;
            context.beginPath();
            if (style.includes("circle"))
              context.arc(px, centerY, r, 0, 2 * Math.PI);
            else if (style.includes("diamond")) {
              context.moveTo(px, centerY - r);
              context.lineTo(px + r, centerY);
              context.lineTo(px, centerY + r);
              context.lineTo(px - r, centerY);
              context.closePath();
            } else if (style.includes("triangle") || style.includes("arrow")) {
              const d = style.includes("down") ? 1 : -1;
              context.moveTo(px, centerY + d * r);
              context.lineTo(px - r, centerY - d * r);
              context.lineTo(px + r, centerY - d * r);
              context.closePath();
            } else if (style.includes("cross")) {
              context.strokeStyle = context.fillStyle;
              context.lineWidth = 2;
              const delta = style.includes("xcross") ? r : 0;
              context.moveTo(px - r, centerY - delta);
              context.lineTo(px + r, centerY + delta);
              context.moveTo(px - delta, centerY + r);
              context.lineTo(px + delta, centerY - r);
              context.stroke();
            } else context.rect(px - r, centerY - r, r * 2, r * 2);
            context.fill();
          } else if (hasBackground && !style.includes("none")) {
            context.fillRect(
              px - width / 2,
              centerY - height / 2,
              width,
              height,
            );
            if (direction) {
              context.beginPath();
              context.moveTo(px, py);
              context.lineTo(px - 4, py + direction * 6);
              context.lineTo(px + 4, py + direction * 6);
              context.closePath();
              context.fill();
            }
          }
          context.fillStyle = color;
          context.textAlign = "center";
          context.textBaseline = "middle";
          rows.forEach((row, index) =>
            context.fillText(
              row,
              px,
              centerY + (index - (rows.length - 1) / 2) * (size + 3),
            ),
          );
        }
        for (const table of this.drawings.tables ?? [])
          this.drawTable(context, table, mediaSize.width, mediaSize.height);
        context.restore();
      });
    },
  };

  private drawTable(
    ctx: CanvasRenderingContext2D,
    table: Record<string, unknown>,
    width: number,
    height: number,
  ) {
    if (!Array.isArray(table.cells)) return;
    const cells = table.cells as (Record<string, unknown> | null)[][];
    const rows = Math.min(100, cells.length),
      columns = Math.min(100, Number(table.columns) || cells[0]?.length || 0);
    if (!rows || !columns) return;
    const widths = Array(columns).fill(24),
      heights = Array(rows).fill(20);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < columns; c++) {
        const cell = cells[r]?.[c];
        if (!cell || cell._merged) continue;
        const size = textSize(cell.text_size),
          lines = String(cell.text ?? "").split("\n");
        ctx.font = `${size}px sans-serif`;
        widths[c] = Math.max(
          widths[c],
          Number(cell.width) > 0
            ? (width * Number(cell.width)) / 100
            : Math.max(...lines.map((line) => ctx.measureText(line).width)) +
                12,
        );
        heights[r] = Math.max(
          heights[r],
          Number(cell.height) > 0
            ? (height * Number(cell.height)) / 100
            : lines.length * (size + 3) + 8,
        );
      }
    const tw = widths.reduce((a, b) => a + b, 0),
      th = heights.reduce((a, b) => a + b, 0),
      pos = String(table.position).toLowerCase();
    const left = pos.includes("right")
      ? width - tw - 6
      : pos.includes("center")
        ? (width - tw) / 2
        : 6;
    const top = pos.includes("bottom")
      ? height - th - 6
      : pos.includes("middle")
        ? (height - th) / 2
        : 6;
    ctx.fillStyle = paint(table.bgcolor);
    ctx.fillRect(left, top, tw, th);
    ctx.setLineDash([]);
    let cy = top;
    for (let r = 0; r < rows; r++) {
      let cx = left;
      for (let c = 0; c < columns; c++) {
        const cell = cells[r]?.[c];
        if (cell && !cell._merged) {
          const merge = Array.isArray(table.merges)
            ? table.merges.find((m) => m.startCol === c && m.startRow === r)
            : undefined;
          const cw = merge
            ? widths.slice(c, merge.endCol + 1).reduce((a, b) => a + b, 0)
            : widths[c];
          const ch = merge
            ? heights.slice(r, merge.endRow + 1).reduce((a, b) => a + b, 0)
            : heights[r];
          if (cell.tooltip)
            this.tips.push({
              left: cx,
              top: cy,
              width: cw,
              height: ch,
              text: String(cell.tooltip),
            });
          ctx.fillStyle = paint(cell.bgcolor);
          ctx.fillRect(cx, cy, cw, ch);
          ctx.strokeStyle = paint(table.border_color);
          ctx.lineWidth = Math.max(0, Number(table.border_width) || 0);
          if (Number(table.border_width) > 0) ctx.strokeRect(cx, cy, cw, ch);
          const size = textSize(cell.text_size),
            lines = String(cell.text ?? "").split("\n");
          ctx.font = `${String(cell.text_formatting).includes("bold") ? "bold " : ""}${size}px ${String(cell.text_font_family).includes("mono") ? "monospace" : "sans-serif"}`;
          const valign = String(cell.text_valign),
            contentHeight = lines.length * (size + 3),
            textY = valign.includes("top")
              ? cy + 4 + contentHeight / 2
              : valign.includes("bottom")
                ? cy + ch - 4 - contentHeight / 2
                : cy + ch / 2;
          const align = String(cell.text_halign);
          ctx.textAlign = align.includes("left")
            ? "left"
            : align.includes("right")
              ? "right"
              : "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = paint(cell.text_color, "#ffffff");
          const tx =
            ctx.textAlign === "left"
              ? cx + 6
              : ctx.textAlign === "right"
                ? cx + cw - 6
                : cx + cw / 2;
          lines.forEach((line, index) =>
            ctx.fillText(
              line,
              tx,
              textY + (index - (lines.length - 1) / 2) * (size + 3),
              Math.max(1, cw - 8),
            ),
          );
        }
        cx += widths[c];
      }
      cy += heights[r];
    }
    if (Number(table.frame_width) > 0) {
      ctx.strokeStyle = paint(table.frame_color);
      ctx.lineWidth = Number(table.frame_width);
      ctx.strokeRect(left, top, tw, th);
    }
  }

  attached(attachment: SeriesAttachedParameter<Time>) {
    this.attachment = attachment;
    attachment.requestUpdate();
  }
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const tip = this.tips.findLast(
      (tip) =>
        x >= tip.left &&
        x <= tip.left + tip.width &&
        y >= tip.top &&
        y <= tip.top + tip.height,
    );
    return tip
      ? { externalId: "pine-tooltip:" + tip.text, zOrder: "top" }
      : null;
  }
  detached() {
    this.attachment = null;
  }
  paneViews() {
    return [this.view];
  }
  configure(drawings: PineDrawing, bars: Candle[]) {
    this.drawings = drawings;
    this.bars = bars;
    this.attachment?.requestUpdate();
  }
}
