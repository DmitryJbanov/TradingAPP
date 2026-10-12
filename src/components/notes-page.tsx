"use client";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useStored } from "../hooks/use-resource";
import { useProfiles } from "./profile-provider";
import { SiteHeader } from "./site-header";

type Note = { id: string; title: string; body: string; updatedAt: number };
const notesKey = "vector.notes.v1";

export function NotesPage() {
  const [notes, setNotes] = useStored<Note[]>(notesKey, []);
  const profiles = useProfiles();
  const [draftNotes, setDraftNotes] = useState(notes);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  useEffect(() => setDraftNotes(notes), [notes]);
  const update = (id: string, patch: Partial<Note>) =>
    setDraftNotes((current) => current.map((note) => note.id === id ? { ...note, ...patch, updatedAt: Date.now() } : note));
  const add = () => setDraftNotes((current) => [{ id: crypto.randomUUID(), title: "Новая заметка", body: "", updatedAt: Date.now() }, ...current]);
  const save = async () => {
    setSaving(true);
    setSaveMessage("");
    setNotes(draftNotes);
    try {
      if (profiles) {
        await profiles.saveValue(notesKey);
      } else {
        localStorage.setItem(notesKey, JSON.stringify(draftNotes));
      }
      setSaveMessage("Заметки сохранены");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Не удалось сохранить заметки");
    } finally {
      setSaving(false);
    }
  };

  return <div className="terminal-shell">
    <SiteHeader active="notes" />
    <main className="dashboard notes-page">
      <div className="page-heading">
        <div><div className="eyebrow">ОБЩАЯ РАБОЧАЯ ОБЛАСТЬ</div><h1>Заметки</h1><p>Записи доступны для редактирования пользователям общего профиля.</p>{saveMessage && <p className="notes-save-status" role="status">{saveMessage}</p>}</div>
        <button className="button" onClick={add}>Добавить заметку</button>
      </div>
      {draftNotes.length ? <div className="notes-grid">{draftNotes.map((note) => <article className="panel note-card" key={note.id}>
        <input aria-label="Название заметки" value={note.title} onChange={(event) => update(note.id, { title: event.target.value })} />
        <textarea aria-label="Текст заметки" value={note.body} onChange={(event) => update(note.id, { body: event.target.value })} placeholder="Текст заметки…" />
        <footer><small>Изменено {new Date(note.updatedAt).toLocaleString("ru-RU")}</small><div className="note-actions"><button className="button" onClick={() => void save()} disabled={saving}><Save size={14} /> {saving ? "Сохранение…" : "Сохранить"}</button><button className="button secondary" onClick={() => { const next = draftNotes.filter((item) => item.id !== note.id); setDraftNotes(next); setNotes((current) => current.filter((item) => item.id !== note.id)); }}>Удалить</button></div></footer>
      </article>)}</div> : <section className="panel notes-empty">Заметок пока нет. Создайте первую запись.</section>}
    </main>
  </div>;
}
