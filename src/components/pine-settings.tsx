"use client";
import { Choice } from "./controls";
import { useState } from "react";
import type {
  PineInstanceSettings,
  PineResult,
  PinePlotStyle,
} from "../domain/pine-scripts";

export function PineSettings({
  result,
  settings,
  onChange,
  defaultOpen = false,
}: {
  result: PineResult;
  settings: PineInstanceSettings;
  onChange: (settings: PineInstanceSettings) => void;
  defaultOpen?: boolean;
}) {
  const [parameterSearch, setParameterSearch] = useState("");
  const inputs = settings.inputs ?? {};
  const display = settings.display ?? {};
  const setInput = (id: string, value: unknown) =>
    onChange({ ...settings, inputs: { ...inputs, [id]: value } });
  const setDisplay = (
    key: string,
    value: Partial<NonNullable<PineInstanceSettings["display"]>[string]>,
  ) =>
    onChange({
      ...settings,
      display: { ...display, [key]: { ...display[key], ...value } },
    });
  const row = (key: string, title: string, fallbackColor: string) => {
    const item = display[key] ?? {};
    return (
      <div
        className={`pine-setting-row${parameterSearch && title.toLocaleLowerCase().includes(parameterSearch.trim().toLocaleLowerCase()) ? " parameter-match" : ""}`}
        key={key}
      >
        <label>
          <input
            type="checkbox"
            checked={item.visible !== false}
            onChange={(event) =>
              setDisplay(key, { visible: event.target.checked })
            }
          />
          {title}
        </label>
        <input
          aria-label={`Цвет: ${title}`}
          title="Цвет элемента"
          type="color"
          value={(item.color ?? fallbackColor).slice(0, 7)}
          onChange={(event) => setDisplay(key, { color: event.target.value })}
        />
        {key.startsWith("plot:") &&
          result.plots.some((plot) => plot.title === title) && (
            <>
              <Choice
                label={`Стиль: ${title}`}
                value={
                  item.style ??
                  result.plots.find((plot) => plot.title === title)?.style ??
                  "line"
                }
                onChange={(style) =>
                  setDisplay(key, { style: style as PinePlotStyle })
                }
                items={[
                  ["line", "Линия"],
                  ["linebr", "Линия с разрывами"],
                  ["stepline", "Ступени"],
                  ["steplinebr", "Ступени с разрывами"],
                  ["stepline_diamond", "Ступени и ромбы"],
                  ["circles", "Точки"],
                  ["cross", "Крестики"],
                  ["columns", "Столбцы"],
                  ["histogram", "Гистограмма"],
                  ["area", "Область"],
                  ["areabr", "Область с разрывами"],
                  ["hline", "Уровень"],
                ]}
              />
              <input
                aria-label={`Толщина: ${title}`}
                type="number"
                min="1"
                max="4"
                value={
                  item.width ??
                  result.plots.find((plot) => plot.title === title)?.width ??
                  2
                }
                onChange={(event) =>
                  setDisplay(key, {
                    width: Math.max(
                      1,
                      Math.min(4, Number(event.target.value) || 1),
                    ) as 1 | 2 | 3 | 4,
                  })
                }
              />
            </>
          )}
      </div>
    );
  };

  return (
    <details className="pine-instance-settings" open={defaultOpen}>
      <summary>Параметры и отображение</summary>
      <label className="search-field settings-parameter-search">
        <span>⌕</span>
        <input
          aria-label="Поиск параметров"
          placeholder="Найти параметр…"
          value={parameterSearch}
          onChange={(event) => setParameterSearch(event.target.value)}
        />
      </label>
      {result.inputMeta.length > 0 && (
        <section>
          <h4>Параметры скрипта</h4>
          {result.inputMeta.map((input) => {
            const value = inputs[input.id] ?? input.defval;
            const title = input.title || input.name;
            return (
              <label
                className={`pine-setting-input${parameterSearch && `${title} ${input.group ?? ""}`.toLocaleLowerCase().includes(parameterSearch.trim().toLocaleLowerCase()) ? " parameter-match" : ""}`}
                key={input.id}
                title={input.tooltip}
              >
                <span>
                  {title}
                  {input.group ? ` · ${input.group}` : ""}
                </span>
                {input.type === "bool" ? (
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    disabled={input.active === false}
                    onChange={(event) =>
                      setInput(input.id, event.target.checked)
                    }
                  />
                ) : input.options?.length ? (
                  <Choice
                    label={input.title ?? input.name}
                    value={String(value)}
                    disabled={input.active === false}
                    onChange={(next) =>
                      setInput(
                        input.id,
                        input.type === "int" || input.type === "float"
                          ? Number(next)
                          : next,
                      )
                    }
                    items={input.options.map((option) => [
                      String(option),
                      String(option),
                    ])}
                  />
                ) : input.type === "int" || input.type === "float" ? (
                  <input
                    type="number"
                    value={Number(value)}
                    min={input.minval}
                    max={input.maxval}
                    step={input.step ?? (input.type === "int" ? 1 : "any")}
                    disabled={input.active === false}
                    onChange={(event) =>
                      setInput(
                        input.id,
                        input.type === "int"
                          ? Math.trunc(Number(event.target.value))
                          : Number(event.target.value),
                      )
                    }
                  />
                ) : input.type === "color" &&
                  /^#[\da-f]{6}$/i.test(String(value)) ? (
                  <input
                    type="color"
                    value={String(value)}
                    disabled={input.active === false}
                    onChange={(event) => setInput(input.id, event.target.value)}
                  />
                ) : (
                  <input
                    type="text"
                    value={String(value ?? "")}
                    disabled={input.active === false}
                    onChange={(event) => setInput(input.id, event.target.value)}
                  />
                )}
              </label>
            );
          })}
        </section>
      )}
      <section>
        <h4>Элементы на графике</h4>
        {result.plots.map((plot) =>
          row(`plot:${plot.title}`, plot.title, plot.color),
        )}
        {row(
          "markers",
          "Маркеры сигналов",
          result.markers[0]?.color ?? "#99a5ff",
        )}
        {result.visuals
          ?.filter(
            (visual) =>
              !result.plots.some((plot) => plot.title === visual.title) &&
              !["char", "shape"].includes(visual.kind),
          )
          .map((visual) =>
            row(
              `plot:${visual.title}`,
              visual.title,
              String(visual.options.color ?? "#2962ff"),
            ),
          )}
        {row("polylines", "Ломаные и кривые", "#2962ff")}
        {row("linefills", "Заливки между линиями", "#2962ff")}
        {row("tables", "Таблицы", "#ffffff")}
        {row("boxes", "Боксы", "#f59e0b")}
        {row("lines", "Линии", "#99a5ff")}
        {row("labels", "Подписи", "#ffffff")}
      </section>
    </details>
  );
}
