"use client";
import { Code2, Plus, Pencil, Trash2 } from "lucide-react";
import { pineTemplates, type PineScript } from "../domain/pine-scripts";
export function PineCatalog({
  tab,
  query,
  scripts,
  onAdd,
  onEdit,
  onDelete,
}: {
  tab: string;
  query: string;
  scripts: PineScript[];
  onAdd: (s: PineScript) => void;
  onEdit: (s: PineScript) => void;
  onDelete: (id: string) => void;
}) {
  const custom = tab.startsWith("custom");
  const kind =
    tab === "strategies" || tab === "custom-strategies"
      ? "strategy"
      : "indicator";
  const list = (custom ? scripts : pineTemplates).filter(
    (s) =>
      s.kind === kind && s.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      {list.map((s) => (
        <div className="indicator-definition" key={s.id}>
          <Code2 size={20} />
          <div>
            <b>{s.name}</b>
            <p>
              {s.kind === "strategy"
                ? "Стратегия · тестирование на истории"
                : "Индикатор · Pine Script"}
              {custom ? " · мой скрипт" : " · шаблон"}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label={`Открыть код ${s.name}`}
            onClick={() =>
              onEdit(custom ? s : { ...s, id: crypto.randomUUID() })
            }
          >
            <Pencil size={16} />
          </button>
          {custom && (
            <button
              className="icon-button"
              aria-label={`Удалить скрипт ${s.name}`}
              onClick={() => onDelete(s.id)}
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label={`Добавить ${s.name}`}
            onClick={() => onAdd(s)}
          >
            <Plus size={19} />
          </button>
        </div>
      ))}
      {custom && !list.length && (
        <p className="empty-state">
          Мои скрипты появятся здесь после сохранения в Pine Editor.
        </p>
      )}
    </>
  );
}
