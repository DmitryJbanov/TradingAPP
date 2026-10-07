"use client";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Copy,
  ExternalLink,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { SiteHeader } from "./site-header";
import { WhaleAnalytics } from "./whale-analytics";
import { Choice } from "./controls";
import { useResource } from "../hooks/use-resource";
import {
  exampleWhale,
  validWhaleAddress,
  type WhaleOverview,
  type WhaleMarketResponse,
  type WhaleWatchlist,
  type WhaleProfileResponse,
  type WhalePosition,
  type WhaleFill,
} from "../domain/whales";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const n = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: digits });
const usd = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "—" : `$${n(value)}`;
const price = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : `$${n(value, Math.abs(value) < 1 ? 8 : 4)}`;
const date = (value: number | string | null | undefined) =>
  value == null ? "—" : new Date(value).toLocaleString("ru-RU");
const tone = (value: number | null | undefined) =>
  value == null ? "" : value >= 0 ? "positive" : "negative";
const activityName = (value: string) =>
  ({
    "Open Long": "Открытие Long",
    "Close Long": "Закрытие Long",
    "Open Short": "Открытие Short",
    "Close Short": "Закрытие Short",
    "Long > Short": "Long → Short",
    "Short > Long": "Short → Long",
  })[value as "Open Long"] ?? value;
const wallet = (address: string) => (
  <a className="whale-address" href={`/whales/${address}`} title={address}>
    {short(address)}
  </a>
);

function SortHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  const Icon = active
    ? direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowDownUp;
  return (
    <th
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button className="whale-sort-button" onClick={onClick}>
        {label}
        <Icon size={12} aria-hidden="true" />
      </button>
    </th>
  );
}

function compareValue(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
) {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ru", {
    numeric: true,
    sensitivity: "base",
  });
}

