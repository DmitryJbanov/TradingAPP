"use client";
import { useState, type ReactNode } from "react";
import { Choice } from "./controls";
import {
  defaultProfile,
  type Drawing,
  type DrawingPoint,
} from "../domain/drawings";
import { intervals, type Timeframe } from "../domain/market";

type Profile = NonNullable<Drawing["profile"]>;
const frames = Object.keys(intervals) as Timeframe[];
const frameNames: Record<Timeframe, string> = {
  "1m": "1 мин",
  "3m": "3 мин",
  "5m": "5 мин",
  "15m": "15 мин",
  "30m": "30 мин",
  "1h": "1 час",
  "2h": "2 часа",
  "4h": "4 часа",
  "1d": "1 день",
  "1w": "1 неделя",
};
export function FrvpSettings({
  drawing,
  onProfile,
  onPoints,
  timeframe,
}: {
  drawing: Drawing;
  onProfile: (values: Partial<Profile>) => void;
  onPoints: (points: DrawingPoint[]) => void;
  timeframe: Timeframe;
}) {
  const [tab, setTab] = useState("inputs");
  const p = {
    ...defaultProfile,
    ...drawing.profile,
    showVah: drawing.profile?.showVah ?? drawing.profile?.showValueArea ?? true,
    showVal: drawing.profile?.showVal ?? drawing.profile?.showValueArea ?? true,
  };
  const row = (name: string, control: ReactNode) => (
    <label className="frvp-row">
      <span>{name}</span>
      {control}
    </label>
  );
  const check = (key: keyof Profile, name: string, fallback = false) =>
    row(
      name,
      <input
        type="checkbox"
        checked={Boolean(p[key] ?? fallback)}
        onChange={(e) => onProfile({ [key]: e.target.checked })}
      />,
    );
  const number = (
    key: keyof Profile,
    name: string,
    min: number,
    max: number,
    fallback: number,
  ) =>
    row(
      name,
      <input
        type="number"
        aria-label={name}
        min={min}
        max={max}
        value={Number(p[key] ?? fallback)}
        onChange={(e) =>
          onProfile({
            [key]: Math.max(
              min,
              Math.min(max, Math.round(Number(e.target.value) || min)),
            ),
          })
        }
      />,
    );
  const colorControl = (key: keyof Profile, name: string, fallback: string) => (
    <div className="frvp-color-control">
      <input
        type="color"
        aria-label={name}
        value={String(p[key] ?? fallback)}
        onChange={(e) => onProfile({ [key]: e.target.value })}
      />
      <input
        type="number"
        aria-label={`Непрозрачность: ${name}, %`}
        title="Непрозрачность, %"
        min={0}
        max={100}
        value={p.colorOpacity?.[key] ?? 100}
        onChange={(e) =>
          onProfile({
            colorOpacity: {
              ...p.colorOpacity,
              [key]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
            },
          })
        }
      />
      <small>%</small>
    </div>
  );
  const color = (key: keyof Profile, name: string, fallback: string) =>
    row(name, colorControl(key, name, fallback));
  const level = (
    key: "poc" | "vah" | "val",
    name: string,
    fallback: string,
  ) => (
    <div className="frvp-level" key={key}>
      {check(
        ({ poc: "showPoc", vah: "showVah", val: "showVal" } as const)[key],
        name,
        true,
      )}
      {colorControl(`${key}Color`, `Цвет ${name}`, fallback)}
      <Choice
        label={`Стиль ${name}`}
        value={p[`${key}Style`] ?? "solid"}
        items={[
          ["solid", "Сплошная"],
          ["dashed", "Штриховая"],
          ["dotted", "Точечная"],
        ]}
        onChange={(v) => onProfile({ [`${key}Style`]: v })}
      />
      <label className="frvp-level-width">
        <span>Толщина</span>
        <input
          type="number"
          min={1}
          max={4}
          aria-label={`Толщина ${name}`}
          value={p.levelWidths?.[key] ?? 1}
          onChange={(e) =>
            onProfile({
              levelWidths: {
                ...p.levelWidths,
                [key]: Math.max(
                  1,
                  Math.min(4, Math.round(Number(e.target.value) || 1)),
                ),
              },
            })
          }
        />
      </label>
    </div>
  );
  const dateString = (time: number) =>
    new Date(time * 1000).toISOString().slice(0, 16);
  return (
    <div className="frvp-settings" key={drawing.id}>
      <div className="frvp-tabs" role="tablist" aria-label="Настройки FRVP">
        {[
          ["inputs", "Входные данные"],
          ["style", "Стиль"],
          ["coordinates", "Координаты"],
          ["visibility", "Видимость"],
        ].map(([key, name]) => (
          <button
            type="button"
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        aria-label={
          {
            inputs: "Входные данные",
            style: "Стиль",
            coordinates: "Координаты",
            visibility: "Видимость",
          }[tab]
        }
      >
        {tab === "inputs" && (
          <>
            {row(
              "Планировка рядов",
              <Choice
                label="Планировка рядов"
                value={p.rowLayout ?? "rows"}
                items={[
                  ["rows", "Количество строк"],
                  ["ticks", "Тиков в строке"],
                ]}
                onChange={(v) =>
                  onProfile({ rowLayout: v as Profile["rowLayout"] })
                }
              />,
            )}
            {p.rowLayout === "ticks"
              ? number("ticksPerRow", "Размер рядов, тиков", 1, 1000000, 1)
              : number("rows", "Размер рядов", 10, 500, 400)}
            {row(
              "Объём",
              <Choice
                label="Объём"
                value={p.volume ?? "delta"}
                items={[
                  ["total", "Общий"],
                  ["up-down", "Покупки / продажи"],
                  ["delta", "Дельта"],
                ]}
                onChange={(v) => onProfile({ volume: v as Profile["volume"] })}
              />,
            )}
            {number("valueArea", "Объём области стоимости, %", 1, 100, 70)}
            {check("autoExtendRight", "Протянуть вправо")}
            <small>
              Расчёт по OHLCV выбранного диапазона с подгрузкой меньшего
              интервала, когда доступно полное покрытие. Дельта — разность
              восходящего и нисходящего объёма. Максимум 500 строк.
            </small>
          </>
        )}
        {tab === "style" && (
          <>
            {check("showHistogram", "Профиль объёма", true)}
            {check("showValues", "Значения объёма")}
            {color("valuesColor", "Цвет значений", "#999999")}
            {number("widthPercent", "Ширина, % диапазона", 1, 100, 40)}
            {row(
              "Расположение",
              <Choice
                label="Расположение"
                value={p.placement ?? "left"}
                items={[
                  ["left", "Слева"],
                  ["right", "Справа"],
                ]}
                onChange={(v) =>
                  onProfile({ placement: v as Profile["placement"] })
                }
              />,
            )}
            {number("opacity", "Непрозрачность, %", 0, 100, 85)}
            {color("upColor", "Восходящий объём", "#006064")}
            {color("downColor", "Нисходящий объём", "#880e4f")}
            {color("valueAreaUpColor", "Область стоимости: рост", "#00acc1")}
            {color(
              "valueAreaDownColor",
              "Область стоимости: падение",
              "#e91e63",
            )}
            {level("vah", "VAH", "#f23645")}
            {level("val", "VAL", "#4caf50")}
            {level("poc", "POC", "#2962ff")}
            {check("developingPoc", "Развивающийся POC")}
            {color("developingPocColor", "Цвет развивающегося POC", "#999999")}
            {check("developingVa", "Развивающаяся VA")}
            {color("developingVaColor", "Цвет развивающейся VA", "#147c88")}
            {check("showBox", "Фон гистограммы")}
            {color("boxColor", "Цвет фона", "#000000")}
            {check("showLabels", "Подписи POC / VAH / VAL")}
            {check("extendLevels", "Продлевать уровни вправо")}
          </>
        )}
        {tab === "coordinates" && (
          <>
            {[0, 1].map((i) => (
              <div key={i} className="frvp-anchor">
                <strong>{i === 0 ? "Начало" : "Конец"}</strong>
                {row(
                  "Дата и время, UTC",
                  <input
                    type="datetime-local"
                    aria-label={`${i === 0 ? "Начало" : "Конец"}, UTC`}
                    value={dateString(drawing.points[i].time)}
                    onChange={(e) => {
                      const time = Date.parse(e.target.value + "Z") / 1000;
                      if (Number.isFinite(time))
                        onPoints(
                          drawing.points.map((point, j) =>
                            i === j ? { ...point, time } : point,
                          ),
                        );
                    }}
                  />,
                )}
                {row(
                  "Цена",
                  <input
                    type="number"
                    step="any"
                    aria-label={`Цена ${i + 1}`}
                    value={drawing.points[i].price}
                    onChange={(e) => {
                      const price = Number(e.target.value);
                      if (Number.isFinite(price))
                        onPoints(
                          drawing.points.map((point, j) =>
                            i === j ? { ...point, price } : point,
                          ),
                        );
                    }}
                  />,
                )}
              </div>
            ))}
          </>
        )}
        {tab === "visibility" && (
          <>
            <small>
              Текущий интервал: {frameNames[timeframe]}. Выберите интервалы
              отображения.
            </small>
            {row(
              "Все интервалы",
              <input
                type="checkbox"
                checked={!p.timeframes}
                onChange={(e) =>
                  onProfile({
                    timeframes: e.target.checked ? undefined : [timeframe],
                  })
                }
              />,
            )}
            {frames.map((tf) => (
              <label className="frvp-row" key={tf}>
                <span>{frameNames[tf]}</span>
                <input
                  type="checkbox"
                  checked={!p.timeframes || p.timeframes.includes(tf)}
                  onChange={(e) =>
                    onProfile({
                      timeframes: e.target.checked
                        ? [...new Set([...(p.timeframes ?? frames), tf])]
                        : (p.timeframes ?? frames).filter((v) => v !== tf),
                    })
                  }
                />
              </label>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
