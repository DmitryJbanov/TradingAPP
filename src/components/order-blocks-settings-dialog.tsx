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
  normalizeOrderBlockParams,
  orderBlockDefaults,
} from "../indicators/order-blocks-settings";

const allFrames: Timeframe[] = ["15m", "1h", "4h", "1d"];
export function OrderBlocksSettingsDialog({
  instance,
  onClose,
  onApply,
}: {
  instance: IndicatorInstance;
  onClose: () => void;
  onApply: (next: IndicatorInstance) => void;
}) {
  const [params, setParams] = useState(() =>
    normalizeOrderBlockParams(instance.params),
  );
  const [sensitivity, setSensitivity] = useState(String(params.sens));
  const [frames, setFrames] = useState(instance.timeframes ?? allFrames);
  const [error, setError] = useState("");
  function apply() {
    const sens = Number(sensitivity);
    if (!Number.isInteger(sens) || sens < 1) {
      setError("Sensitivity: введите целое число не меньше 1.");
      return;
    }
    const next = normalizeOrderBlockParams({ ...params, sens });
    onApply({
      ...instance,
      params: next,
      color: next.col_bullish,
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
          <DialogTitle>Sonarlab · Order Blocks · Настройки</DialogTitle>
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
              <fieldset className="vmc-group">
                <legend>Version</legend>
                <label className="vmc-field">
                  <span>Version</span>
                  <output>{params._v}</output>
                </label>
              </fieldset>
              <fieldset className="vmc-group">
                <legend>Order Block</legend>
                <label className="vmc-field">
                  <span>Sensitivity</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    aria-label="Sensitivity"
                    value={sensitivity}
                    onChange={(e) => {
                      setSensitivity(e.target.value);
                      setError("");
                    }}
                  />
                </label>
                <p className="muted">
                  Меньше чувствительность — больше зон. Значение 28
                  соответствует порогу изменения цены 0,28%.
                </p>
                <label className="vmc-field">
                  <span>OB Mitigation Type</span>
                  <Choice
                    label="OB Mitigation Type"
                    value={params.OBMitigationType}
                    onChange={(value) =>
                      setParams({
                        ...params,
                        OBMitigationType: value === "Wick" ? "Wick" : "Close",
                      })
                    }
                    items={[
                      ["Close", "Close · закрытие"],
                      ["Wick", "Wick · тень"],
                    ]}
                  />
                </label>
                <p className="muted">
                  Close: зона удаляется по закрытию предыдущей свечи. Wick: по
                  high/low текущей свечи.
                </p>
              </fieldset>
              <fieldset className="vmc-group">
                <legend>Сигналы</legend>
                {(
                  [
                    ["buy_alert", "Buy Signal"],
                    ["sell_alert", "Sell Signal"],
                  ] as const
                ).map(([key, label]) => (
                  <label className="vmc-field" key={key}>
                    <span>{label}</span>
                    <Switch
                      aria-label={label}
                      checked={params[key]}
                      onCheckedChange={(value) =>
                        setParams({ ...params, [key]: value })
                      }
                    />
                  </label>
                ))}
                <p className="muted">
                  Условия сигналов проверяются на каждой свече. Под графиком
                  отображается последний сигнал и его время UTC.
                </p>
              </fieldset>
            </TabsContent>
            <TabsContent value="style">
              {(
                [
                  [
                    "Бычьи зоны",
                    "col_bullish",
                    "col_bullish_ob",
                    "bullishTransparency",
                  ],
                  [
                    "Медвежьи зоны",
                    "col_bearish",
                    "col_bearish_ob",
                    "bearishTransparency",
                  ],
                ] as const
              ).map(([label, border, background, transparency]) => (
                <fieldset className="vmc-group" key={border}>
                  <legend>{label}</legend>
                  <label className="vmc-field">
                    <span>Граница</span>
                    <input
                      type="color"
                      aria-label={`${label} · граница`}
                      value={params[border]}
                      onChange={(e) =>
                        setParams({ ...params, [border]: e.target.value })
                      }
                    />
                  </label>
                  <label className="vmc-field">
                    <span>Фон</span>
                    <input
                      type="color"
                      aria-label={`${label} · фон`}
                      value={params[background]}
                      onChange={(e) =>
                        setParams({ ...params, [background]: e.target.value })
                      }
                    />
                  </label>
                  <label className="vmc-field">
                    <span>Прозрачность фона, %</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      aria-label={`${label} · прозрачность`}
                      value={params[transparency]}
                      onChange={(e) =>
                        setParams({
                          ...params,
                          [transparency]: Number(e.target.value),
                        })
                      }
                    />
                    <output>{params[transparency]}</output>
                  </label>
                </fieldset>
              ))}
            </TabsContent>
            <TabsContent value="visibility">
              <fieldset className="vmc-group">
                <legend>Показывать на таймфреймах</legend>
                {allFrames.map((tf) => (
                  <label className="vmc-field" key={tf}>
                    <span>{tf}</span>
                    <Switch
                      aria-label={tf}
                      checked={frames.includes(tf)}
                      onCheckedChange={(value) =>
                        setFrames(
                          value
                            ? [...frames, tf]
                            : frames.filter((x) => x !== tf),
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
              setParams({ ...orderBlockDefaults });
              setSensitivity(String(orderBlockDefaults.sens));
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
