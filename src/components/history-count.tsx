"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { validCandleCount } from "../domain/history";
export function HistoryCount({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <form
      className="history-count"
      onSubmit={(e) => {
        e.preventDefault();
        if (validCandleCount(Number(draft))) onChange(Number(draft));
      }}
    >
      <label htmlFor="history-count">Свечей</label>
      <input
        id="history-count"
        aria-label="Количество свечей, от 300 до 4000"
        type="number"
        min={300}
        max={4000}
        step={1}
        required
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button
        type="submit"
        className="icon-button"
        aria-label="Применить количество свечей"
        disabled={!validCandleCount(Number(draft)) || Number(draft) === value}
      >
        <Check size={16} />
      </button>
    </form>
  );
}
