"use client";
import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import { useResource } from "../hooks/use-resource";
import { useProfiles } from "./profile-provider";
import { SiteHeader } from "./site-header";
type Note = {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
  revision: number;
};
const notesKey = "vector.notes.v1";
export function NotesPage() {
  const profiles = useProfiles();
  const [notes, setNotes] = useState<Note[]>(
    () =>
      profiles?.getValue<Note[]>(notesKey, []) ??
      (() => {
        try {
          return JSON.parse(localStorage.getItem(notesKey) ?? "[]");
        } catch {
          return [];
        }
      })(),
  );
  const dirty = useRef(new Set<string>());
  const [conflict, setConflict] = useState("");
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const resource = useResource<{ notes: Note[] }>(
    "/api/notes",
    5000,
    !!profiles,
  );
  useEffect(() => {
    if (!resource.data) return;
    setNotes((current) => [
      ...current.filter((n) => dirty.current.has(n.id)),
      ...resource.data!.notes.filter((n) => !dirty.current.has(n.id)),
    ]);
  }, [resource.data]);
  function update(id: string, patch: Partial<Note>) {
    dirty.current.add(id);
    setNotes((current) =>
      current.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    );
    setMessage("");
  }
  function add() {
    const id = crypto.randomUUID();
    dirty.current.add(id);
    setNotes((current) => [
      {
        id,
        title: "Новая заметка",
        body: "",
        updatedAt: Date.now(),
        revision: 0,
      },
      ...current,
    ]);
  }
  async function change(note: Note, remove = false) {
    setSaving(note.id);
    setMessage("");
    try {
      let saved: Note | undefined;
      if (profiles) {
        const response = await fetch(
          "/api/notes/" + encodeURIComponent(note.id),
          {
            method: remove ? "DELETE" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: note.title,
              body: note.body,
              revision: note.revision ?? 0,
            }),
          },
        );
        const data = (await response.json()) as { error?: string; note?: Note };
        if (response.status === 409) setConflict(note.id);
        if (!response.ok)
          throw Error(data.error || "Не удалось сохранить заметку");
        saved = data.note;
      } else if (!remove)
        saved = {
          ...note,
          updatedAt: Date.now(),
          revision: (note.revision ?? 0) + 1,
        };
      setNotes((current) => {
        const next = remove
          ? current.filter((n) => n.id !== note.id)
          : current.map((n) => {
              if (n.id !== note.id || !saved) return n;
              if (n.title === note.title && n.body === note.body) {
                dirty.current.delete(n.id);
                return saved;
              }
              return {
                ...n,
                revision: saved.revision,
                updatedAt: saved.updatedAt,
              };
            });
        if (remove) dirty.current.delete(note.id);
        if (!profiles) localStorage.setItem(notesKey, JSON.stringify(next));
        return next;
      });
      setConflict("");
      setMessage(remove ? "Заметка удалена" : "Заметка сохранена");
      if (profiles) void resource.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось сохранить заметку",
      );
    } finally {
      setSaving("");
    }
  }
  function copy(note: Note) {
    const copied = { ...note, id: crypto.randomUUID(), revision: 0 };
    dirty.current.delete(note.id);
    dirty.current.add(copied.id);
    setNotes((current) => [copied, ...current.filter((n) => n.id !== note.id)]);
    void change(copied);
  }
  function remove(note: Note) {
    if (!note.revision) {
      dirty.current.delete(note.id);
      setNotes((current) => current.filter((n) => n.id !== note.id));
      return;
    }
    void change(note, true);
  }
  return (
    <div className="terminal-shell">
      <SiteHeader active="notes" />
      <main className="dashboard notes-page">
        <div className="page-heading">
          <div>
            <div className="eyebrow">ОБЩАЯ РАБОЧАЯ ОБЛАСТЬ</div>
            <h1>Заметки</h1>
            <p>Общие записи для всех пользователей и профилей.</p>
            {(message || resource.error) && (
              <p className="notes-save-status" role="status">
                {message || resource.error}
              </p>
            )}
          </div>
          <button className="button" onClick={add}>
            Добавить заметку
          </button>
        </div>
        {notes.length ? (
          <div className="notes-grid">
            {notes.map((note) => (
              <article className="panel note-card" key={note.id}>
                <input
                  aria-label="Название заметки"
                  maxLength={500}
                  value={note.title}
                  onChange={(e) => update(note.id, { title: e.target.value })}
                />
                <textarea
                  aria-label="Текст заметки"
                  maxLength={100000}
                  value={note.body}
                  onChange={(e) => update(note.id, { body: e.target.value })}
                  placeholder="Текст заметки…"
                />
                <footer>
                  <small>
                    {dirty.current.has(note.id)
                      ? "Есть несохранённые изменения"
                      : "Изменено " +
                        new Date(note.updatedAt).toLocaleString("ru-RU")}
                  </small>
                  <div className="note-actions">
                    <button
                      className="button"
                      onClick={() => void change(note)}
                      disabled={!!saving}
                    >
                      <Save size={14} />
                      {saving === note.id ? "Сохранение…" : "Сохранить"}
                    </button>
                    {conflict === note.id && (
                      <button
                        className="button"
                        disabled={!!saving}
                        onClick={() => copy(note)}
                      >
                        Сохранить копию
                      </button>
                    )}
                    <button
                      className="button secondary"
                      disabled={!!saving}
                      onClick={() => remove(note)}
                    >
                      Удалить
                    </button>
                  </div>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <section className="panel notes-empty">
            Заметок пока нет. Создайте первую запись.
          </section>
        )}
      </main>
    </div>
  );
}
