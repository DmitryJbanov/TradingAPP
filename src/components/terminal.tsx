"use client";
import {
  CoinglassMonitor,
  CoinglassPanel,
  CoinglassSettingsDialog,
} from "./coinglass";
import { useCoinglass } from "../hooks/use-coinglass";
import { coinglassDefaults } from "../domain/coinglass";
import { SymbolSearch } from "./symbol-search";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownUp,
  ArrowLeft,
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Globe2,
  Layers3,
  LayoutGrid,
  ListTodo,
  Maximize2,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings2,
  SlidersHorizontal,
  Star,
  TerminalSquare,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { catalog } from "../domain/catalog";
import {
  categoryNames,
  compact,
  priceFormat,
  type Quote,
  type Category,
  type MarketResponse,
  type CandleResponse,
  type Timeframe,
  type LogEntry,
} from "../domain/market";
import { indicatorRegistry, type IndicatorInstance } from "../domain/workspace";
import { useResource, useStored } from "../hooks/use-resource";
import { useSharedIndicators } from "../hooks/use-shared-indicators";
import { Choice } from "./controls";
import { Sessions } from "./sessions";
import { MarketChart, defaultPalette, type ChartPalette } from "./chart";

import { useVmc } from "../hooks/use-vmc";
import { VmcSettingsDialog } from "./vmc-settings-dialog";
import { vmcDefaults, vmcStyleDefaults } from "../indicators/vmc-settings";
import { useOrderBlocks } from "../hooks/use-order-blocks";
import { OrderBlocksSettingsDialog } from "./order-blocks-settings-dialog";
import { orderBlockDefaults } from "../indicators/order-blocks-settings";
import { HistoryCount } from "./history-count";
import { candleCount, DEFAULT_CANDLE_COUNT } from "../domain/history";
import { candleIntervals } from "../domain/market";
import { mergeLatestCandles } from "../domain/latest-candles";
import { backlog } from "../domain/backlog";
import { useOverlays } from "../hooks/use-overlays";
import { OverlaySettingsDialog } from "./overlay-settings-dialog";
import { drzDefaults } from "../indicators/drz-settings";
import { smcDefaults } from "../indicators/smc-settings";
const hasIndicatorSettings = (id: string) =>
  ["vmc", "sonarlab-ob", "drz", "smc", "coinglass"].includes(id);

