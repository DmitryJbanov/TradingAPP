"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { IndicatorInstance } from "../domain/workspace";
import {
  normalizeStochRsiParams,
  stochSources,
  type StochRsiParams,
} from "../indicators/stoch-rsi";
import { Choice } from "./controls";

export function StochRsiSettingsDialog({
  instance,
  onClose,
  onApply,
}: {
  instance: IndicatorInstance;
  onClose: () => void;
  onApply: (next: IndicatorInstance) => void;
}) {
  const [params, setParams] = useState(() =>
    normalizeStochRsiParams(instance.params),
  );
  const [error, setError] = useState("");
  const fields = [
    ["smoothK", "K"],
    ["smoothD", "D"],
    ["lengthRSI", "RSI Length"],
    ["lengthStoch", "Stochastic Length"],
  ] as const;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="vmc-settings-dialog">
        <DialogHeader>
          <DialogTitle>Stochastic RSI · Настройки</DialogTitle>
          <DialogDescription>
            Линии K и D, уровни 20 / 50 / 80. Расчёт по свечам открытого
            графика.
          </DialogDescription>
        </DialogHeader>
        <div className="vmc-settings-scroll">
          <fieldset className="vmc-group">
            <legend>Параметры</legend>
            {fields.map(([key, label]) => (
              <label className="vmc-field" key={key}>
                <span>{label}</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  aria-label={label}
                  value={Number.isNaN(params[key]) ? "" : params[key]}
                  onChange={(e) => {
                    setParams({ ...params, [key]: e.target.valueAsNumber });
                    setError("");
                  }}
                />
              </label>
            ))}
            <label className="vmc-field">
              <span>RSI Source</span>
              <Choice
                label="RSI Source"
                value={params.source}
                items={stochSources.map((s) => [s, s])}
                onChange={(source) =>
                  setParams({
                    ...params,
                    source: source as StochRsiParams["source"],
                  })
                }
              />
            </label>
          </fieldset>
        </div>
        {error && <p role="alert">{error}</p>}
        <button
          className="button"
          onClick={() => {
            if (
              fields.some(
                ([key]) => !Number.isInteger(params[key]) || params[key] < 1,
              )
            ) {
              setError("Введите целые числа не меньше 1.");
              return;
            }
            onApply({ ...instance, params });
            onClose();
          }}
        >
          Применить
        </button>
      </DialogContent>
    </Dialog>
  );
}
