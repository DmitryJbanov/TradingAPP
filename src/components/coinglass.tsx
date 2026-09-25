"use client";
import { RefreshCw, Settings2 } from "lucide-react";
import {
  coinglassParams,
  calculationParams,
  jobState,
  type CoinglassJob,
} from "../domain/coinglass";
import { useSnapshotClock } from "../hooks/use-coinglass-preview";
import { useResource } from "../hooks/use-resource";
import type { useCoinglass } from "../hooks/use-coinglass";
import type { IndicatorInstance } from "../domain/workspace";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  onChange,
}: {
  state: ReturnType<typeof useCoinglass>;
  openSettings: (id: string) => void;
  onChange: (next: IndicatorInstance) => void;
}) {
  const now = useSnapshotClock();
  if (!state.instances.length) return null;
  const job = state.job;
  const result = state.result;
  return (
    <section
      className="coinglass-panel"
      aria-label="Карта ликвидаций CoinGlass"
    >
      <h3>
        CoinGlass ·{" "}
        {result ? `карта за ${result.rangeDays} дн.` : "карта ликвидаций"}
      </h3>
      <p role="status">
        {state.error ||
          (job
            ? `${jobState[job.state]}: ${job.message}`
            : state.loading
              ? "Проверка состояния…"
              : "Запустите парсинг для этого актива.")}
      </p>
      {state.recalculating && (
        <p role="status">Пересчёт уровней по сохранённому снимку…</p>
      )}
      {state.error && state.snapshotId && (
        <button className="button" onClick={state.retryPreview}>
          Повторить расчёт
        </button>
      )}
      {job && (
        <progress
          aria-label="Прогресс парсинга"
          max={100}
          value={job.progress}
        />
      )}
      {(job?.state === "error" || state.error) && result && (
        <p className="warning">
          Обновление не удалось. На графике остаётся предыдущий снимок.
        </p>
      )}
      {state.instances.map((i) => {
        const params = coinglassParams(i.params);
        const stale =
          result &&
          now - Date.parse(result.collectedAt) > params.staleHours * 3600000;
        const changed =
          !state.snapshotId &&
          result &&
          Object.entries(calculationParams(params)).some(
            ([key, value]) =>
              result!.params[key as keyof typeof result.params] !== value,
          );
        return (
          <div className="coinglass-controls" key={i.id}>
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
              className="button compact-action"
              onClick={() => openSettings(i.id)}
            >
              <Settings2 size={14} /> Визуально
            </button>{" "}
            <label className="compact-filter">
              <span>Период</span>
              <Select
                value={String(params.rangeDays)}
                disabled={
                  state.submitting ||
                  job?.state === "running" ||
                  job?.state === "queued"
                }
                onValueChange={(value) =>
                  onChange({
                    ...i,
                    params: { ...params, rangeDays: Number(value) },
                  })
                }
              >
                <SelectTrigger size="sm" aria-label="Период карты ликвидаций">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 7, 30, 90, 180, 365].map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {days} дн.
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>{" "}
            <button
              type="button"
              className="button compact-action"
              disabled={
                state.submitting ||
                job?.state === "running" ||
                job?.state === "queued"
              }
              onClick={() => void state.run(i)}
            >
              <RefreshCw size={14} />
              {state.submitting ? "Парсинг…" : "Обновить"}
            </button>
          </div>
        );
      })}
    </section>
  );
}
export { CoinglassSettingsDialog } from "./coinglass-settings-dialog";