function Change({ value }: { value: number }) {
  return (
    <span className={value >= 0 ? "positive" : "negative"}>
      {value >= 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}
function Badge({ q }: { q: Quote }) {
  return (
    <span className={`source-badge ${q.source}`}>
      {q.source === "live" ? q.provider : "DEMO"}
    </span>
  );
}
function Coin({ base }: { base: string }) {
  const colors: Record<string, string> = {
    BTC: "#efac53",
    ETH: "#929df7",
    SOL: "#84d5c7",
    BNB: "#e3bd45",
    XRP: "#d2d9e4",
    DOGE: "#bba96d",
  };
  return (
    <span
      className="coin-icon"
      style={{
        color: colors[base] ?? "#9badd4",
        background: (colors[base] ?? "#9badd4") + "16",
      }}
    >
      {base === "BTC" ? "₿" : base.slice(0, 2)}
    </span>
  );
}
function Range({ q }: { q: Quote }) {
  const percent =
    q.high > q.low
      ? Math.max(0, Math.min(100, ((q.price - q.low) / (q.high - q.low)) * 100))
      : 50;
  return (
    <div className="range-cell">
      <div className="range-track">
        <i style={{ left: percent + "%" }} />
      </div>
      <div>
        <span>{priceFormat(q.low)}</span>
        <span>{priceFormat(q.high)}</span>
      </div>
    </div>
  );
}

function Backend() {
  const health = useResource<{
      status: string;
      uptime: number;
      providers: Record<string, { status: string; time: string }>;
    }>("/api/health", 10000),
    logs = useResource<{ data: LogEntry[] }>("/api/logs", 10000);
  const [level, setLevel] = useState("all"),
    [paused, setPaused] = useState(false),
    [frozen, setFrozen] = useState<LogEntry[]>([]);
  const items = (paused ? frozen : (logs.data?.data ?? []))
    .filter((x) => level === "all" || x.level === level)
    .slice(-8)
    .reverse();
  return (
    <section className="panel backend">
      <div className="section-heading">
        <h2>
          <Server size={16} /> Backend
        </h2>
        <span
          className={
            health.error
              ? "negative status-text"
              : health.data
                ? "positive status-text"
                : "muted status-text"
          }
        >
          <i />
          {health.error ? "Нет связи" : health.data ? "Онлайн" : "Подключение"}
        </span>
      </div>
      <div className="backend-info">
        <div>
          <small>API</small>
          <strong>
            {health.error ? "Недоступен" : health.data ? "Работает" : "—"}
          </strong>
        </div>
        <div>
          <small>Uptime процесса</small>
          <strong className="mono">
            {health.data
              ? Math.floor(health.data.uptime / 60) +
                "m " +
                (health.data.uptime % 60) +
                "s"
              : "—"}
          </strong>
        </div>
      </div>
      <div className="provider-list">
        {Object.entries(health.data?.providers ?? {}).map(([name, value]) => (
          <div key={name}>
            <span>{name}</span>
            <span
              className={value.status === "connected" ? "positive" : "warning"}
            >
              {value.status === "connected" ? "Подключён" : "Недоступен"}
            </span>
          </div>
        ))}
        {!Object.keys(health.data?.providers ?? {}).length && (
          <span className="muted">Источники ещё не опрошены</span>
        )}
      </div>
      <CoinglassMonitor />
      <div className="logs-heading">
        <span>
          <TerminalSquare size={15} /> Журнал событий
        </span>
        <button
          className="text-button"
          onClick={() => {
            if (!paused) setFrozen(logs.data?.data ?? []);
            setPaused(!paused);
          }}
        >
          {paused ? "Продолжить" : "Пауза"}
        </button>
      </div>
      <Choice
        value={level}
        onChange={setLevel}
        label="Уровень логов"
        items={[
          ["all", "Все события"],
          ["INFO", "INFO"],
          ["WARN", "WARN"],
          ["ERROR", "ERROR"],
        ]}
      />
      <div className="log-list">
        {items.map((l) => (
          <div className="log-row" key={l.id}>
            <span className="log-time">{l.time.slice(11, 19)}</span>
            <span
              className={
                l.level === "INFO"
                  ? "positive"
                  : l.level === "WARN"
                    ? "warning"
                    : "negative"
              }
            >
              {l.level}
            </span>
            <p>{l.message}</p>
          </div>
        ))}
        {!items.length && (
          <p className="muted">
            {logs.error ? "Журнал недоступен" : "Нет событий выбранного уровня"}
          </p>
        )}
      </div>
      <div className="panel-foot">Последние события текущего процесса</div>
    </section>
  );
}

export default function Terminal({ symbol }: { symbol?: string }) {
  const markets = useResource<MarketResponse>("/api/markets", 30000);
  const rows = markets.data?.data ?? [];
  const [theme, setTheme] = useStored("vector.theme.v1", "dark"),
    [accent, setAccent] = useStored("vector.accent.v1", "#99a5ff"),
    [palette, setPalette] = useStored<ChartPalette>(
      "vector.chart.v1",
      defaultPalette,
    ),
    [favorites, setFavorites] = useStored<string[]>("vector.favorites.v1", [
      "BTCUSDT",
      "ETHUSDT",
      "SOLUSDT",
    ]);
  const [settings, setSettings] = useState(false),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("crypto"),
    [favoriteOnly, setFavoriteOnly] = useState(false),
    [filters, setFilters] = useState(false),
    [direction, setDirection] = useState("all"),
    [sector, setSector] = useState("all"),
    [source, setSource] = useState("all"),
    [minPrice, setMinPrice] = useState(""),
    [maxPrice, setMaxPrice] = useState(""),
    [minVolume, setMinVolume] = useState(""),
    [sort, setSort] = useState("volume"),
    [count, setCount] = useState("20");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty("--brand", accent);
  }, [theme, accent]);
  function star(s: string) {
    setFavorites((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }
  const filtered = useMemo(
    () =>
      rows
        .filter(
          (q) =>
            (category === "all" || q.category === category) &&
            (!favoriteOnly || favorites.includes(q.symbol)) &&
            (!query ||
              (q.symbol + " " + q.name)
                .toLowerCase()
                .includes(query.toLowerCase())) &&
            (direction === "all" ||
              (direction === "up" ? q.change > 0 : q.change < 0)) &&
            (sector === "all" || q.sector === sector) &&
            (source === "all" || q.source === source) &&
            (!minPrice || q.price >= +minPrice) &&
            (!maxPrice || q.price <= +maxPrice) &&
            (!minVolume || q.volume >= +minVolume * 1e6),
        )
        .sort((a, b) =>
          sort === "volume"
            ? b.volume - a.volume
            : sort === "gainers"
              ? b.change - a.change
              : sort === "losers"
                ? a.change - b.change
                : sort === "price"
                  ? b.price - a.price
                  : a.symbol.localeCompare(b.symbol),
        ),
    [
      rows,
      category,
      favoriteOnly,
      favorites,
      query,
      direction,
      sector,
      source,
      minPrice,
      maxPrice,
      minVolume,
      sort,
    ],
  );
  const crypto = rows.filter((q) => q.category === "crypto"),
    live = crypto.filter((q) => q.source === "live").length;
  const top = crypto.slice(0, 4);
  const sectorOptions = [
    ...new Set(
      catalog
        .filter((x) => category === "all" || x.category === category)
        .map((x) => x.sector),
    ),
  ];
  const filterCount = [
    direction !== "all",
    sector !== "all",
    source !== "all",
    !!minPrice,
    !!maxPrice,
    !!minVolume,
  ].filter(Boolean).length;
  return (
    <div className="terminal-shell">
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-mark">
            <ChartNoAxesCombined size={22} />
          </span>
          VECTOR<span className="brand-tag">TERMINAL</span>
        </a>
        <nav>
          <a href="/backlog">Беклог</a>
          <a className={!symbol ? "active" : ""} href="/">
            <LayoutGrid size={16} /> Рынки
          </a>
          <a className={symbol ? "active" : ""} href="/pair/BTCUSDT">
            <ChartNoAxesCombined size={17} /> График
          </a>
        </nav>
        <div className="topbar-right">
          <span className="workspace-label">Личная рабочая область</span>
          <button
            className="icon-button"
            aria-label="Настройки оформления"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={19} />
          </button>
          <span className="avatar">VT</span>
        </div>
      </header>
      <SymbolSearch favorites={favorites} star={star} />
      {symbol ? (
        <PairWorkspace
          symbol={symbol}
          rows={rows}
          favorites={favorites}
          star={star}
          palette={palette}
          openSettings={() => setSettings(true)}
        />
      ) : (
        <main className="dashboard">
          <div className="page-heading">
            <div>
              <div className="eyebrow">MARKET OVERVIEW</div>
              <h1>
                Обзор рынков
                <span className="title-dot" />
              </h1>
              <p>Всё, что движет рынком. В одной рабочей области.</p>
            </div>
            <div className="heading-actions">
              <span className="update-time">
                <Clock3 size={14} />
                {markets.data
                  ? new Date(markets.data.asOf).toLocaleTimeString("ru-RU", {
                      timeZone: "UTC",
                    }) + " UTC"
                  : "Подключение…"}
              </span>
              <button
                className="button"
                disabled={markets.loading}
                onClick={() => markets.refresh(true)}
              >
                <RefreshCw
                  size={15}
                  className={markets.loading ? "spin" : ""}
                />
                Обновить
              </button>
            </div>
          </div>
          {markets.error && (
            <div className="notice error">
              Нет связи с API: {markets.error}.{" "}
              {rows.length
                ? "Последние полученные цены устарели."
                : "Проверьте backend и повторите запрос."}
            </div>
          )}
          <div className="market-summary">
            <span>
              <i className="status-dot" />
              Крипторынок работает 24/7
            </span>
            <span>
              Пары <b>{crypto.length || "—"}</b>
            </span>
            <span>
              Данные Binance{" "}
              <b>
                {live}/{crypto.length || "—"}
              </b>
            </span>
            <span>
              Обновление <b>30 сек</b>
            </span>
            <span className="muted">Изменение за скользящие 24 часа</span>
          </div>
          <div className="featured-grid">
            {top.map((q) => (
              <a
                className="featured-card"
                href={"/pair/" + q.symbol}
                key={q.symbol}
              >
                <div className="featured-head">
                  <Coin base={q.base} />
                  <span>
                    <strong>
                      {q.base}
                      <small> / {q.quote}</small>
                    </strong>
                    <small>{q.name}</small>
                  </span>
                  <ArrowUpRight size={17} />
                </div>
                <div className="featured-price">
                  {priceFormat(q.price)}
                  <Change value={q.change} />
                </div>
                <div className="featured-bottom">
                  <Badge q={q} />
                  <span>Объём {compact(q.volume)}</span>
                </div>
                <div className="featured-range">
                  <i
                    style={{
                      width:
                        Math.max(
                          5,
                          Math.min(
                            100,
                            ((q.price - q.low) /
                              Math.max(q.high - q.low, 0.00000001)) *
                              100,
                          ),
                        ) + "%",
                      background: q.change >= 0 ? "var(--up)" : "var(--down)",
                    }}
                  />
                </div>
              </a>
            ))}
            {!top.length && (
              <div className="loading-state">
                {markets.error
                  ? "Котировки недоступны"
                  : "Загружаем котировки…"}
              </div>
            )}
          </div>
          <div className="dashboard-columns">
            <div className="main-column">
              <Sessions />
              <section className="panel markets-panel">
                <div className="market-panel-title">
                  <h2>Инструменты</h2>
                  <span className="muted">{filtered.length} в списке</span>
                  <button
                    className={
                      "favorite-toggle " + (favoriteOnly ? "selected" : "")
                    }
                    onClick={() => setFavoriteOnly(!favoriteOnly)}
                  >
                    <Star
                      size={15}
                      fill={favoriteOnly ? "currentColor" : "none"}
                    />
                    Избранное
                  </button>
                </div>
                <Tabs
                  value={category}
                  onValueChange={(v) => {
                    setCategory(v);
                    setSector("all");
                  }}
                >
                  <TabsList className="category-tabs" variant="line">
                    {Object.entries(categoryNames).map(([v, t]) => (
                      <TabsTrigger key={v} value={v}>
                        {t}
                      </TabsTrigger>
                    ))}
                    <TabsTrigger value="all">Все рынки</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="market-controls">
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Поиск торговой пары"
                      placeholder="Поиск пары или компании…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        aria-label="Очистить поиск"
                        onClick={() => setQuery("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <button
                    className={"button " + (filters ? "selected" : "")}
                    onClick={() => setFilters(!filters)}
                  >
                    <SlidersHorizontal size={15} />
                    Фильтры
                    {filterCount > 0 && (
                      <span className="count-badge">{filterCount}</span>
                    )}
                  </button>
                  <Choice
                    label="Сортировка"
                    value={sort}
                    onChange={setSort}
                    items={[
                      ["volume", "По объёму ↓"],
                      ["gainers", "Рост ↓"],
                      ["losers", "Падение ↓"],
                      ["price", "По цене ↓"],
                      ["name", "По названию"],
                    ]}
                  />
                </div>
                {filters && (
                  <div className="filter-panel">
                    <label>
                      Движение
                      <Choice
                        value={direction}
                        onChange={setDirection}
                        label="Движение цены"
                        items={[
                          ["all", "Любое"],
                          ["up", "Растущие"],
                          ["down", "Падающие"],
                        ]}
                      />
                    </label>
                    <label>
                      Сектор
                      <Choice
                        value={sector}
                        onChange={setSector}
                        label="Сектор"
                        items={[
                          ["all", "Все секторы"],
                          ...sectorOptions.map(
                            (x) => [x, x] as [string, string],
                          ),
                        ]}
                      />
                    </label>
                    <label>
                      Источник
                      <Choice
                        value={source}
                        onChange={setSource}
                        label="Источник данных"
                        items={[
                          ["all", "Все источники"],
                          ["live", "API"],
                          ["demo", "Демо"],
                        ]}
                      />
                    </label>
                    <label>
                      Цена от
                      <input
                        type="number"
                        min="0"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <label>
                      Цена до
                      <input
                        type="number"
                        min="0"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                        placeholder="Без лимита"
                      />
                    </label>
                    <label>
                      Объём от, млн
                      <input
                        type="number"
                        min="0"
                        value={minVolume}
                        onChange={(e) => setMinVolume(e.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <button
                      className="text-button"
                      onClick={() => {
                        setDirection("all");
                        setSector("all");
                        setSource("all");
                        setMinPrice("");
                        setMaxPrice("");
                        setMinVolume("");
                      }}
                    >
                      Сбросить фильтры
                    </button>
                  </div>
                )}
                <Table className="market-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="star-cell" />
                      <TableHead>Инструмент</TableHead>
                      <TableHead className="numeric">Цена</TableHead>
                      <TableHead className="numeric">
                        {category === "crypto" ? "Изм. 24ч" : "Изм. дня"}
                      </TableHead>
                      <TableHead className="numeric">Объём ≈ USD</TableHead>
                      <TableHead>Диапазон 24ч</TableHead>
                      <TableHead>Источник</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, +count).map((q) => (
                      <TableRow key={q.symbol}>
                        <TableCell>
                          <button
                            className={
                              "star-button " +
                              (favorites.includes(q.symbol) ? "is-starred" : "")
                            }
                            aria-label={
                              (favorites.includes(q.symbol)
                                ? "Убрать из избранного "
                                : "В избранное ") + q.base
                            }
                            onClick={() => star(q.symbol)}
                          >
                            <Star
                              size={15}
                              fill={
                                favorites.includes(q.symbol)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </button>
                        </TableCell>
                        <TableCell>
                          <a className="instrument" href={"/pair/" + q.symbol}>
                            <Coin base={q.base} />
                            <span>
                              <strong>
                                {q.base}
                                <small>
                                  {" "}
                                  {q.category === "crypto" ? "/ USDT" : ""}
                                </small>
                              </strong>
                              <small>{q.name}</small>
                            </span>
                          </a>
                        </TableCell>
                        <TableCell className="numeric mono">
                          {priceFormat(q.price)}
                        </TableCell>
                        <TableCell className="numeric mono">
                          <Change value={q.change} />
                        </TableCell>
                        <TableCell className="numeric mono muted">
                          {q.volume ? compact(q.volume) : "—"}
                        </TableCell>
                        <TableCell>
                          <Range q={q} />
                        </TableCell>
                        <TableCell>
                          <Badge q={q} />
                        </TableCell>
                        <TableCell>
                          <a
                            className="row-open"
                            aria-label={"Открыть график " + q.base}
                            href={"/pair/" + q.symbol}
                          >
                            <ChevronRight size={16} />
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!filtered.length && (
                  <div className="empty-state">
                    <Search size={24} />
                    <h3>
                      {markets.loading
                        ? "Загрузка инструментов"
                        : "Ничего не найдено"}
                    </h3>
                    <p>Измените поисковый запрос или фильтры.</p>
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    Показано {Math.min(filtered.length, +count)} из{" "}
                    {filtered.length}
                  </span>
                  <Choice
                    label="Количество строк"
                    value={count}
                    onChange={setCount}
                    items={[
                      ["10", "10 строк"],
                      ["20", "20 строк"],
                      ["30", "30 строк"],
                      ["50", "Все строки"],
                    ]}
                  />
                </div>
              </section>
            </div>
            <aside className="right-column">
              <Backend />
              <section
                className="panel backlog-panel"
                aria-labelledby="backlog-title"
              >
                <div className="section-heading">
                  <h2 id="backlog-title">
                    <ListTodo size={16} /> Следующие доработки
                  </h2>
                </div>
                <ol className="backlog-list">
                  {backlog.slice(0, 3).map((task) => (
                    <li key={task.id}>
                      <strong>{task.title}</strong>
                      <span>{task.description}</span>
                    </li>
                  ))}
                </ol>
                {!backlog.length && (
                  <p>Все запланированные задачи выполнены.</p>
                )}
                <a className="backlog-link" href="/backlog">
                  Полный беклог ({backlog.length}) →
                </a>
              </section>
              <section className="panel market-pulse">
                <div className="section-heading">
                  <h2>
                    <Activity size={16} /> Пульс списка
                  </h2>
                </div>
                <div className="pulse-number">
                  {crypto.filter((q) => q.change >= 0).length}
                  <small> / {crypto.length} растут</small>
                </div>
                <div className="pulse-bar">
                  <i
                    style={{
                      width:
                        (crypto.length
                          ? (crypto.filter((q) => q.change >= 0).length /
                              crypto.length) *
                            100
                          : 0) + "%",
                    }}
                  />
                </div>
                <div className="pulse-labels">
                  <span className="positive">Рост</span>
                  <span className="negative">Падение</span>
                </div>
                <p>
                  По криптовалютам в каталоге.{" "}
                  {crypto.some((q) => q.source === "demo")
                    ? "Включает демоданные."
                    : "Источник: Binance."}
                </p>
              </section>
              <div className="data-note">
                <Globe2 size={17} />
                <p>
                  <b>Прозрачные источники</b>Метка DEMO означает синтетические
                  данные. Для акций, индексов и валют подключите Twelve Data на
                  сервере.
                </p>
              </div>
            </aside>
          </div>
          <footer className="footer">
            <span>
              VECTOR <span className="muted">/ Market Terminal</span>
            </span>
            <span>USD / USDT · время UTC · v1.0</span>
          </footer>
        </main>
      )}
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>Настройки оформления</DialogTitle>
            <DialogDescription>Сохраняются в этом браузере.</DialogDescription>
          </DialogHeader>
          <div className="settings-row">
            <span>Тема сайта</span>
            <Choice
              value={theme}
              onChange={setTheme}
              label="Тема сайта"
              items={[
                ["dark", "Графит"],
                ["midnight", "Полночь"],
                ["light", "Светлая"],
              ]}
            />
          </div>
          <label className="settings-row">
            Акцент интерфейса
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
            />
          </label>
          <div className="settings-divider">Рабочая область графика</div>
          {(
            [
              ["background", "Фон"],
              ["grid", "Сетка"],
              ["up", "Растущие свечи"],
              ["down", "Падающие свечи"],
              ["text", "Подписи шкал"],
            ] as [keyof ChartPalette, string][]
          ).map(([key, title]) => (
            <label className="settings-row" key={key}>
              {title}
              <input
                type="color"
                value={palette[key]}
                onChange={(e) =>
                  setPalette({ ...palette, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <button
            className="button"
            onClick={() => {
              setTheme("dark");
              setAccent("#99a5ff");
              setPalette(defaultPalette);
            }}
          >
            Сбросить оформление
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PairWorkspace({
  symbol,
  rows,
  favorites,
  star,
  palette,
  openSettings,
}: {
  symbol: string;
  rows: Quote[];
  favorites: string[];
  star: (s: string) => void;
  palette: ChartPalette;
  openSettings: () => void;
}) {
  const [tf, setTf] = useState<Timeframe>("4h"),
    [query, setQuery] = useState(""),
    [onlyFavorites, setOnlyFavorites] = useState(false),
    [manager, setManager] = useState(false),
    [reset, setReset] = useState(0),
    [indicatorSearch, setIndicatorSearch] = useState("");
  const [indicatorRefresh, setIndicatorRefresh] = useState(0);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [indicators, setIndicators] = useSharedIndicators(symbol);
  const [storedCount, setCount] = useStored(
    "vector.candles.v1",
    DEFAULT_CANDLE_COUNT,
  );
  const historyCount = candleCount(storedCount);
  const resource = useResource<CandleResponse>(
    "/api/candles?symbol=" +
      encodeURIComponent(symbol) +
      "&interval=" +
      tf +
      "&count=" +
      historyCount,
    0,
  );
  const latest = useResource<CandleResponse>(
    "/api/candles/latest?symbol=" +
      encodeURIComponent(symbol) +
      "&interval=" +
      tf,
    30000,
  );
  const [candleState, setCandleState] = useState<{
    base: CandleResponse | undefined;
    response: CandleResponse | undefined;
  }>();
  const accumulated = useRef<typeof candleState>(undefined);
  const candleData =
    candleState?.base === resource.data ? candleState?.response : resource.data;
  const lastBackfill = useRef("");
  useEffect(() => {
    const history =
      accumulated.current?.base === resource.data
        ? accumulated.current?.response
        : resource.data;
    const { response, needsReload } = mergeLatestCandles(
      history,
      latest.data,
      historyCount,
      candleIntervals[tf],
    );
    if ((needsReload || (!resource.data && !resource.loading)) && latest.data) {
      const key = `${symbol}:${tf}:${historyCount}:${latest.data.asOf}`;
      if (lastBackfill.current !== key) {
        lastBackfill.current = key;
        void resource.refresh(true);
      }
      return;
    }
    accumulated.current = { base: resource.data, response };
    setCandleState(accumulated.current);
  }, [
    symbol,
    tf,
    historyCount,
    latest.data,
    resource.data,
    resource.loading,
    resource.refresh,
  ]);
  const vmc = useVmc(
    symbol,
    tf,
    candleData,
    indicators,
    indicatorRefresh,
    historyCount,
  );
  const orderBlocks = useOrderBlocks(tf, candleData, indicators);
  const overlays = useOverlays(
    symbol,
    tf,
    candleData,
    indicators,
    historyCount,
    indicatorRefresh,
  );
  const coinglass = useCoinglass(symbol, indicators, tf);
  const editingIndicator = indicators.find((i) => i.id === settingsId);
  function openIndicatorSettings(id: string) {
    setManager(false);
    setSettingsId(id);
  }
  const q = rows.find((x) => x.symbol === symbol),
    item = catalog.find((x) => x.symbol === symbol) ?? candleData?.instrument;
  const bars = candleData?.data ?? [],
    last = bars.at(-1);
  const list = rows.filter(
    (x) =>
      (!onlyFavorites || favorites.includes(x.symbol)) &&
      (x.symbol + " " + x.name).toLowerCase().includes(query.toLowerCase()),
  );
  function changeIndicators(next: IndicatorInstance[]) {
    setIndicators(next);
  }
  if (!item)
    return (
      <main className="empty-state">
        <h1>
          {resource.loading
            ? "Загрузка инструмента…"
            : "Не удалось загрузить инструмент"}
        </h1>
        {resource.error && <p>{resource.error}</p>}
        {!resource.loading && (
          <button
            className="button"
            onClick={() => void resource.refresh(true)}
          >
            Повторить
          </button>
        )}
        <a className="button" href="/">
          Вернуться к рынкам
        </a>
      </main>
    );
  return (
    <main className="pair-page">
      <div className="pair-breadcrumb">
        <a href="/">
          <ArrowLeft size={14} />
          Рынки
        </a>
        <ChevronRight size={13} />
        <span>{categoryNames[item.category]}</span>
        <ChevronRight size={13} />
        <b>{symbol}</b>
      </div>
      <div className="pair-layout">
        <section className="chart-workspace panel">
          <div className="pair-heading">
            <Coin base={item.base} />
            <div>
              <h1>
                {item.base}
                <small> / {item.quote}</small>
              </h1>
              <p>
                {item.name}{" "}
                <span>· {candleData?.provider ?? "Подключение"}</span>
              </p>
            </div>
            <div className="pair-price">
              <strong className="mono">
                {last ? priceFormat(last.close) : "—"}
              </strong>
              {q && <Change value={q.change} />}
            </div>
            <span className={"source-badge " + (candleData?.source ?? "demo")}>
              {candleData?.source === "live" ? "API" : "DEMO"}
            </span>
            <button
              className={
                "star-button " +
                (favorites.includes(symbol) ? "is-starred" : "")
              }
              aria-label="Избранное"
              onClick={() => star(symbol)}
            >
              <Star
                size={18}
                fill={favorites.includes(symbol) ? "currentColor" : "none"}
              />
            </button>
          </div>
          <div className="chart-toolbar">
            <Tabs value={tf} onValueChange={(v) => setTf(v as Timeframe)}>
              <TabsList>
                {[
                  ["15m", "15м"],
                  ["1h", "1ч"],
                  ["4h", "4ч"],
                  ["1d", "1д"],
                ].map(([v, t]) => (
                  <TabsTrigger value={v} key={v}>
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <span className="toolbar-separator" />
            <HistoryCount value={historyCount} onChange={setCount} />
            <button
              className="button toolbar-button"
              onClick={() => setManager(true)}
            >
              <Layers3 size={16} />
              Индикаторы
              {indicators.length > 0 && (
                <span className="count-badge">{indicators.length}</span>
              )}
            </button>
            <div className="toolbar-end">
              <button
                className="icon-button"
                title="Сбросить масштаб"
                aria-label="Сбросить масштаб"
                onClick={() => setReset((x) => x + 1)}
              >
                <Maximize2 size={17} />
              </button>
              <button
                className="icon-button"
                title="Оформление графика"
                aria-label="Оформление графика"
                onClick={openSettings}
              >
                <Palette size={17} />
              </button>
              <button
                className="button"
                disabled={resource.loading}
                onClick={async () => {
                  await resource.refresh(true);
                  setIndicatorRefresh((v) => v + 1);
                }}
              >
                <RefreshCw
                  size={15}
                  className={resource.loading ? "spin" : ""}
                />
                Обновить
              </button>
            </div>
          </div>
          {(resource.error || latest.error) && (
            <div className="notice error">
              Ошибка загрузки: {resource.error || latest.error}.{" "}
              {bars.length
                ? "Отображены устаревшие свечи."
                : "Повторите запрос."}
            </div>
          )}
          {candleData?.source === "demo" && (
            <div className="demo-banner">
              <span className="source-badge demo">DEMO</span>
              {candleData.warning}. Данные не являются рыночными.
            </div>
          )}
          {candleData?.source !== "demo" && candleData?.warning && (
            <div className="notice">{candleData.warning}</div>
          )}
          <div className="chart-stage">
            <MarketChart
              key={symbol}
              symbol={symbol}
              bars={bars}
              timeframe={tf}
              palette={palette}
              resetKey={reset}
              vmcPanes={vmc.panes}
              orderBlocks={orderBlocks}
              priceOverlays={overlays.overlays}
              historyCount={historyCount}
              coinglass={coinglass.overlays}
            />
            {!bars.length && (
              <div className="chart-loading">
                {resource.error || latest.error
                  ? "Не удалось загрузить график"
                  : "Загружаем свечи…"}
              </div>
            )}
          </div>
          <CoinglassPanel
            state={coinglass}
            openSettings={openIndicatorSettings}
          />
          {vmc.loading && (
            <div className="notice" role="status">
              Загрузка таймфреймов индикатора…
            </div>
          )}
          {!vmc.loading && vmc.warnings.length > 0 && (
            <div className="notice" role="status">
              {vmc.warnings.join(" ")}
            </div>
          )}
          {overlays.loading && (
            <div className="notice" role="status">
              SMC: загрузка дополнительных таймфреймов…
            </div>
          )}
          {!overlays.loading && overlays.warnings.length > 0 && (
            <div className="notice" role="status">
              {overlays.warnings.join(" ")}
            </div>
          )}
          {overlays.overlays.some((o) => o.result.signals.length > 0) && (
            <div className="overlay-signals">
              {overlays.overlays.map((o) => {
                const signal = o.result.signals.at(-1);
                return signal ? (
                  <span key={o.id}>
                    {o.name}: {signal.type} ·{" "}
                    {new Date(signal.time * 1000).toLocaleString("ru-RU", {
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                  </span>
                ) : null;
              })}
            </div>
          )}
          <div className="chart-status">
            <span>
              {resource.loading
                ? "Обновление…"
                : `${bars.length} свечей · ${tf} · UTC`}
            </span>
            <span>Оси: перетаскивание · сброс: двойной клик</span>
            <span>Δ = (текущая / курсор − 1) × 100</span>
          </div>
          {indicators.length > 0 && (
            <div className="indicator-strip">
              {indicators.map((i) => (
                <button
                  key={i.id}
                  onClick={() =>
                    hasIndicatorSettings(i.definitionId)
                      ? openIndicatorSettings(i.id)
                      : setManager(true)
                  }
                  style={{ opacity: i.enabled ? 1 : 0.5 }}
                >
                  <span style={{ background: i.color }} />
                  {
                    indicatorRegistry.find((x) => x.id === i.definitionId)?.name
                  }{" "}
                  {hasIndicatorSettings(i.definitionId) ? (
                    <small>
                      {[
                        ...coinglass.overlays,
                        ...vmc.panes,
                        ...orderBlocks,
                        ...overlays.overlays,
                      ].some((p) => p.id === i.id)
                        ? "настройки ⚙"
                        : "скрыт · настройки ⚙"}
                    </small>
                  ) : (
                    <>
                      ({i.period})<small>ожидает расчёта</small>
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
        <aside className="watchlist panel">
          <div className="section-heading">
            <h2>Список инструментов</h2>
            <button
              className={"star-button " + (onlyFavorites ? "is-starred" : "")}
              aria-label="Только избранные"
              onClick={() => setOnlyFavorites(!onlyFavorites)}
            >
              <Star size={15} fill={onlyFavorites ? "currentColor" : "none"} />
            </button>
          </div>
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Поиск в списке инструментов"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск инструмента…"
            />
          </label>
          <div className="watchlist-labels">
            <span>Инструмент</span>
            <span>Цена / 24ч</span>
          </div>
          <div className="watchlist-items">
            {list.map((x) => (
              <a
                href={"/pair/" + x.symbol}
                className={
                  "watch-item " + (x.symbol === symbol ? "active" : "")
                }
                key={x.symbol}
              >
                <div>
                  <b>{x.base}</b>
                  <small>
                    {x.quote} · {x.source === "demo" ? "DEMO" : x.provider}
                  </small>
                </div>
                <div className="mono">
                  <b>{priceFormat(x.price)}</b>
                  <Change value={x.change} />
                </div>
              </a>
            ))}
            {!list.length && (
              <p className="empty-state">Инструменты не найдены</p>
            )}
          </div>
          <div className="panel-foot">{list.length} инструментов</div>
        </aside>
      </div>
      <Sessions />
      <Dialog open={manager} onOpenChange={setManager}>
        <DialogContent className="indicator-dialog">
          <DialogHeader>
            <DialogTitle>Индикаторы</DialogTitle>
            <DialogDescription>
              Общий набор для всех торговых пар: VMC, DRZ, SMC и Sonarlab Order
              Blocks. Настройки сохраняются при переключении пары.
            </DialogDescription>
          </DialogHeader>
          <label className="search-field">
            <Search size={16} />
            <input
              placeholder="Найти индикатор…"
              aria-label="Поиск индикаторов"
              value={indicatorSearch}
              onChange={(e) => setIndicatorSearch(e.target.value)}
            />
          </label>
          <div className="indicator-catalog">
            {indicatorRegistry
              .filter((x) =>
                x.name.toLowerCase().includes(indicatorSearch.toLowerCase()),
              )
              .map((d) => (
                <div className="indicator-definition" key={d.id}>
                  <Layers3 size={20} />
                  <div>
                    <b>{d.name}</b>
                    <p>{d.description}</p>
                  </div>
                  <button
                    className="icon-button"
                    disabled={
                      d.id === "coinglass" &&
                      indicators.some((i) => i.definitionId === "coinglass")
                    }
                    aria-label={"Добавить " + d.name}
                    onClick={() =>
                      changeIndicators([
                        ...indicators,
                        {
                          id: crypto.randomUUID(),
                          definitionId: d.id,
                          enabled: true,
                          period: d.id === "vmc" ? 9 : 20,
                          color:
                            d.id === "sonarlab-ob"
                              ? orderBlockDefaults.col_bullish
                              : "#99a5ff",
                          paneId: d.id === "vmc" ? "oscillator" : "main",
                          ...(d.id === "vmc"
                            ? {
                                params: { ...vmcDefaults },
                                style: { ...vmcStyleDefaults },
                              }
                            : d.id === "sonarlab-ob"
                              ? { params: { ...orderBlockDefaults } }
                              : d.id === "drz"
                                ? { params: { ...drzDefaults } }
                                : d.id === "smc"
                                  ? { params: { ...smcDefaults } }
                                  : d.id === "coinglass"
                                    ? { params: { ...coinglassDefaults } }
                                    : {}),
                        },
                      ])
                    }
                  >
                    <Plus size={19} />
                  </button>
                </div>
              ))}
          </div>
          <h3>В рабочей области · {indicators.length}</h3>
          <div className="indicator-instances">
            {indicators.map((i, index) => (
              <div className="indicator-instance" key={i.id}>
                <div className="instance-heading">
                  <Switch
                    checked={i.enabled}
                    aria-label="Видимость индикатора"
                    onCheckedChange={(v) =>
                      changeIndicators(
                        indicators.map((x) =>
                          x.id === i.id ? { ...x, enabled: v } : x,
                        ),
                      )
                    }
                  />
                  <b>
                    {
                      indicatorRegistry.find((x) => x.id === i.definitionId)
                        ?.name
                    }
                  </b>
                  <button
                    className="icon-button"
                    disabled={index === 0}
                    aria-label="Переместить выше"
                    onClick={() => {
                      const next = [...indicators];
                      [next[index - 1], next[index]] = [
                        next[index],
                        next[index - 1],
                      ];
                      changeIndicators(next);
                    }}
                  >
                    <ArrowUpRight size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Удалить индикатор"
                    onClick={() =>
                      changeIndicators(indicators.filter((x) => x.id !== i.id))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {hasIndicatorSettings(i.definitionId) ? (
                  <div className="instance-options">
                    <button
                      className="button"
                      onClick={() => openIndicatorSettings(i.id)}
                    >
                      <Settings2 size={16} />
                      Настройки
                    </button>
                    <span className="muted">
                      {i.definitionId === "vmc"
                        ? "Отдельная панель"
                        : "На ценовом графике"}{" "}
                      · расчёт подключён
                    </span>
                  </div>
                ) : (
                  <div className="instance-options">
                    <label>
                      Период
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={i.period}
                        onChange={(e) =>
                          changeIndicators(
                            indicators.map((x) =>
                              x.id === i.id
                                ? {
                                    ...x,
                                    period: Math.max(
                                      1,
                                      Math.min(
                                        500,
                                        Number(e.target.value) || 1,
                                      ),
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Цвет
                      <input
                        type="color"
                        value={i.color}
                        onChange={(e) =>
                          changeIndicators(
                            indicators.map((x) =>
                              x.id === i.id
                                ? { ...x, color: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <span className="muted">Расчёт не подключён</span>
                  </div>
                )}
              </div>
            ))}
            {!indicators.length && (
              <p className="muted">
                Добавьте индикатор из каталога, чтобы настроить его параметры.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {editingIndicator &&
        ["drz", "smc"].includes(editingIndicator.definitionId) && (
          <OverlaySettingsDialog
            key={editingIndicator.id}
            instance={editingIndicator}
            timeframe={tf}
            onClose={() => setSettingsId(null)}
            onApply={(next) =>
              changeIndicators(
                indicators.map((i) => (i.id === next.id ? next : i)),
              )
            }
          />
        )}
      {editingIndicator?.definitionId === "coinglass" && (
        <CoinglassSettingsDialog
          key={symbol + editingIndicator.id}
          symbol={symbol}
          state={coinglass}
          bars={bars}
          palette={palette}
          timeframe={tf}
          candleSource={candleData?.source}
          instance={editingIndicator}
          onClose={() => setSettingsId(null)}
          onApply={(next) =>
            changeIndicators(
              indicators.map((i) => (i.id === next.id ? next : i)),
            )
          }
        />
      )}
      {editingIndicator?.definitionId === "vmc" && (
        <VmcSettingsDialog
          key={editingIndicator.id}
          instance={editingIndicator}
          onClose={() => setSettingsId(null)}
          onApply={(next) =>
            changeIndicators(
              indicators.map((i) => (i.id === next.id ? next : i)),
            )
          }
        />
      )}
      {editingIndicator?.definitionId === "sonarlab-ob" && (
        <OrderBlocksSettingsDialog
          key={editingIndicator.id}
          instance={editingIndicator}
          onClose={() => setSettingsId(null)}
          onApply={(next) =>
            changeIndicators(
              indicators.map((i) => (i.id === next.id ? next : i)),
            )
          }
        />
      )}
    </main>
  );
}