function Positions({
  rows,
  overview = false,
  tracked,
  names,
  onTrack,
}: {
  rows: WhalePosition[];
  overview?: boolean;
  tracked?: Set<string>;
  names?: Map<string, string>;
  onTrack?: (address: string) => void;
}) {
  const [sort, setSort] = useState<{
    key: keyof WhalePosition | "name";
    direction: "asc" | "desc";
  }>({ key: "value", direction: "desc" });
  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          (sort.key === "name"
            ? compareValue(names?.get(a.address), names?.get(b.address))
            : compareValue(a[sort.key], b[sort.key])) *
          (sort.direction === "asc" ? 1 : -1),
      ),
    [rows, sort, names],
  );
  const toggleSort = (key: keyof WhalePosition | "name") =>
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  return (
    <div className="whale-table-scroll">
      <table className="whale-table">
        <thead>
          <tr>
            {overview && (
              <>
                <th></th>
                <SortHeader
                  label="Кошелёк"
                  active={sort.key === "address"}
                  direction={sort.direction}
                  onClick={() => toggleSort("address")}
                />
                <SortHeader
                  label="Имя"
                  active={sort.key === "name"}
                  direction={sort.direction}
                  onClick={() => toggleSort("name")}
                />
              </>
            )}
            <SortHeader
              label="Актив"
              active={sort.key === "coin"}
              direction={sort.direction}
              onClick={() => toggleSort("coin")}
            />
            <SortHeader
              label="Сторона"
              active={sort.key === "side"}
              direction={sort.direction}
              onClick={() => toggleSort("side")}
            />
            <SortHeader
              label="Плечо"
              active={sort.key === "leverage"}
              direction={sort.direction}
              onClick={() => toggleSort("leverage")}
            />
            <SortHeader
              label="Позиция"
              active={sort.key === "value"}
              direction={sort.direction}
              onClick={() => toggleSort("value")}
            />
            <SortHeader
              label="Количество"
              active={sort.key === "size"}
              direction={sort.direction}
              onClick={() => toggleSort("size")}
            />
            <SortHeader
              label="Вход"
              active={sort.key === "entryPrice"}
              direction={sort.direction}
              onClick={() => toggleSort("entryPrice")}
            />
            <SortHeader
              label="Цена"
              active={sort.key === "markPrice"}
              direction={sort.direction}
              onClick={() => toggleSort("markPrice")}
            />
            <SortHeader
              label="PnL"
              active={sort.key === "pnl"}
              direction={sort.direction}
              onClick={() => toggleSort("pnl")}
            />
            <SortHeader
              label="ROE"
              active={sort.key === "roe"}
              direction={sort.direction}
              onClick={() => toggleSort("roe")}
            />
            <SortHeader
              label="Ликвидация"
              active={sort.key === "liquidationPrice"}
              direction={sort.direction}
              onClick={() => toggleSort("liquidationPrice")}
            />
            <SortHeader
              label="Маржа"
              active={sort.key === "margin"}
              direction={sort.direction}
              onClick={() => toggleSort("margin")}
            />
            <SortHeader
              label="Funding"
              active={sort.key === "funding"}
              direction={sort.direction}
              onClick={() => toggleSort("funding")}
            />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((p) => (
            <tr key={`${p.address}:${p.coin}`}>
              {overview && (
                <>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Отслеживать ${p.address}`}
                      aria-pressed={tracked?.has(p.address)}
                      onClick={() => onTrack?.(p.address)}
                    >
                      <Star
                        size={14}
                        fill={tracked?.has(p.address) ? "currentColor" : "none"}
                      />
                    </button>
                  </td>
                  <td>{wallet(p.address)}</td>
                  <td>{names?.get(p.address) || "—"}</td>
                </>
              )}
              <td>
                <b>{p.coin}</b>
              </td>
              <td>
                <span
                  className={`whale-side ${p.side === "Long" ? "positive" : "negative"}`}
                >
                  {p.side}
                </span>
              </td>
              <td>
                {n(p.leverage, 0)}×{" "}
                <small>{p.marginType === "cross" ? "кросс" : "изол."}</small>
              </td>
              <td>{usd(p.value)}</td>
              <td>{n(p.size, 6)}</td>
              <td>{price(p.entryPrice)}</td>
              <td>{price(p.markPrice)}</td>
              <td className={tone(p.pnl)}>{usd(p.pnl)}</td>
              <td className={tone(p.roe)}>{n(p.roe)}%</td>
              <td>{price(p.liquidationPrice)}</td>
              <td>{usd(p.margin)}</td>
              <td className={tone(p.funding)}>{usd(p.funding)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="empty-state">
          Открытых позиций по выбранным условиям нет.
        </p>
      )}
    </div>
  );
}

function Trades({
  rows,
  overview = false,
  names,
}: {
  rows: WhaleFill[];
  overview?: boolean;
  names?: Map<string, string>;
}) {
  const [sort, setSort] = useState<{
    key: keyof WhaleFill | "name";
    direction: "asc" | "desc";
  }>({ key: "time", direction: "desc" });
  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          (sort.key === "name"
            ? compareValue(names?.get(a.address), names?.get(b.address))
            : compareValue(a[sort.key], b[sort.key])) *
          (sort.direction === "asc" ? 1 : -1),
      ),
    [rows, sort, names],
  );
  const toggleSort = (key: keyof WhaleFill | "name") =>
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  return (
    <div className="whale-table-scroll">
      <table className="whale-table">
        <thead>
          <tr>
            <SortHeader
              label="Время"
              active={sort.key === "time"}
              direction={sort.direction}
              onClick={() => toggleSort("time")}
            />
            {overview && (
              <SortHeader
                label="Кошелёк"
                active={sort.key === "address"}
                direction={sort.direction}
                onClick={() => toggleSort("address")}
              />
            )}
            {overview && (
              <SortHeader
                label="Имя"
                active={sort.key === "name"}
                direction={sort.direction}
                onClick={() => toggleSort("name")}
              />
            )}
            <SortHeader
              label="Актив"
              active={sort.key === "coin"}
              direction={sort.direction}
              onClick={() => toggleSort("coin")}
            />
            <SortHeader
              label="Действие"
              active={sort.key === "action"}
              direction={sort.direction}
              onClick={() => toggleSort("action")}
            />
            <SortHeader
              label="Цена"
              active={sort.key === "price"}
              direction={sort.direction}
              onClick={() => toggleSort("price")}
            />
            <SortHeader
              label="Количество"
              active={sort.key === "size"}
              direction={sort.direction}
              onClick={() => toggleSort("size")}
            />
            <SortHeader
              label="Объём"
              active={sort.key === "value"}
              direction={sort.direction}
              onClick={() => toggleSort("value")}
            />
            <SortHeader
              label="Закрытый PnL"
              active={sort.key === "pnl"}
              direction={sort.direction}
              onClick={() => toggleSort("pnl")}
            />
            <SortHeader
              label="Комиссия"
              active={sort.key === "fee"}
              direction={sort.direction}
              onClick={() => toggleSort("fee")}
            />
          </tr>
        </thead>
        <tbody>
          {sortedRows.slice(0, 200).map((t) => (
            <tr key={`${t.address}:${t.id}`}>
              <td>{date(t.time)}</td>
              {overview && (
                <>
                  <td>{wallet(t.address)}</td>
                  <td>{names?.get(t.address) || "—"}</td>
                </>
              )}
              <td>
                <b>{t.coin}</b>
              </td>
              <td
                className={t.action.includes("Long") ? "positive" : "negative"}
              >
                {activityName(t.action)}
              </td>
              <td>{price(t.price)}</td>
              <td>{n(t.size, 6)}</td>
              <td>{usd(t.value)}</td>
              <td className={tone(t.pnl)}>{usd(t.pnl)}</td>
              <td>{usd(t.fee)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="empty-state">
          В доступной истории нет фьючерсных сделок.
        </p>
      )}
    </div>
  );
}

function PnlChart({ points }: { points: [number, string][] }) {
  if (points.length < 2)
    return <p className="empty-state">История PnL пока недоступна.</p>;
  const values = points.map((p) => Number(p[1]));
  const min = Math.min(...values),
    max = Math.max(...values),
    spread = max - min || 1;
  const start = points[0][0],
    end = points.at(-1)![0],
    duration = end - start || 1;
  const coords = points
    .map(
      (p, i) =>
        `${70 + ((p[0] - start) / duration) * 900},${18 + ((max - values[i]) / spread) * 180}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 1000 245"
      className="whale-pnl-chart"
      role="img"
      aria-label="История прибыли и убытка"
    >
      <title>Изменение PnL за выбранный период</title>
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line
            x1="70"
            x2="970"
            y1={18 + v * 180}
            y2={18 + v * 180}
            stroke="var(--border)"
          />
          <text x="62" y={22 + v * 180} textAnchor="end">
            {n(max - v * spread, 0)}
          </text>
        </g>
      ))}
      <polyline
        points={coords}
        fill="none"
        stroke={values.at(-1)! >= 0 ? "#0ecb81" : "#f6465d"}
        strokeWidth="2"
      />
      {[0, 0.5, 1].map((v) => (
        <text
          key={v}
          x={70 + v * 900}
          y="228"
          textAnchor={v === 0 ? "start" : v === 1 ? "end" : "middle"}
        >
          {new Date(start + duration * v).toLocaleDateString("ru-RU")}
        </text>
      ))}
    </svg>
  );
}

