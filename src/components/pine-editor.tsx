"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [top, setTop] = useState(56);
  const [drawerWidth, setDrawerWidth] = useState(560);
  const resizeStart = useRef<{ x: number; width: number } | undefined>(
    undefined,
  );
  function resizeStartAt(e: React.PointerEvent<HTMLDivElement>) {
    resizeStart.current = { x: e.clientX, width: drawerWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function resizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeStart.current) return;
    const max = Math.min(window.innerWidth * 0.85, 960);
    setDrawerWidth(
      Math.max(
        Math.min(320, max),
        Math.min(
          max,
          resizeStart.current.width - (e.clientX - resizeStart.current.x),
        ),
      ),
    );
  }
  function resizeEnd() {
    resizeStart.current = undefined;
  }
  useEffect(() => {
    const header = document.querySelector(".topbar");
    const update = () =>
      setTop(Math.max(0, header?.getBoundingClientRect().bottom ?? 0));
    const observer = new ResizeObserver((entries) => {
      update();
      const drawer = entries.find((entry) =>
        entry.target.classList.contains("pine-drawer"),
      );
      const workspace = document.querySelector<HTMLElement>(
        ".pair-page.has-pine-editor",
      );
      if (drawer && workspace)
        workspace.style.setProperty(
          "--pine-editor-width",
          `${drawer.contentRect.width}px`,
        );
    });
    if (header) observer.observe(header);
    requestAnimationFrame(() => {
      const drawer = document.querySelector(".pine-drawer");
      if (drawer) observer.observe(drawer);
    });
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, []);
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
  return createPortal(
    <section
      className="pine-editor pine-drawer panel"
      style={{ top, width: `min(${drawerWidth}px, 100vw)` }}
      aria-label="Редактор Pine Script"
    >
      <div
        className="pine-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Изменить ширину Pine Editor"
        tabIndex={0}
        onPointerDown={resizeStartAt}
        onPointerMove={resizeMove}
        onPointerUp={resizeEnd}
        onPointerCancel={resizeEnd}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            setDrawerWidth((width) =>
              Math.max(
                320,
                Math.min(960, width + (e.key === "ArrowLeft" ? 20 : -20)),
              ),
            );
          }
        }}
      />
      <div className="pine-editor-heading">
        <b>
          <Code2 size={16} /> Pine Editor
        </b>
        <button
          className="icon-button"
          aria-label="Закрыть редактор"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="pine-script-controls">
        <input
          aria-label="Название индикатора или стратегии"
          value={draft.name}
          maxLength={100}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <Choice
          label="Тип скрипта"
          value={draft.kind}
          items={[
            ["indicator", "Индикатор"],
            ["strategy", "Стратегия"],
          ]}
          onChange={(kind) =>
            onChange({ ...draft, kind: kind as "indicator" | "strategy" })
          }
        />
        {scripts.length > 0 && (
          <Choice
            label="Открыть сохранённый скрипт"
            value={
              scripts.some((s) => s.id === draft.id) ? draft.id : "__draft__"
            }
            items={[
              ["__draft__", "Скрипты"],
              ...scripts.map((s) => [s.id, s.name] as [string, string]),
            ]}
            onChange={(id) => {
              const script = scripts.find((s) => s.id === id);
              if (script) onChange(script);
            }}
          />
        )}
        <button className="button" onClick={() => fresh(draft.kind)}>
          <Plus size={13} /> Новый{" "}
          {draft.kind === "indicator" ? "индикатор" : "скрипт"}
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
          <Save size={13} />{" "}
          {saved === JSON.stringify(draft) ? "Сохранено" : "Сохранить"}
        </button>
        <button className="button" disabled={!valid} onClick={() => save(true)}>
          <Play size={13} /> Сохранить и добавить
        </button>
        <button className="button" onClick={() => upload.current?.click()}>
          <Upload size={13} /> Импорт
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
    </section>,
    document.body,
  );
}
