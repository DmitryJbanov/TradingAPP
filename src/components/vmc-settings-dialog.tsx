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
import type { Timeframe } from "../domain/market";
import {
  vmcFields,
  vmcDefaults,
  normalizeVmcParams,
  normalizeVmcStyle,
  vmcStyleDefaults,
  vmcTimeframes,
  type VmcParams,
  type VmcStyle,
} from "../indicators/vmc-settings";
const allFrames: Timeframe[] = ["15m", "1h", "4h", "1d"];
/** Mounted with key=instance.id. Edits remain a draft until Apply; Escape discards. */
export function VmcSettingsDialog({
  instance,
  onClose,
  onApply,
}: {
  instance: IndicatorInstance;
  onClose: () => void;
  onApply: (next: IndicatorInstance) => void;
}) {
  const [params, setParams] = useState(() =>
    normalizeVmcParams(instance.params),
  );
  const [style, setStyle] = useState(() => normalizeVmcStyle(instance.style));
  const [frames, setFrames] = useState(instance.timeframes ?? allFrames);
  const [error, setError] = useState("");
  function field(key: keyof VmcParams, value: unknown) {
    setParams((p) => ({ ...p, [key]: value }));
    setError("");
  }
  const renderFields = (colors: boolean) =>
    [
      ...new Set(
        vmcFields
          .filter((f) => (f.kind === "color") === colors)
          .map((f) => f.group),
      ),
    ].map((group) => (
      <fieldset className="vmc-group" key={group}>
        <legend>{group}</legend>
        {vmcFields
          .filter((f) => f.group === group && (f.kind === "color") === colors)
          .map((f) => (
            <label className="vmc-field" key={f.key}>
              <span>{f.label}</span>
              {f.kind === "boolean" ? (
                <Switch
                  checked={params[f.key] as boolean}
                  onCheckedChange={(v) => field(f.key, v)}
                  aria-label={f.label}
                />
              ) : f.kind === "number" ? (
                <input
                  type="number"
                  aria-label={f.label}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  required
                  value={params[f.key] as number}
                  onChange={(e) =>
                    field(
                      f.key,
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                />
              ) : f.kind === "color" ? (
                <input
                  type="color"
                  aria-label={f.label}
                  value={params[f.key] as string}
                  onChange={(e) => field(f.key, e.target.value)}
                />
              ) : (
                <Choice
                  label={f.label}
                  value={String(params[f.key])}
                  onChange={(v) => field(f.key, v)}
                  items={
                    f.kind === "source"
                      ? [
                          "open",
                          "high",
                          "low",
                          "close",
                          "hl2",
                          "hlc3",
                          "ohlc4",
                        ].map((v) => [v, v])
                      : f.kind === "mode"
                        ? [
                            ["pine", "Как в Pine (перерисовка)"],
                            ["confirmed", "Только закрытые свечи"],
                          ]
                        : Object.entries(vmcTimeframes).map(([v, t]) => [v, t])
                  }
                />
              )}
            </label>
          ))}
      </fieldset>
    ));
  function apply() {
    const bad = vmcFields.find(
      (f) =>
        f.kind === "number" &&
        (typeof params[f.key] !== "number" ||
          !Number.isFinite(params[f.key]) ||
          Number(params[f.key]) < f.min! ||
          Number(params[f.key]) > f.max! ||
          (f.step === 1 && !Number.isInteger(params[f.key]))),
    );
    if (bad) {
      setError(
        `${bad.label}: допустимо число от ${bad.min} до ${bad.max}${bad.step === 1 ? " (целое)" : ""}.`,
      );
      return;
    }
    onApply({
      ...instance,
      params: normalizeVmcParams(params),
      style: normalizeVmcStyle(style),
      timeframes: frames,
    });
    onClose();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="vmc-settings-dialog">
        <DialogHeader>
          <DialogTitle>VMC Cipher B · Настройки</DialogTitle>
          <DialogDescription>
            Параметры этого экземпляра. Изменения вступают в силу после
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
            <TabsContent value="inputs">
              {renderFields(false)}
              <p className="muted">
                Sommi и MACD загружают отдельные свечи выбранных таймфреймов. В
                режиме Pine исторические Diamond могут перерисовываться.
              </p>
            </TabsContent>
            <TabsContent value="style">
              {renderFields(true)}
              <fieldset className="vmc-group">
                <legend>Отрисовка</legend>
                <label className="vmc-field">
                  <span>Толщина линий</span>
                  <Choice
                    label="Толщина линий"
                    value={String(style.lineWidth)}
                    onChange={(v) =>
                      setStyle({
                        ...style,
                        lineWidth: Number(v) as VmcStyle["lineWidth"],
                      })
                    }
                    items={[
                      ["1", "1 px"],
                      ["2", "2 px"],
                      ["3", "3 px"],
                    ]}
                  />
                </label>
                <label className="vmc-field">
                  <span>Непрозрачность, %</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={style.opacity}
                    onChange={(e) =>
                      setStyle({ ...style, opacity: Number(e.target.value) })
                    }
                  />
                  <output>{style.opacity}</output>
                </label>
                <label className="vmc-field">
                  <span>Уровни OB / OS</span>
                  <Switch
                    checked={style.levels}
                    onCheckedChange={(v) => setStyle({ ...style, levels: v })}
                  />
                </label>
                <label className="vmc-field">
                  <span>Малые точки пересечений WT</span>
                  <Switch
                    checked={style.crosses}
                    onCheckedChange={(v) => setStyle({ ...style, crosses: v })}
                  />
                </label>
              </fieldset>
            </TabsContent>
            <TabsContent value="visibility">
              <fieldset className="vmc-group">
                <legend>Показывать на таймфреймах</legend>
                {allFrames.map((tf) => (
                  <label className="vmc-field" key={tf}>
                    <span>{tf}</span>
                    <Switch
                      checked={frames.includes(tf)}
                      onCheckedChange={(v) =>
                        setFrames(
                          v ? [...frames, tf] : frames.filter((x) => x !== tf),
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
          <p role="alert" className="negative">
            {error}
          </p>
        )}
        <div className="vmc-settings-actions">
          <button
            className="button"
            onClick={() => {
              setParams({ ...vmcDefaults });
              setStyle({ ...vmcStyleDefaults });
              setFrames([...allFrames]);
              setError("");
            }}
          >
            По умолчанию
          </button>
          <span />
          <button className="button" onClick={onClose}>
            Отмена
          </button>
          <button className="button accent-button" onClick={apply}>
            Применить
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
