import type { PineResult } from "../domain/pine-scripts";
const number = (n: number | undefined) =>
  n !== undefined && Number.isFinite(n)
    ? n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })
    : "—";
const date = (time: number | undefined) =>
  time === undefined
    ? "Открыта"
    : new Date(time * 1000).toLocaleString("ru-RU");
export function PineStrategyReport({ results }: { results: PineResult[] }) {
  return (
    <>
      {results
        .filter((r) => r.strategy)
        .map((r) => {
          const s = r.strategy!,
            closed = s.trades.filter((t) => t.exit !== undefined);
          return (
            <details className="pine-strategy-report panel" key={r.id} open>
              <summary>Тестер стратегий · {r.name}</summary>
              <div className="pine-strategy-metrics">
                <span>
                  Капитал <b>{number(s.equity)}</b>
                </span>
                <span>
                  Чистая прибыль{" "}
                  <b className={s.netProfit >= 0 ? "positive" : "negative"}>
                    {number(s.netProfit)}
                  </b>
                </span>
                <span>
                  Макс. просадка <b>{number(s.maxDrawdown)}</b>
                </span>
                <span>
                  Закрытых сделок <b>{closed.length}</b>
                </span>
                <span>
                  Успешных{" "}
                  <b>
                    {closed.length
                      ? number((s.wins / closed.length) * 100)
                      : "0"}
                    %
                  </b>
                </span>
              </div>
              <p className="muted">
                Симуляция по загруженной истории; начальный капитал{" "}
                {number(s.initialCapital)}. Последние 100 сделок. Реальные
                ордера не отправляются.
              </p>
              <div className="pine-trades">
                <table>
                  <thead>
                    <tr>
                      <th>Направление</th>
                      <th>Вход</th>
                      <th>Цена</th>
                      <th>Выход</th>
                      <th>Цена</th>
                      <th>P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.trades
                      .slice(-100)
                      .reverse()
                      .map((t, i) => (
                        <tr key={i}>
                          <td>{t.size > 0 ? "Long" : "Short"}</td>
                          <td>{date(t.entry)}</td>
                          <td>{number(t.entryPrice)}</td>
                          <td>{date(t.exit)}</td>
                          <td>{number(t.exitPrice)}</td>
                          <td
                            className={
                              (t.profit ?? 0) >= 0 ? "positive" : "negative"
                            }
                          >
                            {number(t.profit)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
    </>
  );
}
