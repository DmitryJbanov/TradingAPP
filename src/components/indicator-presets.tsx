"use client";
import { useState } from "react";
import type { IndicatorInstance } from "../domain/workspace";
import {
  INDICATOR_PRESETS_KEY,
  emptyPresets,
  readPresets,
  presetKind,
  presetSettings,
  applyPreset,
  validPresetStore,
  type PresetStore,
} from "../domain/indicator-presets";
import { useStored } from "../hooks/use-resource";
import { useProfiles } from "./profile-provider";
import { Choice } from "./controls";
import "./indicator-presets.css";

export function IndicatorPresets({
  instance,
  onLoad,
}: {
  instance: IndicatorInstance;
  onLoad: (next: IndicatorInstance) => void;
}) {
  const [raw, setStore] = useStored<PresetStore>(
    INDICATOR_PRESETS_KEY,
    emptyPresets,
  );
  const profiles = useProfiles();
  const store = readPresets(raw),
    kind = presetKind(instance);
  const items = store.items.filter((p) => p.kind === kind);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = items.find((p) => p.id === selectedId);
  const isDefault = !!selected && store.defaults[kind] === selected.id;
  async function save(next: PresetStore) {
    if (!validPresetStore(next)) {
      setMessage(
        "Проверьте параметры: пресет должен содержать допустимые значения.",
      );
      return false;
    }
    setBusy(true);
    setMessage("");
    setStore(next);
    try {
      await profiles?.saveValue(INDICATOR_PRESETS_KEY);
      setMessage("Сохранено");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!name.trim()) {
      setMessage("Введите название пресета");
      return;
    }
    if (items.some((p) => p.name === name.trim())) {
      setMessage("Название уже занято. Выберите пресет и нажмите «Обновить».");
      return;
    }
    const preset = {
      id: crypto.randomUUID(),
      kind,
      name: name.trim(),
      settings: presetSettings(instance),
    };
    if (await save({ ...store, items: [...store.items, preset] }))
      setSelectedId(preset.id);
  }
  return (
    <section className="indicator-presets" aria-label="Пресеты индикатора">
      <div className="indicator-presets-row">
        <b>Пресеты</b>
        <Choice
          label="Пресет параметров"
          value={selected?.id ?? "none"}
          items={[
            ["none", "Выберите пресет"],
            ...items.map((p): [string, string] => [
              p.id,
              p.name + (store.defaults[kind] === p.id ? " · по умолчанию" : ""),
            ]),
          ]}
          onChange={(id) => {
            setSelectedId(id);
            setName(items.find((p) => p.id === id)?.name ?? "");
            setMessage("");
          }}
        />
        <button
          className="button"
          disabled={!selected || busy}
          onClick={() => {
            if (selected) {
              onLoad(applyPreset(instance, selected));
              setMessage("Пресет загружен");
            }
          }}
        >
          Применить
        </button>
      </div>
      <div className="indicator-presets-row">
        <input
          aria-label="Название пресета"
          placeholder="Название пресета"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="button"
          disabled={busy}
          onClick={() => void create()}
        >
          Сохранить новый
        </button>
        <button
          className="button"
          disabled={!selected || busy}
          onClick={() =>
            selected &&
            void save({
              ...store,
              items: store.items.map((p) =>
                p.id === selected.id
                  ? { ...p, settings: presetSettings(instance) }
                  : p,
              ),
            })
          }
        >
          Обновить
        </button>
        <button
          className="button"
          disabled={!selected || !name.trim() || busy}
          onClick={() => {
            if (!selected) return;
            if (
              items.some((p) => p.id !== selected.id && p.name === name.trim())
            ) {
              setMessage("Название уже занято");
              return;
            }
            void save({
              ...store,
              items: store.items.map((p) =>
                p.id === selected.id ? { ...p, name: name.trim() } : p,
              ),
            });
          }}
        >
          Переименовать
        </button>
        <button
          className="button"
          disabled={!selected || busy}
          onClick={async () => {
            if (!selected) return;
            const defaults = { ...store.defaults };
            if (isDefault) delete defaults[kind];
            if (
              await save({
                items: store.items.filter((p) => p.id !== selected.id),
                defaults,
              })
            ) {
              setSelectedId("");
              setName("");
            }
          }}
        >
          Удалить
        </button>
      </div>
      <label className="indicator-presets-default">
        <input
          type="checkbox"
          checked={isDefault}
          disabled={!selected || busy}
          onChange={(e) => {
            if (!selected) return;
            const defaults = { ...store.defaults };
            if (e.target.checked) defaults[kind] = selected.id;
            else delete defaults[kind];
            void save({ ...store, defaults });
          }}
        />
        Использовать по умолчанию при добавлении индикатора
      </label>
      {message && (
        <span role="status" className="indicator-presets-status">
          {message}
        </span>
      )}
    </section>
  );
}
