"use client";
import type { PineInstanceSettings, PineResult } from "../domain/pine-scripts";

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
      <div className="pine-setting-row" key={key}>
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
          value={item.color ?? fallbackColor}
          onChange={(event) => setDisplay(key, { color: event.target.value })}
        />
        {key.startsWith("plot:") && (
          <>
            <select
              aria-label={`Стиль: ${title}`}
              value={
                item.style ??
                result.plots.find((plot) => plot.title === title)?.style ??
                "line"
              }
              onChange={(event) =>
                setDisplay(key, {
                  style: event.target.value as "line" | "area" | "histogram",
                })
              }
            >
              <option value="line">Линия</option>
              <option value="histogram">Гистограмма</option>
              <option value="area">Область</option>
            </select>
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
      {result.inputMeta.length > 0 && (
        <section>
          <h4>Параметры скрипта</h4>
          {result.inputMeta.map((input) => {
            const value = inputs[input.id] ?? input.defval;
            const title = input.title || input.name;
            return (
              <label
                className="pine-setting-input"
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
                  <select
                    value={String(value)}
                    disabled={input.active === false}
                    onChange={(event) =>
                      setInput(
                        input.id,
                        input.type === "int" || input.type === "float"
                          ? Number(event.target.value)
                          : event.target.value,
                      )
                    }
                  >
                    {input.options.map((option) => (
                      <option key={String(option)} value={String(option)}>
                        {String(option)}
                      </option>
                    ))}
                  </select>
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
        {row("boxes", "Боксы", "#f59e0b")}
        {row("lines", "Линии", "#99a5ff")}
        {row("labels", "Подписи", "#ffffff")}
      </section>
    </details>
  );
}
