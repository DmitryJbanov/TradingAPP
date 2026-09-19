"use client";
import { useState } from "react";
import { compact, priceFormat } from "../domain/market";
import {
  selectionReasons,
  type CoinglassParams,
  type CoinglassPoint,
  type CoinglassPreview,
} from "../domain/coinglass";
const exchangeColors: Record<string, string> = {
  Binance: "#e9b949",
  OKX: "#9b8afb",
  Bybit: "#38bdb1",
};
export function CoinglassMap({
  report,
  params,
  baseline,
}: {
  report: CoinglassPreview;
  params: CoinglassParams;
  baseline?: CoinglassPreview;
}) {
  const [focus, setFocus] = useState<number>();
  const [all, setAll] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [center, setCenter] = useState(50);
  const points = report.points;
  const min = points[0]?.price ?? 0,
    max = points.at(-1)?.price ?? 1;
  const span = Math.max(max - min, 1e-9);
  const width = (span * zoom) / 100;
  const lo = min + ((span - width) * center) / 100,
    hi = lo + width;
  const x = (p: number) => 65 + ((p - lo) / width) * 780;
  const y = (h: number) => 320 - (h / Math.max(report.maximum, 1)) * 260;
  const current = report.result.currentPrice;
  const active = points.find((p) => p.price === focus);
  const savedPrices = new Set(baseline?.result.levels.map((p) => p.price));
  const chosenPrices = new Set(report.result.levels.map((p) => p.price));
  const visible = points.filter((p) => p.price >= lo && p.price <= hi);
  const describe = (p: CoinglassPoint) =>
    p.selected
      ? `Выбран #${p.rank}`
      : p.reasons.map((r) => selectionReasons[r] ?? r).join("; ");
  return (
    <section className="cg-map">
      <div className="cg-legend">
        {Object.entries(exchangeColors).map(([name, color]) => (
          <span key={name}>
            <i style={{ background: color }} />
            {name}
          </span>
        ))}
        <span>Контур и номер — выбранный пик</span>
        <span>Ромб — локальный максимум</span>
      </div>
      <svg
        viewBox="0 0 900 380"
        role="img"
        aria-label="Карта ликвидаций: цена по горизонтали, интенсивность по вертикали"
      >
        <text x="65" y="20" fill="currentColor">
          Интенсивность ликвидаций
        </text>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1="65"
              x2="845"
              y1={y(report.maximum * t)}
              y2={y(report.maximum * t)}
              stroke="currentColor"
              opacity=".15"
            />
            <text
              x="58"
              y={y(report.maximum * t) + 4}
              textAnchor="end"
              fill="currentColor"
              fontSize="11"
            >
              {compact(report.maximum * t)}
            </text>
          </g>
        ))}
        {Array.from({ length: 6 }, (_, i) => lo + (width * i) / 5).map(
          (price) => (
            <text
              key={price}
              x={x(price)}
              y="346"
              textAnchor="middle"
              fontSize="11"
              fill="currentColor"
            >
              {priceFormat(price)}
            </text>
          ),
        )}
        <text x="845" y="373" textAnchor="end" fill="currentColor">
          Цена, USD
        </text>
        {params.side !== "both" && (
          <rect
            x={
              params.side === "above"
                ? 65
                : Math.max(65, Math.min(845, x(current)))
            }
            y="60"
            height="260"
            width={
              params.side === "above"
                ? Math.max(0, Math.min(780, x(current) - 65))
                : Math.max(0, Math.min(780, 845 - x(current)))
            }
            fill="currentColor"
            opacity=".07"
          />
        )}
        {visible.map((p) => {
          const index = points.indexOf(p);
          const gap = Math.min(
            index ? p.price - points[index - 1].price : span / points.length,
            index + 1 < points.length
              ? points[index + 1].price - p.price
              : span / points.length,
          );
          const bw = Math.max(0.8, Math.min(22, (gap / width) * 780 * 0.78));
          let accumulated = 0;
          const title = `${priceFormat(p.price)} USD · ${describe(p)} · высота ${(p.relativeHeight * 100).toFixed(1)}% · выраженность ${(p.relativeProminence * 100).toFixed(1)}%`;
          return (
            <g
              key={p.price}
              onMouseEnter={() => setFocus(p.price)}
              onClick={() => setFocus(p.price)}
            >
              <title>{title}</title>
              {Object.entries(p.exchanges).map(([name, value]) => {
                const h = Number(value);
                accumulated += h;
                return (
                  <rect
                    key={name}
                    x={x(p.price) - bw / 2}
                    y={y(accumulated)}
                    width={bw}
                    height={Math.max(
                      0,
                      (h / Math.max(report.maximum, 1)) * 260,
                    )}
                    fill={exchangeColors[name] ?? "#8f9bab"}
                    opacity={p.selected ? 1 : 0.4}
                  />
                );
              })}
              <rect
                x={x(p.price) - bw / 2}
                y={y(p.intensity)}
                width={bw}
                height={Math.max(2, 320 - y(p.intensity))}
                fill="transparent"
                stroke={
                  focus === p.price
                    ? "#60a5fa"
                    : p.selected
                      ? "currentColor"
                      : "none"
                }
                strokeWidth={p.selected ? 2 : 1}
              />
              {p.isPeak && (
                <path
                  d={`M${x(p.price)} ${y(p.intensity) - 9} l4 4 l-4 4 l-4 -4 Z`}
                  fill={p.selected ? "currentColor" : "#94a3b8"}
                />
              )}
              {p.selected && (
                <text
                  x={x(p.price)}
                  y={y(p.intensity) - 15}
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="12"
                >
                  #{p.rank}
                </text>
              )}
              {baseline &&
                savedPrices.has(p.price) &&
                !chosenPrices.has(p.price) && (
                  <text
                    x={x(p.price)}
                    y={y(p.intensity) - 15}
                    textAnchor="middle"
                    fill="#fb7185"
                  >
                    −
                  </text>
                )}
              {baseline &&
                !savedPrices.has(p.price) &&
                chosenPrices.has(p.price) && (
                  <text
                    x={x(p.price) + 12}
                    y={y(p.intensity) - 15}
                    fill="#34d399"
                  >
                    +
                  </text>
                )}
            </g>
          );
        })}
        <line
          x1="65"
          x2="845"
          y1={y(report.heightThreshold)}
          y2={y(report.heightThreshold)}
          stroke="#60a5fa"
          strokeWidth="2"
          strokeDasharray="6 4"
        />
        <text
          x="845"
          y={y(report.heightThreshold) - 5}
          textAnchor="end"
          fill="#60a5fa"
          fontSize="12"
        >
          Высота ≥ {(params.minRelative * 100).toFixed(0)}% ·{" "}
          {compact(report.heightThreshold)}
        </text>
        {current >= lo && current <= hi && (
          <g>
            <line
              x1={x(current)}
              x2={x(current)}
              y1="45"
              y2="320"
              stroke="currentColor"
              strokeDasharray="4 4"
            />
            <text
              x={x(current)}
              y="39"
              textAnchor="middle"
              fill="currentColor"
              fontSize="11"
            >
              Цена снимка {priceFormat(current)}
            </text>
          </g>
        )}
        {active?.isPeak && active.price >= lo && active.price <= hi && (
          <g stroke="#f59e0b" strokeWidth="2">
            <line
              x1={x(active.price)}
              x2={x(active.price)}
              y1={y(active.base)}
              y2={y(active.intensity)}
            />
            <line
              x1={x(active.price) - 12}
              x2={x(active.price) + 12}
              y1={y(active.base)}
              y2={y(active.base)}
            />
            <line
              x1={x(active.price) - 12}
              x2={x(active.price) + 12}
              y1={y(active.intensity)}
              y2={y(active.intensity)}
            />
          </g>
        )}
      </svg>
      <div className="cg-map-controls">
        <label>
          Ширина обзора{" "}
          <input
            aria-label="Ширина обзора карты"
            type="range"
            min="10"
            max="100"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          {zoom}%
        </label>
        <label>
          Положение{" "}
          <input
            aria-label="Положение обзора карты"
            type="range"
            min="0"
            max="100"
            value={center}
            disabled={zoom === 100}
            onChange={(e) => setCenter(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          className="button"
          onClick={() => {
            setZoom(100);
            setCenter(50);
          }}
        >
          Вся карта
        </button>
      </div>
      <div className="cg-inspector" aria-live="polite">
        {active ? (
          <>
            <strong>
              {priceFormat(active.price)} USD · {describe(active)}
            </strong>
            <p>
              Высота: {(active.relativeHeight * 100).toFixed(2)}% / порог{" "}
              {(params.minRelative * 100).toFixed(0)}%. Выраженность:{" "}
              {(active.relativeProminence * 100).toFixed(2)}% / порог{" "}
              {(params.minProminence * 100).toFixed(0)}%.
            </p>
            {active.isPeak && (
              <p>
                Выраженность = вершина {compact(active.intensity)} − основание{" "}
                {compact(active.base)} = {compact(active.prominence)}. Требуется
                ≥ {compact(report.prominenceThreshold)}. Оранжевый отрезок
                показывает фактическую выраженность.
              </p>
            )}
            <p>
              От цены снимка: {active.distancePercent.toFixed(2)}%.{" "}
              {Object.entries(active.exchanges)
                .map(([name, v]) => `${name}: ${compact(Number(v))}`)
                .join(" · ")}
            </p>
          </>
        ) : (
          <p>
            Наведите на столбец или выберите строку таблицы: здесь появится
            объяснение отбора.
          </p>
        )}
      </div>
      <label>
        <input
          type="checkbox"
          checked={all}
          onChange={(e) => setAll(e.target.checked)}
        />{" "}
        Все столбцы (по умолчанию — локальные максимумы)
      </label>
      <div className="cg-table-wrap">
        <table className="cg-table">
          <caption>
            {report.result.levels.length} выбрано ·{" "}
            {points.filter((p) => p.isPeak).length} пиков · {points.length}{" "}
            столбцов
          </caption>
          <thead>
            <tr>
              <th>Цена USD</th>
              <th>Высота</th>
              <th>Выраженность</th>
              <th>Расстояние</th>
              <th>Решение</th>
            </tr>
          </thead>
          <tbody>
            {points
              .filter((p) => all || p.isPeak)
              .map((p) => (
                <tr key={p.price} data-selected={p.selected}>
                  <td>
                    <button type="button" onClick={() => setFocus(p.price)}>
                      {priceFormat(p.price)}
                    </button>
                  </td>
                  <td>{(p.relativeHeight * 100).toFixed(2)}%</td>
                  <td>
                    {p.isPeak
                      ? `${(p.relativeProminence * 100).toFixed(2)}%`
                      : "—"}
                  </td>
                  <td>{p.distancePercent.toFixed(2)}%</td>
                  <td>{describe(p)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!report.result.levels.length && (
        <p role="status">
          Выбрано 0 уровней. Уменьшите пороги или измените сторону отбора.
        </p>
      )}
    </section>
  );
}
