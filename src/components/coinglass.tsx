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
  coinglassParams,
  calculationParams,
  jobState,
  type CoinglassJob,
  type CoinglassParams,
} from "../domain/coinglass";
import { useResource } from "../hooks/use-resource";
import type { useCoinglass } from "../hooks/use-coinglass";

export function CoinglassMonitor() {
  const r = useResource<{ jobs: CoinglassJob[]; headless: boolean }>(
    "/api/coinglass/status",
    5000,
  );
  return (
    <div className="coinglass-monitor">
      <strong>CoinGlass · фоновый парсер</strong>
      <p role="status">
        {r.error ||
          (r.data ? "Сервис доступен · без окон" : "Проверка сервиса…")}
      </p>
      {r.data && !r.data.jobs.length && <p>Задания ещё не запускались.</p>}
      {r.data?.jobs.slice(0, 5).map((j) => (
        <div key={j.id}>
          <b>
            {j.asset}: {jobState[j.state]}
          </b>
          <progress
            aria-label={`Прогресс CoinGlass ${j.asset}`}
            value={j.progress}
            max={100}
          />
          <small>
            {j.progress}% · {j.message}
          </small>
        </div>
      ))}
    </div>
  );
}
export function CoinglassPanel({
  state,
  openSettings,
}: {
  state: ReturnType<typeof useCoinglass>;
  openSettings: (id: string) => void;
}) {
  if (!state.instances.length) return null;
  const job = state.job;
  return (
    <section
      className="coinglass-panel"
      aria-label="Карта ликвидаций CoinGlass"
    >
      <h3>CoinGlass · карта за 90 дней</h3>
      <p role="status">
        {state.error ||
          (job
            ? `${jobState[job.state]}: ${job.message}`
            : state.loading
              ? "Проверка состояния…"
              : "Запустите парсинг для этого актива.")}
      </p>
      {job && (
        <progress
          aria-label="Прогресс парсинга"
          max={100}
          value={job.progress}
        />
      )}
      {job?.result && (
        <p>
          Снимок: {new Date(job.result.collectedAt).toLocaleString("ru-RU")} ·
          уровней: {job.result.levels.length}. Цены карты — USD; наложение на
          USD/USDT/USDC.
        </p>
      )}
      {job?.state === "error" && job.result && (
        <p className="warning">
          Обновление не удалось. На графике остаётся предыдущий снимок.
        </p>
      )}
      {state.instances.map((i) => {
        const params = coinglassParams(i.params);
        const stale =
          job?.result &&
          Date.now() - Date.parse(job.result.collectedAt) >
            params.staleHours * 3600000;
        const changed =
          job?.result &&
          Object.entries(calculationParams(params)).some(
            ([key, value]) =>
              job.result!.params[key as keyof typeof job.result.params] !==
              value,
          );
        return (
          <div key={i.id}>
            {stale && (
              <p className="warning">
                Снимок старше {params.staleHours} ч. Запустите обновление.
              </p>
            )}
            {changed && (
              <p className="warning">
                Настройки расчёта изменены. Запустите парсинг, чтобы пересчитать
                уровни.
              </p>
            )}
            {!i.enabled && <p>Индикатор скрыт.</p>}
            <button
              type="button"
              className="button"
              onClick={() => openSettings(i.id)}
            >
              Настройки CoinGlass
            </button>{" "}
            <button
              type="button"
              className="button"
              disabled={
                state.submitting ||
                job?.state === "running" ||
                job?.state === "queued"
              }
              onClick={() => void state.run(i)}
            >
              {state.submitting ? "Запуск…" : "Запустить / обновить парсинг"}
            </button>
          </div>
        );
      })}
    </section>
  );
}
export function CoinglassSettingsDialog({
  instance,
  onClose,
  onApply,
}: {
  instance: IndicatorInstance;
  onClose: () => void;
  onApply: (i: IndicatorInstance) => void;
}) {
  const [params, setParams] = useState(() => coinglassParams(instance.params));
  const [error, setError] = useState("");
  const fields: [keyof CoinglassParams, string, number, number, number][] = [
    ["minRelative", "Минимальная высота / максимум карты", 0, 1, 0.05],
    ["minProminence", "Минимальная выраженность пика", 0, 1, 0.05],
    ["limit", "Количество ближайших значимых уровней", 1, 50, 1],
    ["hoverMs", "Задержка сбора, мс", 50, 250, 10],
    ["lineWidth", "Толщина линий", 1, 4, 1],
    ["staleHours", "Считать снимок устаревшим через, ч", 1, 720, 1],
  ];
  function apply() {
    const next = coinglassParams(params);
    if (fields.some(([key]) => params[key] !== next[key])) {
      setError("Проверьте диапазоны числовых настроек.");
      return;
    }
    onApply({ ...instance, params: next, color: next.aboveColor });
    onClose();
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="coinglass-dialog">
        <DialogHeader>
          <DialogTitle>CoinGlass · настройки</DialogTitle>
          <DialogDescription>
            Отбор значимых пиков 90-дневной карты выполняется парсером.
            Изменение цвета применяется сразу после сохранения, расчёт — при
            следующем запуске.
          </DialogDescription>
        </DialogHeader>
        <div className="coinglass-fields">
          {fields.map(([key, label, min, max, step]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={Number.isNaN(params[key]) ? "" : (params[key] as number)}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    [key]: e.target.value === "" ? NaN : Number(e.target.value),
                  }))
                }
              />
            </label>
          ))}
          <label>
            Отбор относительно цены снимка
            <select
              value={params.side}
              onChange={(e) =>
                setParams((p) => ({
                  ...p,
                  side: e.target.value as CoinglassParams["side"],
                }))
              }
            >
              <option value="both">С обеих сторон</option>
              <option value="above">Выше цены</option>
              <option value="below">Ниже цены</option>
            </select>
          </label>
          <label>
            Цвет выше цены снимка
            <input
              type="color"
              value={params.aboveColor}
              onChange={(e) =>
                setParams((p) => ({ ...p, aboveColor: e.target.value }))
              }
            />
          </label>
          <label>
            Цвет ниже цены снимка
            <input
              type="color"
              value={params.belowColor}
              onChange={(e) =>
                setParams((p) => ({ ...p, belowColor: e.target.value }))
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={params.showLabels}
              onChange={(e) =>
                setParams((p) => ({ ...p, showLabels: e.target.checked }))
              }
            />{" "}
            Подписи уровней
          </label>
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="button" className="button" onClick={apply}>
          Сохранить настройки
        </button>
      </DialogContent>
    </Dialog>
  );
}
