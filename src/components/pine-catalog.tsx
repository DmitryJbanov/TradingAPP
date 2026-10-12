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
  const list = (
    tab === "strategies"
      ? [
          ...pineTemplates,
          ...scripts.filter((s) => !pineTemplates.some((t) => t.id === s.id)),
        ]
      : custom
        ? scripts
        : []
  ).filter(
    (s) =>
      s.kind === kind && s.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      {list.map((s) => (
        <div className="indicator-definition" key={s.id}>
          <div>
            <b>{s.name}</b>
          </div>
          <button
            className="icon-button"
            aria-label={`Открыть код ${s.name}`}
            onClick={() =>
              onEdit(
                scripts.some((x) => x.id === s.id)
                  ? s
                  : { ...s, id: crypto.randomUUID() },
              )
            }
          >
            <Pencil size={16} />
          </button>
          {scripts.some((x) => x.id === s.id) && (
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
