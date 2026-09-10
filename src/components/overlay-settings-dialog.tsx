"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Choice } from "./controls";
import type { IndicatorInstance } from "../domain/workspace";
import {
  candleIntervals,
  type CandleInterval,
  type Timeframe,
} from "../domain/market";
import { drzFields, normalizeDrzParams } from "../indicators/drz-settings";
import { smcFields, normalizeSmcParams } from "../indicators/smc-settings";
import type {
  OverlayField,
  ParameterValue,
} from "../indicators/overlay-settings";
const allFrames: Timeframe[] = ["15m", "1h", "4h", "1d"];
export function OverlaySettingsDialog({
  instance,
  timeframe,
  onClose,
  onApply,
}: {
  instance: IndicatorInstance;
  timeframe: Timeframe;
  onClose: () => void;
  onApply: (i: IndicatorInstance) => void;
}) {
  const isDrz = instance.definitionId === "drz",
    fields = isDrz ? drzFields : smcFields,
    normalize = isDrz ? normalizeDrzParams : normalizeSmcParams;
  const [params, setParams] = useState<Record<string, ParameterValue>>(() =>
      normalize(instance.params),
    ),
    [frames, setFrames] = useState(instance.timeframes ?? allFrames),
    [error, setError] = useState("");
  function update(key: string, value: ParameterValue) {
    setParams((p) => ({ ...p, [key]: value }));
    setError("");
  }
  function apply() {
    const values = { ...params };
    for (const f of fields.filter((f) => f.kind === "number")) {
      const v = Number(values[f.key]);
      if (
        values[f.key] === "" ||
        !Number.isFinite(v) ||
        v < (f.min ?? 0) ||
        v > (f.max ?? 4000) ||
        (f.step === 1 && !Number.isInteger(v))
      ) {
        setError(
          `${f.label}: введите ${f.step === 1 ? "целое " : ""}число от ${f.min ?? 0} до ${f.max ?? 4000}.`,
        );
        return;
      }
      values[f.key] = v;
    }
    const next = normalize(values);
    onApply({
      ...instance,
      params: next,
      timeframes: frames,
      color: isDrz
        ? normalizeDrzParams(next).lower_zone_color
        : normalizeSmcParams(next).swingBullColorInput,
    });
    onClose();
  }
  function control(f: OverlayField) {
    if (f.kind === "boolean")
      return (
        <Switch
          aria-label={f.label}
          checked={Boolean(params[f.key])}
          onCheckedChange={(v) => update(f.key, v)}
        />
      );
    if (f.kind === "choice")
      return (
        <Choice
          label={f.label}
          value={String(params[f.key])}
          onChange={(v) => update(f.key, v)}
          items={(f.options ?? [])
            .filter(
              (v) =>
                f.key !== "fairValueGapsTimeframeInput" ||
                v === "Chart" ||
                candleIntervals[v as CandleInterval] >=
                  candleIntervals[timeframe],
            )
            .map((v) => [
              v,
              v === "confirmed"
                ? "Подтверждённые"
                : v === "pine"
                  ? "Pine · lookahead"
                  : v === "Chart"
                    ? "Текущий график"
                    : v,
            ])}
        />
      );
    return (
      <input
        aria-label={f.label}
        type={f.kind === "color" ? "color" : "number"}
        value={String(params[f.key])}
        min={f.min}
        max={f.max}
        step={f.step ?? "any"}
        onChange={(e) => update(f.key, e.target.value)}
      />
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="vmc-settings-dialog">
        <DialogHeader>
          <DialogTitle>
            {isDrz ? "DRZ · BOSWaves" : "SMC · LuxAlgo"} · Настройки
          </DialogTitle>
          <DialogDescription>
            Параметры этого экземпляра. Изменения вступят в силу после
            применения.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="inputs">
          <TabsList>
            <TabsTrigger value="inputs">Аргументы</TabsTrigger>
            <TabsTrigger value="style">Стиль</TabsTrigger>
            <TabsTrigger value="visibility">Видимость</TabsTrigger>
          </TabsList>
          <div className="vmc-settings-scroll">
            {(["inputs", "style"] as const).map((tab) => (
              <TabsContent value={tab} key={tab}>
                {[...new Set(fields.map((f) => f.group))].map((group) => {
                  const members = fields.filter(
                    (f) =>
                      f.group === group &&
                      (tab === "style"
                        ? f.kind === "color"
                        : f.kind !== "color"),
                  );
                  return members.length ? (
                    <fieldset className="vmc-group" key={group}>
                      <legend>{group}</legend>
                      {members.map((f) => (
                        <label className="vmc-field" key={f.key}>
                          <span>{f.label}</span>
                          {control(f)}
                        </label>
                      ))}
                    </fieldset>
                  ) : null;
                })}
                {tab === "inputs" && (
                  <p className="muted">
                    {isDrz
                      ? "Дельта оценивается по направлению свечи и объёму. Размер тика можно указать вручную. Статистика зон находится справа: сдвиньте график влево для её просмотра."
                      : "FVG: текущий или старший таймфрейм. Подтверждённый режим ждёт закрытия старшей свечи. Pine lookahead может перерисовывать историю. Уровни D/W/M используют календарь UTC."}
                  </p>
                )}
              </TabsContent>
            ))}
            <TabsContent value="visibility">
              <fieldset className="vmc-group">
                <legend>Показывать на таймфреймах</legend>
                {allFrames.map((tf) => (
                  <label className="vmc-field" key={tf}>
                    <span>{tf}</span>
                    <Switch
                      aria-label={tf}
                      checked={frames.includes(tf)}
                      onCheckedChange={(yes) =>
                        setFrames((fs) =>
                          yes ? [...fs, tf] : fs.filter((v) => v !== tf),
                        )
                      }
                    />
                  </label>
                ))}
              </fieldset>
            </TabsContent>
          </div>
        </Tabs>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="overlay-settings-actions">
          <button
            className="button"
            onClick={() => {
              setParams(normalize({}));
              setFrames(allFrames);
              setError("");
            }}
          >
            По умолчанию
          </button>
          <button className="button" onClick={onClose}>
            Отмена
          </button>
          <button className="button primary" onClick={apply}>
            Применить
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
