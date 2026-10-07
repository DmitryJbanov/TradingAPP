"use client";
import { useRef, useState } from "react";
import { Code2, Play, Save, Download, Upload, X, Plus } from "lucide-react";
import { Choice } from "./controls";
import { pineTemplates, type PineScript } from "../domain/pine-scripts";
const tokenPattern =
  /(\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:indicator|strategy|plot|hline|input|if|else|for|while|var|varip|switch|true|false|na|and|or|not|int|float|bool|string|color|ta|math|request)\b|\b\d+(?:\.\d+)?\b)/g;
function highlight(source: string) {
  return source.split(tokenPattern).map((part, i) => {
    const kind = part.startsWith("//")
      ? "comment"
      : /^["']/.test(part)
        ? "string"
        : /^\d/.test(part)
          ? "number"
          : /^(indicator|strategy|plot|hline|input|if|else|for|while|var|varip|switch|true|false|na|and|or|not|int|float|bool|string|color|ta|math|request)$/.test(
                part,
              )
            ? "keyword"
            : "";
    return kind ? (
      <span key={i} className={`pine-${kind}`}>
        {part}
      </span>
    ) : (
      part
    );
  });
}
export function PineEditor({
  draft,
  scripts,
  onChange,
  onSave,
  onRun,
  onClose,
  loading,
  errors,
}: {
  draft: PineScript;
  scripts: PineScript[];
  onChange: (script: PineScript) => void;
  onSave: (script: PineScript) => void;
  onRun: (script: PineScript) => void;
  onClose: () => void;
  loading: boolean;
  errors: string[];
}) {
  const code = useRef<HTMLPreElement>(null),
    lines = useRef<HTMLPreElement>(null),
    upload = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState("");
  const save = (run = false) => {
    (run ? onRun : onSave)(draft);
    setSaved(JSON.stringify(draft));
  };
  const valid =
    draft.name.trim().length > 0 &&
    draft.source.trim().length > 0 &&
    draft.source.length <= 100000;
  const source = (value: string) =>
    onChange({
      ...draft,
      source: value,
      kind: /^\s*strategy\s*\(/m.test(value) ? "strategy" : "indicator",
    });
  const fresh = (kind: "indicator" | "strategy") =>
    onChange({
      ...pineTemplates.find((s) => s.kind === kind)!,
      id: crypto.randomUUID(),
      name: kind === "indicator" ? "Мой индикатор" : "Моя стратегия",
    });
  return (
    <section className="pine-editor panel" aria-label="Редактор Pine Script">
      <div className="pine-editor-toolbar">
        <b>
          <Code2 size={16} /> Pine Editor
        </b>
        <input
          aria-label="Название скрипта"
          value={draft.name}
          maxLength={100}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        {scripts.length > 0 && (
          <Choice
            label="Открыть сохранённый скрипт"
            value={
              scripts.some((s) => s.id === draft.id) ? draft.id : "__draft__"
            }
            items={[
              ["__draft__", "Мои скрипты"],
              ...scripts.map((s) => [s.id, s.name] as [string, string]),
            ]}
            onChange={(id) => {
              const s = scripts.find((s) => s.id === id);
              if (s) onChange(s);
            }}
          />
        )}
        <button className="button" onClick={() => fresh("indicator")}>
          <Plus size={14} /> Индикатор
        </button>
        <button className="button" onClick={() => fresh("strategy")}>
          <Plus size={14} /> Стратегия
        </button>
        <button
          className="icon-button"
          aria-label="Закрыть редактор"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="pine-code">
        <pre ref={lines} className="pine-line-numbers" aria-hidden="true">
          {draft.source
            .split("\n")
            .map((_, i) => i + 1)
            .join("\n")}
        </pre>
        <div className="pine-code-input">
          <pre ref={code} aria-hidden="true">
            {highlight(draft.source)}
            {"\n"}
          </pre>
          <textarea
            aria-label="Исходный код Pine Script"
            value={draft.source}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => source(e.target.value)}
            onScroll={(e) => {
              if (code.current) {
                code.current.scrollTop = e.currentTarget.scrollTop;
                code.current.scrollLeft = e.currentTarget.scrollLeft;
              }
              if (lines.current)
                lines.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onKeyDown={(e) => {
              if (
                (e.ctrlKey || e.metaKey) &&
                (e.key.toLowerCase() === "s" || e.key === "Enter")
              ) {
                e.preventDefault();
                if (valid) save(e.key === "Enter");
              }
              if (e.key === "Tab") {
                e.preventDefault();
                const t = e.currentTarget,
                  start = t.selectionStart,
                  end = t.selectionEnd;
                source(
                  draft.source.slice(0, start) +
                    "    " +
                    draft.source.slice(end),
                );
                requestAnimationFrame(() => {
                  t.selectionStart = t.selectionEnd = start + 4;
                });
              }
            }}
          />
        </div>
      </div>
      <div className="pine-editor-toolbar">
        <button className="button" disabled={!valid} onClick={() => save()}>
          <Save size={14} />{" "}
          {saved === JSON.stringify(draft) ? "Сохранено" : "Сохранить"}
        </button>
        <button className="button" disabled={!valid} onClick={() => save(true)}>
          <Play size={14} /> Сохранить и добавить на график
        </button>
        <button className="button" onClick={() => upload.current?.click()}>
          <Upload size={14} /> Импорт .pine
        </button>
        <input
          hidden
          ref={upload}
          type="file"
          accept=".pine,.txt"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 100000) {
              window.alert("Файл не должен превышать 100 КБ.");
              return;
            }
            const value = await file.text();
            onChange({
              ...draft,
              id: crypto.randomUUID(),
              name: file.name.replace(/\.(pine|txt)$/i, ""),
              source: value,
              kind: /^\s*strategy\s*\(/m.test(value) ? "strategy" : "indicator",
            });
            e.target.value = "";
          }}
        />
        <button
          className="button"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([draft.source], { type: "text/plain;charset=utf-8" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download =
              draft.name.replace(/[^\p{L}\p{N} _-]/gu, "_") + ".pine";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download size={14} /> Экспорт
        </button>
        <span className="muted">
          {loading ? "Расчёт…" : "Ctrl+S · сохранить / Ctrl+Enter · на график"}
        </span>
      </div>
      {errors.map((error) => (
        <p className="notice error" role="alert" key={error}>
          {error}
        </p>
      ))}
      <p className="pine-editor-note">
        Pine Script v5/v6 ·{" "}
        <a
          href="https://github.com/LuxAlgo/PineTS"
          target="_blank"
          rel="noreferrer"
        >
          PineTS 0.11.0 · AGPL-3.0
        </a>
        . Расчёт по загруженным свечам. request.* и часть графических объектов
        пока не подключены. Черновик и мои скрипты сохраняются в этом браузере.
      </p>
    </section>
  );
}