export function WhalesPage({
  address,
  watchlistOnly = false,
}: {
  address?: string;
  watchlistOnly?: boolean;
}) {
  const valid = !address || validWhaleAddress(address);
  const watchlist = useResource<WhaleWatchlist>(
    "/api/coinglass/whales-watchlist",
    5000,
  );
  const overview = useResource<WhaleOverview>(
    "/api/coinglass/whales-overview",
    30000,
    !address && !watchlistOnly,
  );
  const market = useResource<WhaleMarketResponse>(
    "/api/coinglass/whales-market",
    5000,
    !address && !watchlistOnly,
  );
  const profile = useResource<WhaleProfileResponse>(
    `/api/coinglass/whales-profile?address=${address ?? ""}`,
    5000,
    !!address && valid,
  );
  const [input, setInput] = useState(""),
    [label, setLabel] = useState(""),
    [query, setQuery] = useState("");
  const [side, setSide] = useState("all"),
    [coin, setCoin] = useState("all"),
    [minValue, setMinValue] = useState("0");
  const [tab, setTab] = useState("positions"),
    [period, setPeriod] = useState("perpMonth");
  const [watchlistView, setWatchlistView] = useState<"activity" | "positions">("activity");
  const [accountSort, setAccountSort] = useState<{
    key:
      | "rank"
      | "address"
      | "label"
      | "accountValue"
      | "pnl"
      | "pnl24h"
      | "positions";
    direction: "asc" | "desc";
  }>({ key: "accountValue", direction: "desc" });
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const tracked = useMemo(
    () => new Set(watchlist.data?.data.map((w) => w.address) ?? []),
    [watchlist.data],
  );
  const aliases = new Map(
    watchlist.data?.data.map((w) => [w.address, w.label]) ?? [],
  );
  async function change(
    action: "add" | "remove" | "rename",
    user: string,
    name = "",
  ) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const r = await fetch("/api/coinglass/whales-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, address: user.trim(), label: name }),
      });
      const body = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(body.error || "Не удалось сохранить адрес");
      await watchlist.refresh();
      if (address) await profile.refresh();
      if (action === "add") {
        setInput("");
        setLabel("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }
  const toggle = (user: string) =>
    void change(tracked.has(user) ? "remove" : "add", user);
  const data = profile.data?.profile;
  const accounts = overview.data?.accounts ?? [];
  const names = new Map<string, string>();
  for (const account of accounts)
    names.set(account.address, aliases.get(account.address) || account.label || "");
  for (const whale of watchlist.data?.data ?? [])
    if (whale.label) names.set(whale.address, whale.label);
  const rankedAccounts = [...accounts]
    .filter((account) =>
      `${account.address} ${aliases.get(account.address) || account.label}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      const value = (account: (typeof accounts)[number]) => {
        switch (accountSort.key) {
          case "rank":
            return accounts.indexOf(account);
          case "label":
            return aliases.get(account.address) || account.label || "";
          case "positions":
            return account.positions.length;
          default:
            return account[accountSort.key];
        }
      };
      return (
        compareValue(value(a), value(b)) *
        (accountSort.direction === "asc" ? 1 : -1)
      );
    });
  const toggleAccountSort = (key: typeof accountSort.key) =>
    setAccountSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  const allPositions = market.data?.snapshot?.positions ?? [];
  const displayed = allPositions
    .filter(
      (p) =>
        (side === "all" || side === p.side) &&
        (coin === "all" || coin === p.coin) &&
        (p.value ?? 0) >= Number(minValue) &&
        (p.address + " " + (aliases.get(p.address) ?? ""))
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const activity = useMemo(() => {
    const rows = [
      ...(overview.data?.activity ?? []),
      ...(watchlist.data?.data.flatMap((w) => w.profile?.fills ?? []) ?? []),
    ];
    return [...new Map(rows.map((t) => [`${t.address}:${t.id}`, t])).values()]
      .sort((a, b) => b.time - a.time)
      .slice(0, 50);
  }, [overview.data, watchlist.data]);
  const trackedPositions =
    watchlist.data?.data.flatMap((whale) => whale.profile?.positions ?? []) ??
    [];
  return (
    <div className="terminal-shell">
      <SiteHeader active="whales" />
      <main className="whales-page">
        <div className="whale-page-heading">
          <div>
            <p className="eyebrow">HYPERLIQUID · WHALE TRACKER</p>
            <h1>
              {address
                ? "Профиль кита"
                : watchlistOnly
                  ? "Отслеживаемые киты"
                  : "Трекер китов Hyperliquid"}
            </h1>
            <p className="muted">
              {address
                ? aliases.get(address) || short(address)
                : watchlistOnly
                  ? "Позиции и последние сделки сохранённых адресов"
                  : "Обзор крупных кошельков, позиций и торговой активности"}
            </p>
          </div>
          {!address && !watchlistOnly && (
            <input
              className="whale-overview-search"
              aria-label="Поиск кошелька или имени"
              placeholder="Поиск кошелька или имени…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <div className="whale-page-actions">
            <a
              className={`button ${!address && !watchlistOnly ? "selected" : ""}`}
              href="/whales"
            >
              Обзор
            </a>
            <a
              className={`button ${watchlistOnly ? "selected" : ""}`}
              href="/whales/watchlist"
            >
              <Star size={14} /> Отслеживаемые{" "}
              <span className="count-badge">{tracked.size}</span>
            </a>
            <button
              className="button"
              onClick={() =>
                void (
                  address ? profile : watchlistOnly ? watchlist : market
                ).refresh(true)
              }
            >
              <RefreshCw size={14} /> Обновить
            </button>
          </div>
        </div>
        {(error ||
          watchlist.error ||
          overview.error ||
          market.error ||
          market.data?.error ||
          profile.error ||
          profile.data?.error ||
          overview.data?.error) && (
          <p className="notice error" role="alert">
            {error ||
              profile.error ||
              profile.data?.error ||
              market.error ||
              market.data?.error ||
              overview.error ||
              overview.data?.error ||
              watchlist.error}
          </p>
        )}
        {!address && watchlistOnly && (
          <form
            className="whale-add panel"
            onSubmit={(e) => {
              e.preventDefault();
              if (validWhaleAddress(input)) void change("add", input, label);
              else
                setError("Введите адрес: 0x и 40 шестнадцатеричных символов.");
            }}
          >
            <div>
              <b>Добавить кита в отслеживание</b>
              <p className="muted">
                Адрес и имя сохраняются на сервере. Позиции и сделки проверяются
                примерно раз в минуту.
              </p>
            </div>
            <input
              aria-label="Адрес кита"
              placeholder="0x…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={42}
            />
            <input
              aria-label="Имя кита"
              placeholder="Имя (необязательно)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
            />
            <button className="button" disabled={pending || !input.trim()}>
              <Plus size={14} /> Отслеживать
            </button>
            <a className="muted" href={`/whales/${exampleWhale}`}>
              Пример профиля
            </a>
          </form>
        )}
        {address && !valid && (
          <p className="notice error">Некорректный адрес кошелька.</p>
        )}
        {address && valid && (
          <>
            <section className="panel whale-profile-heading">
              <a href="/whales">
                <ArrowLeft size={14} /> Все киты
              </a>
              <div className="whale-wallet-line">
                <code>{address}</code>
                <button
                  className="icon-button"
                  aria-label="Скопировать адрес"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(address);
                      setCopied(true);
                    } catch {
                      setError("Не удалось скопировать адрес");
                    }
                  }}
                >
                  <Copy size={14} />
                </button>
                {copied && <small>Скопировано</small>}
                <button
                  className="button"
                  disabled={pending}
                  onClick={() => toggle(address)}
                >
                  <Star
                    size={14}
                    fill={tracked.has(address) ? "currentColor" : "none"}
                  />
                  {tracked.has(address) ? "Отслеживается" : "Отслеживать"}
                </button>
              </div>
              <a
                className="muted"
                href={`https://www.coinglass.com/ru/hyperliquid/${address}`}
                target="_blank"
                rel="noreferrer"
              >
                Открыть на CoinGlass <ExternalLink size={12} />
              </a>
            </section>
            {(profile.data?.loading || (profile.loading && !data)) && (
              <p className="notice" role="status">
                {data
                  ? "Обновляем профиль…"
                  : "Получаем позиции и историю кошелька…"}
              </p>
            )}
            {data && (
              <>
                <div className="whale-stats">
                  {[
                    ["Капитал perpetual", data.accountValue],
                    ["Стоимость позиций", data.positionValue],
                    ["PnL за всё время", data.performance.allTime],
                    ["PnL за 24 часа", data.performance.day],
                    ["PnL за 7 дней", data.performance.week],
                    ["PnL за 30 дней", data.performance.month],
                  ].map(([title, value]) => (
                    <div className="panel" key={String(title)}>
                      <span>{title}</span>
                      <strong
                        className={
                          String(title).includes("PnL")
                            ? tone(value as number | null)
                            : ""
                        }
                      >
                        {usd(value as number | null)}
                      </strong>
                    </div>
                  ))}
                </div>
                <section className="panel whale-section">
                  <div className="whale-section-heading">
                    <h2>История PnL</h2>
                    <Choice
                      label="Период PnL"
                      value={period}
                      onChange={setPeriod}
                      items={[
                        ["perpDay", "24 часа"],
                        ["perpWeek", "7 дней"],
                        ["perpMonth", "30 дней"],
                        ["perpAllTime", "Всё время"],
                      ]}
                    />
                  </div>
                  <PnlChart points={data.history[period]?.pnlHistory ?? []} />
                </section>
                <section className="panel whale-section">
                  <div className="whale-tabs">
                    {[
                      ["positions", `Позиции (${data.positions.length})`],
                      ["trades", "Сделки"],
                      ["orders", `Ордера (${data.orders.length})`],
                      ["ledger", "Пополнения / выводы"],
                    ].map(([key, title]) => (
                      <button
                        key={key}
                        className={`button ${tab === key ? "selected" : ""}`}
                        onClick={() => setTab(key)}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                  {tab === "positions" && <Positions rows={data.positions} />}
                  {tab === "trades" && (
                    <>
                      <p className="muted whale-table-note">
                        Последние 200 исполнений perpetual. Частичные исполнения
                        одного ордера могут быть объединены.
                      </p>
                      <Trades rows={data.fills} />
                    </>
                  )}
                  {tab === "orders" && (
                    <div className="whale-table-scroll">
                      <table className="whale-table">
                        <thead>
                          <tr>
                            <th>Актив</th>
                            <th>Сторона</th>
                            <th>Тип</th>
                            <th>Цена</th>
                            <th>Количество</th>
                            <th>Время</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.orders.map((o) => (
                            <tr key={o.oid}>
                              <td>{o.coin}</td>
                              <td
                                className={
                                  o.side === "B" ? "positive" : "negative"
                                }
                              >
                                {o.side === "B" ? "Buy" : "Sell"}
                              </td>
                              <td>{o.orderType}</td>
                              <td>{price(Number(o.limitPx))}</td>
                              <td>{n(Number(o.sz), 6)}</td>
                              <td>{date(o.timestamp)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!data.orders.length && (
                        <p className="empty-state">Открытых ордеров нет.</p>
                      )}
                    </div>
                  )}
                  {tab === "ledger" && (
                    <div className="whale-table-scroll">
                      <table className="whale-table">
                        <thead>
                          <tr>
                            <th>Время</th>
                            <th>Операция</th>
                            <th>Сумма</th>
                            <th>Актив</th>
                            <th>Транзакция</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.ledger
                            .slice(-200)
                            .reverse()
                            .map((t, i) => (
                              <tr key={`${t.hash}:${i}`}>
                                <td>{date(t.time)}</td>
                                <td>{t.delta.type}</td>
                                <td>
                                  {n(
                                    Number(
                                      t.delta.usdcValue ??
                                        t.delta.usdc ??
                                        t.delta.amount,
                                    ),
                                    6,
                                  )}
                                </td>
                                <td>{t.delta.token ?? "USDC"}</td>
                                <td>
                                  <a
                                    href={`https://app.hyperliquid.xyz/explorer/tx/${t.hash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {short(t.hash)} <ExternalLink size={12} />
                                  </a>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!data.ledger.length && (
                        <p className="empty-state">
                          За последние 30 дней операций нет.
                        </p>
                      )}
                    </div>
                  )}
                </section>
                <p className="whale-source">
                  Обновлено {date(data.collectedAt)} · Основной perpetual рынок
                  Hyperliquid. HIP-3 позиции других DEX и spot-баланс не
                  включены.
                </p>
                {data.warnings.map((w) => (
                  <p className="notice" key={w}>
                    {w}
                  </p>
                ))}
              </>
            )}
          </>
        )}
        {!address && watchlistOnly && (
          <section className="panel whale-section">
            <div className="whale-section-heading">
              <h2>Мой список отслеживания</h2>
              <span className="muted">{tracked.size} / 20 адресов</span>
            </div>
            <div className="whale-table-scroll">
              <table className="whale-table">
                <thead>
                  <tr>
                    <th>Кошелёк / имя</th>
                    <th>Капитал</th>
                    <th>Позиции</th>
                    <th>PnL 24ч</th>
                    <th>Последняя сделка</th>
                    <th>Обновлено</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.data?.data.map((w) => (
                    <tr key={w.address}>
                      <td>
                        {wallet(w.address)}
                        {w.label && (
                          <small className="whale-label">{w.label}</small>
                        )}
                      </td>
                      <td>{usd(w.profile?.accountValue)}</td>
                      <td>
                        {w.profile?.positions.length ?? "—"} ·{" "}
                        {usd(w.profile?.positionValue)}
                      </td>
                      <td className={tone(w.profile?.performance.day)}>
                        {usd(w.profile?.performance.day)}
                      </td>
                      <td>
                        {w.profile?.fills[0] ? (
                          <>
                            {w.profile.fills[0].coin} ·{" "}
                            {activityName(w.profile.fills[0].action)}
                            <small className="whale-label">
                              {date(w.profile.fills[0].time)}
                            </small>
                          </>
                        ) : (
                          (w.error ??
                            (w.loading ? "Загрузка…" : "Нет сделок"))
                        )}
                      </td>
                      <td>{date(w.profile?.collectedAt)}</td>
                      <td>
                        <button
                          className="icon-button"
                          disabled={pending}
                          aria-label={`Удалить ${w.address} из отслеживания`}
                          onClick={() => void change("remove", w.address)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!tracked.size && (
                <p className="empty-state">
                  Добавьте адрес выше или отметьте кита в общем обзоре.
                </p>
              )}
            </div>
          </section>
        )}
        {!address && !watchlistOnly && (
          <>
            <p className="whale-source">
              CoinGlass · Позиции крупных кошельков и статистика трейдеров.
              Обновлено {date(market.data?.snapshot?.collectedAt)}
              {market.data?.loading ? " · Обновляем данные…" : ""}
            </p>
            <WhaleAnalytics
              market={market.data?.snapshot}
              loading={market.loading || !!market.data?.loading}
              error={market.error || market.data?.error}
            />
            <section className="panel whale-section">
              <div className="whale-section-heading">
                <h2>Позиции крупных кошельков</h2>
                <span className="muted">
                  {displayed.length} позиций ·{" "}
                  {new Set(allPositions.map((p) => p.address)).size} кошельков
                </span>
              </div>
              <div className="whale-filters">
                <Choice
                  label="Сторона позиции"
                  value={side}
                  onChange={setSide}
                  items={[
                    ["all", "Все стороны"],
                    ["Long", "Long"],
                    ["Short", "Short"],
                  ]}
                />
                <Choice
                  label="Актив"
                  value={coin}
                  onChange={setCoin}
                  items={[
                    ["all", "Все активы"],
                    ...[...new Set(allPositions.map((p) => p.coin))]
                      .sort()
                      .map((c) => [c, c] as [string, string]),
                  ]}
                />
                <Choice
                  label="Минимальная позиция"
                  value={minValue}
                  onChange={setMinValue}
                  items={[
                    ["0", "Любой объём"],
                    ["1000000", "От $1 млн"],
                    ["10000000", "От $10 млн"],
                  ]}
                />
              </div>
              <Positions
                rows={displayed}
                overview
                tracked={tracked}
                names={names}
                onTrack={toggle}
              />
            </section>
            <section className="panel whale-section">
              <div className="whale-section-heading">
                <h2>Публичный рейтинг Hyperliquid</h2>
                <span className="muted">
                  Top 50 по капиталу · отдельная выборка
                </span>
              </div>
              <div className="whale-table-scroll">
                <table className="whale-table">
                  <thead>
                    <tr>
                      <SortHeader
                        label="#"
                        active={accountSort.key === "rank"}
                        direction={accountSort.direction}
                        onClick={() => toggleAccountSort("rank")}
                      />
                      <SortHeader
                        label="Кошелёк"
                        active={accountSort.key === "address"}
                        direction={accountSort.direction}
                        onClick={() => toggleAccountSort("address")}
                      />
                      <SortHeader
                        label="Имя"
                        active={accountSort.key === "label"}
                        direction={accountSort.direction}
                        onClick={() => toggleAccountSort("label")}
                      />
                      <SortHeader
                        label="Капитал"
                        active={accountSort.key === "accountValue"}
                        direction={accountSort.direction}
                        onClick={() => toggleAccountSort("accountValue")}
                      />
                      <SortHeader
                        label="PnL за всё время"
                        active={accountSort.key === "pnl"}
                        direction={accountSort.direction}
                        onClick={() => toggleAccountSort("pnl")}
                      />
                      <SortHeader
                        label="PnL 24ч"
                        active={accountSort.key === "pnl24h"}
                        direction={accountSort.direction}
                        onClick={() => toggleAccountSort("pnl24h")}
                      />
                      <SortHeader
                        label="Позиции"
                        active={accountSort.key === "positions"}
                        direction={accountSort.direction}
                        onClick={() => toggleAccountSort("positions")}
                      />
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedAccounts.map((a) => (
                        <tr key={a.address}>
                          <td>{accounts.indexOf(a) + 1}</td>
                          <td>{wallet(a.address)}</td>
                          <td>{aliases.get(a.address) || a.label || "—"}</td>
                          <td>{usd(a.accountValue)}</td>
                          <td className={tone(a.pnl)}>{usd(a.pnl)}</td>
                          <td className={tone(a.pnl24h)}>{usd(a.pnl24h)}</td>
                          <td>{a.collectedAt ? a.positions.length : "…"}</td>
                          <td>
                            <button
                              className="icon-button"
                              disabled={pending}
                              aria-label={`Отслеживать ${a.address}`}
                              aria-pressed={tracked.has(a.address)}
                              onClick={() => toggle(a.address)}
                            >
                              <Star
                                size={14}
                                fill={
                                  tracked.has(a.address)
                                    ? "currentColor"
                                    : "none"
                                }
                              />
                            </button>
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
                {!accounts.length && (
                  <p className="empty-state">
                    {overview.data?.loading || overview.loading
                      ? "Загружаем обзор Hyperliquid…"
                      : "Обзор временно недоступен."}
                  </p>
                )}
              </div>
            </section>
          </>
        )}
        {!address && watchlistOnly && (
          <section className="panel whale-section">
            <div className="whale-section-heading">
              <h2>
                {watchlistView === "activity"
                  ? "Последняя активность отслеживаемых китов"
                  : "Позиции отслеживаемых китов"}
              </h2>
              <div
                className="whale-tabs"
                role="tablist"
                aria-label="Активность и позиции"
              >
                <button
                  role="tab"
                  aria-selected={watchlistView === "activity"}
                  className={`button ${watchlistView === "activity" ? "selected" : ""}`}
                  onClick={() => setWatchlistView("activity")}
                >
                  Сделки ({activity.length})
                </button>
                <button
                  role="tab"
                  aria-selected={watchlistView === "positions"}
                  className={`button ${watchlistView === "positions" ? "selected" : ""}`}
                  onClick={() => setWatchlistView("positions")}
                >
                  Позиции ({trackedPositions.length})
                </button>
              </div>
            </div>
            {watchlistView === "activity" ? (
              <Trades rows={activity} overview names={names} />
            ) : (
              <Positions
                rows={trackedPositions}
                overview
                tracked={tracked}
                names={names}
                onTrack={toggle}
              />
            )}
          </section>
        )}
        <p className="whale-source">
          Источник данных:{" "}
          <a
            href="https://app.hyperliquid.xyz"
            target="_blank"
            rel="noreferrer"
          >
            Hyperliquid
          </a>{" "}
          ·{" "}
          <a
            href="https://www.coinglass.com/ru/hyperliquid"
            target="_blank"
            rel="noreferrer"
          >
            Обзор CoinGlass
          </a>
          . Отслеживание работает, пока запущен сервер; список общий для этой
          установки.
        </p>
      </main>
    </div>
  );
}
