"use client";
import {
  saveCandles,
  cachedPairValue,
  savePairValue,
} from "../hooks/pair-cache";
import {
  CoinglassMonitor,
  CoinglassPanel,
  CoinglassSettingsDialog,
} from "./coinglass";
import { useCoinglass } from "../hooks/use-coinglass";
import { coinglassDefaults } from "../domain/coinglass";
import { isSiteTheme, siteThemes } from "../domain/themes";
import { heatmapDefaults } from "../domain/heatmap";
import { useHeatmap } from "../hooks/use-heatmap";
import { IndicatorPresets } from "./indicator-presets";
import { HeatmapPanel, HeatmapSettings } from "./heatmap";
import { IndicatorIcon, indicatorIcons } from "./indicator-icon";
import {
  exchanges,
  isMarketExchange,
  marketSymbol,
  type MarketExchange,
} from "../domain/exchanges";
import { SymbolSearch } from "./symbol-search";
import { CoinIcon } from "./coin-icon";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownUp,
  ArrowLeft,
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  ExternalLink,
  Globe2,
  GripVertical,
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useReorderAnimation } from "../hooks/use-reorder-animation";
import { useSharedIndicators } from "../hooks/use-shared-indicators";
import { Choice } from "./controls";
import { MarketChart, defaultPalette, type ChartPalette } from "./chart";
import { useWhaleChart } from "./whale-chart-overlay";

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
import { useOverlays } from "../hooks/use-overlays";
import { OverlaySettingsDialog } from "./overlay-settings-dialog";
import { drzDefaults } from "../indicators/drz-settings";
import { smcDefaults } from "../indicators/smc-settings";
import { fvgDefaults } from "../indicators/fvg-settings";
import { useStochRsi } from "../hooks/use-stoch-rsi";
import { useMtm } from "../hooks/use-mtm";
import { stochRsiDefaults } from "../indicators/stoch-rsi";
import { StochRsiSettingsDialog } from "./stoch-rsi-settings-dialog";
import { SiteHeader } from "./site-header";
import { PineEditor } from "./pine-editor";
import { PineCatalog } from "./pine-catalog";
import { PineStrategyReport } from "./pine-strategy-report";
import { PineSettings } from "./pine-settings";
import { usePineScripts } from "../hooks/use-pine-scripts";
import {
  isPineScript,
  pineTemplates,
  PINE_LIBRARY_KEY,
  PINE_DRAFT_KEY,
  type PineScript,
  type PineInstanceSettings,
} from "../domain/pine-scripts";
const initialPineDraft: PineScript = {
  ...pineTemplates[0],
  id: "draft",
  name: "Мой индикатор",
};
const favoriteColors = [
  { name: "Красная", value: "#ef5968" },
  { name: "Оранжевая", value: "#f08b55" },
  { name: "Жёлтая", value: "#e3c35d" },
  { name: "Зелёная", value: "#43c98b" },
  { name: "Бирюзовая", value: "#45c5c4" },
  { name: "Голубая", value: "#5794f7" },
  { name: "Синяя", value: "#777bfa" },
  { name: "Фиолетовая", value: "#bd74e8" },
];
const favoriteKey = (symbol: string) => symbol.replace(/^(FUTURES|SPOT):/, "");
const hasFavorite = (favorites: string[], symbol: string) =>
  favorites.some((saved) => favoriteKey(saved) === favoriteKey(symbol));
const moveFavoriteInOrder = (
  order: string[],
  source: string,
  target: string,
  after = false,
) => {
  const from = order.findIndex(
    (item) => favoriteKey(item) === favoriteKey(source),
  );
  const to = order.findIndex(
    (item) => favoriteKey(item) === favoriteKey(target),
  );
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  const targetIndex = next.findIndex(
    (value) => favoriteKey(value) === favoriteKey(target),
  );
  next.splice(targetIndex + (after ? 1 : 0), 0, item);
  return next;
};
type FearGreedPoint = {
  timestamp: string;
  value: number;
  classification: string;
};
type FearGreedStatus = {
  job?: { state?: string; result?: { snapshotId?: string } };
};
type FearGreedSnapshot = {
  snapshot: {
    current?: FearGreedPoint;
    points: FearGreedPoint[];
  };
};
const hasIndicatorSettings = (id: string) =>
  [
    "mtm",
    "stoch-rsi",
    "vmc",
    "sonarlab-ob",
    "drz",
    "smc",
    "fvg-luxalgo",
    "coinglass",
    "coinglass-heatmap",
  ].includes(id);

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
  const [storedExchange, setExchange] = useStored<MarketExchange>(
    "vector.exchange.v1",
    "binance",
  );
  const exchange = isMarketExchange(storedExchange)
    ? storedExchange
    : "binance";
  const markets = useResource<MarketResponse>(
    symbol ? `/api/markets?exchange=${exchange}` : "/api/markets",
    30000,
  );
  const fearGreedStatus = useResource<FearGreedStatus>(
    "/api/coinglass/fear-greed-status",
    5000,
    !symbol,
  );
  const fearGreedId = fearGreedStatus.data?.job?.result?.snapshotId;
  const fearGreedSnapshot = useResource<FearGreedSnapshot>(
    `/api/coinglass/fear-greed-snapshot?snapshotId=${fearGreedId ?? ""}`,
    30000,
    !symbol && Boolean(fearGreedId),
  );
  const fearGreedStartAttempted = useRef(false);
  useEffect(() => {
    if (
      symbol ||
      fearGreedStatus.loading ||
      fearGreedStatus.error ||
      fearGreedStatus.data?.job ||
      fearGreedStartAttempted.current
    )
      return;
    fearGreedStartAttempted.current = true;
    void fetch("/api/coinglass/fear-greed-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "CMC" }),
    })
      .then(() => fearGreedStatus.refresh(true))
      .catch(() => fearGreedStatus.refresh(true));
  }, [
    symbol,
    fearGreedStatus.loading,
    fearGreedStatus.error,
    fearGreedStatus.data,
    fearGreedStatus.refresh,
  ]);
  const [theme, setTheme] = useStored("vector.theme.v1", "black"),
    [timezone, setTimezone] = useStored("vector.timezone.v1", "Europe/Moscow"),
    [accent, setAccent] = useStored("vector.accent.v1", "#99a5ff"),
    [palette, setPalette] = useStored<ChartPalette>(
      "vector.chart.v1",
      defaultPalette,
    ),
    [favorites, setFavorites] = useStored<string[]>("vector.favorites.v1", [
      "BTCUSDT",
      "ETHUSDT",
      "SOLUSDT",
    ]),
    [notes] = useStored<
      { id: string; title: string; body: string; updatedAt: number }[]
    >("vector.notes.v1", []);
  const baseRows = markets.data?.data ?? [];
  const missingFavorites = favorites.filter(
    (saved) =>
      !baseRows.some(
        (quote) => favoriteKey(quote.symbol) === favoriteKey(saved),
      ),
  );
  const favoriteMarkets = useResource<MarketResponse>(
    "/api/markets/favorites?symbols=" +
      encodeURIComponent(missingFavorites.join(",")) +
      "&exchange=" +
      exchange,
    15000,
    !symbol && missingFavorites.length > 0,
  );
  const extraFavorites = favoriteMarkets.data?.data ?? [];
  const rows = [
    ...baseRows,
    ...extraFavorites.filter(
      (quote) =>
        !baseRows.some(
          (base) => favoriteKey(base.symbol) === favoriteKey(quote.symbol),
        ),
    ),
  ];
  useEffect(() => {
    try {
      if (
        theme === "dark" &&
        localStorage.getItem("vector.theme.default-migrated.0.5") !== "1"
      ) {
        setTheme("black");
        localStorage.setItem("vector.theme.default-migrated.0.5", "1");
      }
    } catch {}
  }, [theme, setTheme]);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("vector.chart.v1") ?? "null",
      ) as Partial<ChartPalette> | null;
      if (!saved) return;
      setPalette((current) => ({
        ...current,
        ...(saved.background === "#101318"
          ? { background: defaultPalette.background }
          : {}),
        ...(saved.grid === "#20262f" ? { grid: defaultPalette.grid } : {}),
        ...(saved.up === "#0ECB81" ? { up: defaultPalette.up } : {}),
        ...(saved.down === "#F6465D" ? { down: defaultPalette.down } : {}),
        ...(saved.up === "#44d7a8" ? { up: defaultPalette.up } : {}),
        ...(saved.down === "#ef7185" ? { down: defaultPalette.down } : {}),
      }));
    } catch {}
  }, [setPalette]);
  const [settings, setSettings] = useState(false),
    [draggingFavorite, setDraggingFavorite] = useState(""),
    [dropFavorite, setDropFavorite] = useState(""),
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
    const selectedTheme = isSiteTheme(theme) ? theme : "dark";
    if (selectedTheme !== theme) setTheme(selectedTheme);
    document.documentElement.dataset.theme = selectedTheme;
    document.documentElement.style.setProperty("--brand", accent);
  }, [theme, accent, setTheme]);
  function star(s: string) {
    setFavorites((prev) =>
      hasFavorite(prev, s)
        ? prev.filter((x) => favoriteKey(x) !== favoriteKey(s))
        : [...prev, s],
    );
  }
  function moveFavorite(source: string, target: string, after = false) {
    setFavorites((previous) =>
      moveFavoriteInOrder(previous, source, target, after),
    );
  }
  const filtered = useMemo(
    () =>
      rows
        .filter(
          (q) =>
            (category === "all" || q.category === category) &&
            (!favoriteOnly || hasFavorite(favorites, q.symbol)) &&
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
        .sort((a, b) => {
          if (favoriteOnly) {
            const aIndex = favorites.findIndex(
              (saved) => favoriteKey(saved) === favoriteKey(a.symbol),
            );
            const bIndex = favorites.findIndex(
              (saved) => favoriteKey(saved) === favoriteKey(b.symbol),
            );
            return aIndex - bIndex;
          }
          return sort === "volume"
            ? b.volume - a.volume
            : sort === "gainers"
              ? b.change - a.change
              : sort === "losers"
                ? a.change - b.change
                : sort === "price"
                  ? b.price - a.price
                  : a.symbol.localeCompare(b.symbol);
        }),
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
  const favoriteTableRef = useReorderAnimation<HTMLTableSectionElement>(
    favoriteOnly
      ? `${favorites.map(favoriteKey).join("|")}:${filtered
          .slice(0, +count)
          .map((quote) => favoriteKey(quote.symbol))
          .join("|")}`
      : "",
  );
  const crypto = rows.filter((q) => q.category === "crypto");
  const top = crypto.slice(0, 4);
  const fearGreed =
    fearGreedSnapshot.data?.snapshot.current ??
    fearGreedSnapshot.data?.snapshot.points.at(-1);
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
      <SiteHeader
        active={symbol ? "chart" : "markets"}
        onOpenSettings={() => setSettings(true)}
      />
      {symbol ? (
        <PairWorkspace
          key={symbol}
          exchange={exchange}
          setExchange={setExchange}
          symbol={symbol}
          rows={rows}
          favorites={favorites}
          star={star}
          moveFavorite={moveFavorite}
          palette={palette}
          timezone={timezone}
          openSettings={() => setSettings(true)}
        />
      ) : (
        <main className="dashboard">
          <div className="page-heading">
            <div>
              <h1>
                Обзор рынков
                <span className="title-dot" />
              </h1>
            </div>
            <div className="heading-actions">
              <a className="dashboard-fear-greed" href="/fear-greed">
                <Activity size={14} />
                <span>Fear &amp; Greed</span>
                <b
                  className={fearGreed ? "" : "muted"}
                  style={
                    fearGreed
                      ? {
                          color:
                            fearGreed.value <= 20
                              ? "#ef5968"
                              : fearGreed.value <= 40
                                ? "#f08b55"
                                : fearGreed.value <= 60
                                  ? "#e3c35d"
                                  : fearGreed.value <= 80
                                    ? "#8fc77b"
                                    : "#43c98b",
                        }
                      : undefined
                  }
                >
                  {fearGreed
                    ? `${fearGreed.value} · ${fearGreed.classification}`
                    : fearGreedStatus.error || fearGreedSnapshot.error
                      ? "Недоступен"
                      : "Загрузка…"}
                </b>
              </a>
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
          <div className="featured-grid">
            {top.map((q) => (
              <a
                className="featured-card"
                href={"/pair/" + q.symbol}
                key={q.symbol}
              >
                <div className="featured-head">
                  <CoinIcon base={q.base} />
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
                <SymbolSearch
                  favorites={favorites}
                  star={star}
                  query={query}
                  onQueryChange={setQuery}
                />
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
                      {favoriteOnly && (
                        <TableHead className="favorite-drag-head" />
                      )}
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
                  <TableBody
                    ref={favoriteTableRef}
                    data-favorites-order={
                      favoriteOnly ? favorites.join("|") : ""
                    }
                  >
                    {filtered.slice(0, +count).map((q) => (
                      <TableRow
                        key={q.symbol}
                        data-sort-id={
                          favoriteOnly ? favoriteKey(q.symbol) : undefined
                        }
                        draggable={favoriteOnly}
                        className={
                          favoriteOnly ? "favorite-sortable" : undefined
                        }
                        onDragStart={(event) => {
                          if (!favoriteOnly) return;
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "text/plain",
                            favoriteKey(q.symbol),
                          );
                          setDraggingFavorite(favoriteKey(q.symbol));
                        }}
                        onDragOver={(event) => {
                          if (
                            !favoriteOnly ||
                            !draggingFavorite ||
                            draggingFavorite === favoriteKey(q.symbol)
                          )
                            return;
                          event.preventDefault();
                          setDropFavorite(favoriteKey(q.symbol));
                        }}
                        onDragLeave={() => setDropFavorite("")}
                        onDrop={(event) => {
                          if (!favoriteOnly) return;
                          event.preventDefault();
                          const source =
                            event.dataTransfer.getData("text/plain") ||
                            draggingFavorite;
                          const rect =
                            event.currentTarget.getBoundingClientRect();
                          moveFavorite(
                            source,
                            favoriteKey(q.symbol),
                            event.clientY > rect.top + rect.height / 2,
                          );
                          setDraggingFavorite("");
                          setDropFavorite("");
                        }}
                        onDragEnd={() => {
                          setDraggingFavorite("");
                          setDropFavorite("");
                        }}
                        data-dragging={
                          draggingFavorite === favoriteKey(q.symbol) ||
                          undefined
                        }
                        data-drop-target={
                          dropFavorite === favoriteKey(q.symbol) || undefined
                        }
                      >
                        {favoriteOnly && (
                          <TableCell className="favorite-controls-cell">
                            <span
                              className="favorite-drag-handle"
                              title={`Перетащить ${q.base}`}
                              aria-label={`Перетащить ${q.base}`}
                            >
                              <GripVertical size={14} />
                            </span>
                          </TableCell>
                        )}
                        <TableCell>
                          <button
                            className={
                              "star-button " +
                              (hasFavorite(favorites, q.symbol)
                                ? "is-starred"
                                : "")
                            }
                            aria-label={
                              (hasFavorite(favorites, q.symbol)
                                ? "Убрать из избранного "
                                : "В избранное ") + q.base
                            }
                            onClick={() => star(q.symbol)}
                          >
                            <Star
                              size={15}
                              fill={
                                hasFavorite(favorites, q.symbol)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </button>
                        </TableCell>
                        <TableCell>
                          <a className="instrument" href={"/pair/" + q.symbol}>
                            <CoinIcon base={q.base} />
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
                aria-labelledby="notes-title"
              >
                <div className="section-heading">
                  <h2 id="notes-title">
                    <ListTodo size={16} /> Заметки
                  </h2>
                </div>
                <ol className="backlog-list">
                  {notes.slice(0, 3).map((note) => (
                    <li key={note.id}>
                      <strong>{note.title || "Без названия"}</strong>
                      <span>{note.body || "Пустая заметка"}</span>
                    </li>
                  ))}
                </ol>
                {!notes.length && (
                  <p className="empty-state">
                    Создайте заметку для общей рабочей области.
                  </p>
                )}
                <a className="backlog-link" href="/notes">
                  Все заметки ({notes.length}) →
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
          <footer className="footer">0.7 BETA</footer>
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
              items={siteThemes.map(
                ([id, name]) => [id, name] as [string, string],
              )}
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
          <label className="settings-row">
            Часовой пояс
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger aria-label="Часовой пояс графика">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Europe/Moscow">Москва · UTC+3</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </label>
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
              setTheme("black");
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
  exchange,
  setExchange,
  symbol,
  rows,
  favorites,
  star,
  moveFavorite,
  palette,
  timezone,
  openSettings,
}: {
  exchange: MarketExchange;
  setExchange: (exchange: MarketExchange) => void;
  symbol: string;
  rows: Quote[];
  favorites: string[];
  star: (s: string) => void;
  moveFavorite: (source: string, target: string, after?: boolean) => void;
  palette: ChartPalette;
  timezone: string;
  openSettings: () => void;
}) {
  const [favoriteColorMap, setFavoriteColorMap] = useStored<
    Record<string, string>
  >("vector.favorite-colors.v1", {});
  const [draggingFavorite, setDraggingFavorite] = useState("");
  const [dropFavorite, setDropFavorite] = useState("");
  function setFavoriteColor(symbol: string, color: string) {
    setFavoriteColorMap((previous) => {
      const next = { ...previous };
      if (color) next[symbol] = color;
      else delete next[symbol];
      return next;
    });
  }
  const [tf, setTf] = useState<Timeframe>(
      () => cachedPairValue<Timeframe>(symbol, `view:tf:${exchange}`) ?? "4h",
    ),
    [query, setQuery] = useState(""),
    [onlyFavorites, setOnlyFavorites] = useState(true),
    [manager, setManager] = useState(false),
    [reset, setReset] = useState(0),
    [indicatorSearch, setIndicatorSearch] = useState("");
  useEffect(() => {
    savePairValue(symbol, `view:tf:${exchange}`, tf);
  }, [symbol, exchange, tf]);
  const [indicatorRefresh, setIndicatorRefresh] = useState(0);
  const indicatorClickTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(
    () => () => {
      if (indicatorClickTimer.current)
        clearTimeout(indicatorClickTimer.current);
    },
    [],
  );
  const [catalogTab, setCatalogTab] = useState("indicators");
  const [editorOpen, setEditorOpen] = useState(false);
  const [storedScripts, setScripts] = useStored<PineScript[]>(
    PINE_LIBRARY_KEY,
    [],
  );
  const scripts = useMemo(
    () =>
      Array.isArray(storedScripts) ? storedScripts.filter(isPineScript) : [],
    [storedScripts],
  );
  const [storedDraft, setDraft] = useStored<PineScript>(
    PINE_DRAFT_KEY,
    initialPineDraft,
  );
  const draft =
    storedDraft &&
    typeof storedDraft.id === "string" &&
    typeof storedDraft.name === "string" &&
    typeof storedDraft.source === "string" &&
    (storedDraft.kind === "indicator" || storedDraft.kind === "strategy")
      ? storedDraft
      : initialPineDraft;
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [pineSettingsId, setPineSettingsId] = useState<string | null>(null);
  const [indicators, setIndicators] = useSharedIndicators(symbol);
  const [storedCount, setCount] = useStored(
    "vector.candles.v1",
    DEFAULT_CANDLE_COUNT,
  );
  const whale = useWhaleChart(symbol);
  const whaleHistory = whale.selected?.time
    ? Math.ceil(
        (Date.now() / 1000 - whale.selected.time) / candleIntervals[tf],
      ) + 100
    : 0;
  const historyCount = Math.min(
    12000,
    Math.max(candleCount(storedCount), whaleHistory),
  );
  const resource = useResource<CandleResponse>(
    "/api/candles?symbol=" +
      encodeURIComponent(symbol) +
      "&interval=" +
      tf +
      "&count=" +
      historyCount +
      "&exchange=" +
      exchange,
    0,
  );
  const latest = useResource<CandleResponse>(
    "/api/candles/latest?symbol=" +
      encodeURIComponent(symbol) +
      "&interval=" +
      tf +
      "&exchange=" +
      exchange,
    2000,
  );
  const [candleState, setCandleState] = useState<{
    base: CandleResponse | undefined;
    response: CandleResponse | undefined;
  }>();
  const accumulated = useRef<typeof candleState>(undefined);
  const candleData =
    candleState?.base === resource.data ? candleState?.response : resource.data;
  const historyWarning = candleData?.warning?.match(
    /[^.]*: \d+ из \d+ свечей\./,
  )?.[0];
  const otherWarning = historyWarning
    ? candleData?.warning?.replace(historyWarning, "").trim()
    : candleData?.warning;
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
    if (response && resource.data)
      saveCandles(
        `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${tf}&count=${historyCount}&exchange=${exchange}`,
        response,
      );
    accumulated.current = { base: resource.data, response };
    setCandleState(accumulated.current);
  }, [
    symbol,
    tf,
    historyCount,
    exchange,
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
  const stochRsi = useStochRsi(tf, candleData, indicators);
  const mtmPanes = useMtm(tf, candleData, indicators);
  const overlays = useOverlays(
    symbol,
    tf,
    candleData,
    indicators,
    historyCount,
    indicatorRefresh,
  );
  const coinglass = useCoinglass(symbol, indicators, tf);
  const pine = usePineScripts(symbol, tf, candleData, indicators);
  const editingIndicator = indicators.find((i) => i.id === settingsId);
  function openIndicatorSettings(id: string) {
    setManager(false);
    if (indicators.find((i) => i.id === id)?.pine) {
      setPineSettingsId(id);
      return;
    }
    setSettingsId(id);
  }
  const q = rows.find((x) => marketSymbol(x.symbol) === marketSymbol(symbol)),
    cleanSymbol = marketSymbol(symbol),
    fallbackQuote = cleanSymbol.endsWith("USDC") ? "USDC" : "USDT",
    item =
      candleData?.instrument ??
      q ??
      catalog.find((x) => x.symbol === symbol) ??
      (/^[A-Z0-9]+(?:USDT|USDC)$/.test(cleanSymbol)
        ? {
            symbol,
            base: cleanSymbol.slice(0, -4),
            quote: fallbackQuote,
            name: cleanSymbol.slice(0, -4),
          }
        : undefined);
  const heatmap = useHeatmap(symbol, item?.base ?? "", indicators, tf);
  const heatmapLayer = useMemo(() => {
    if (!heatmap.visible || !heatmap.data || !heatmap.model) return undefined;
    return {
      axis: heatmap.data.y,
      columns: heatmap.model.columns,
      times: heatmap.data.candles.map(({ x, time }) => ({ x, time })),
      cells: heatmap.model.visible,
      intensity: heatmap.model.intensity,
      threshold: heatmap.settings.threshold,
      scheme: heatmap.settings.scheme,
    };
  }, [
    heatmap.visible,
    heatmap.data,
    heatmap.model,
    heatmap.settings.threshold,
    heatmap.settings.scheme,
  ]);
  const bars = candleData?.data ?? [],
    last = bars.at(-1);
  const coins = rows.filter((x) => x.category === "crypto");
  const missingFavorites = favorites.filter((saved) => {
    const clean = saved.replace(/^(FUTURES|SPOT):/, "");
    return !coins.some((item) => marketSymbol(item.symbol) === clean);
  });
  const favoriteListRef = useReorderAnimation<HTMLDivElement>(
    onlyFavorites ? favorites.map(favoriteKey).join("|") : "",
  );
  const favoriteQuotes = useResource<MarketResponse>(
    "/api/markets/favorites?symbols=" +
      encodeURIComponent(missingFavorites.join(",")) +
      "&exchange=" +
      exchange,
    15000,
    onlyFavorites && missingFavorites.length > 0,
  );
  const list = (
    onlyFavorites
      ? favorites.map((saved) => {
          const clean = saved.replace(/^(FUTURES|SPOT):/, "");
          const quote =
            ["USDT", "USDC", "FDUSD", "BUSD", "BTC", "ETH"].find((suffix) =>
              clean.endsWith(suffix),
            ) ?? "";
          const item = coins.find((x) => marketSymbol(x.symbol) === clean);
          const fetched = favoriteQuotes.data?.data.find(
            (x) => marketSymbol(x.symbol) === clean,
          );
          return item
            ? { ...item, symbol: saved }
            : fetched
              ? { ...fetched, symbol: saved }
              : {
                  symbol: saved,
                  base: clean.slice(0, clean.length - quote.length) || clean,
                  quote,
                  name: clean,
                  category: "crypto" as const,
                  sector: "Perpetual",
                  seed: 0,
                  price: Number.NaN,
                  change: Number.NaN,
                  volume: 0,
                  high: 0,
                  low: 0,
                  source: "demo" as const,
                  provider: "",
                  asOf: "",
                };
        })
      : coins
  ).filter((x) =>
    (x.symbol + " " + x.name).toLowerCase().includes(query.toLowerCase()),
  );
  function changeIndicators(next: Parameters<typeof setIndicators>[0]) {
    setIndicators(next);
  }
  function openPineEditor(script?: PineScript) {
    if (script) setDraft(script);
    setEditorOpen(true);
    setManager(false);
  }
  function savePine(script: PineScript) {
    const next = { ...script, name: script.name.trim() };
    if (!isPineScript(next)) return;
    setScripts([...scripts.filter((s) => s.id !== next.id), next]);
    setIndicators((previous) =>
      previous.map((i) => (i.pine?.id === next.id ? { ...i, pine: next } : i)),
    );
  }
  function addPine(script: PineScript) {
    if (!isPineScript(script)) return;
    setIndicators((previous) => {
      const existing = previous.find((i) => i.pine?.id === script.id);
      return existing
        ? previous.map((i) =>
            i.id === existing.id ? { ...i, pine: script, enabled: true } : i,
          )
        : [
            ...previous,
            {
              id: crypto.randomUUID(),
              definitionId: "pine-script",
              enabled: true,
              period: 20,
              color: "#99a5ff",
              paneId: "main",
              pine: script,
            },
          ];
    });
    setManager(false);
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
    <main className={`pair-page${editorOpen ? " has-pine-editor" : ""}`}>
      <div className="pair-layout">
        <section className="chart-workspace panel">
          {resource.error && (
            <div className="market-source-error" role="alert">
              {resource.error}{" "}
              <button
                className="button"
                onClick={() => void resource.refresh(true)}
              >
                Повторить
              </button>
            </div>
          )}
          <div className="pair-heading">
            <CoinIcon base={item.base} />
            <div className="pair-instrument">
              <div className="pair-instrument-title">
                <h1>
                  {item.base}
                  <small> / {item.quote}</small>
                </h1>
                <div className="pair-price">
                  <strong className="mono">
                    {last ? priceFormat(last.close) : "—"}
                  </strong>
                  {q && <Change value={q.change} />}
                </div>
              </div>
              <p className="pair-instrument-meta">
                {item.name}{" "}
                <span
                  className={"source-badge " + (candleData?.source ?? "demo")}
                >
                  {candleData?.source === "live"
                    ? candleData.provider
                    : candleData?.source === "stale"
                      ? `${candleData.provider} · устарели`
                      : `${exchanges[exchange]} Futures`}
                </span>
              </p>
            </div>

            <button
              className={
                "star-button " +
                (hasFavorite(favorites, symbol) ? "is-starred" : "")
              }
              aria-label="Избранное"
              onClick={() => star(symbol)}
            >
              <Star
                size={18}
                fill={hasFavorite(favorites, symbol) ? "currentColor" : "none"}
              />
            </button>
            <div className="chart-toolbar">
              <Choice
                label="Источник рыночных данных"
                value={exchange}
                onChange={(value) => {
                  if (isMarketExchange(value)) setExchange(value);
                }}
                items={Object.entries(exchanges)}
              />
              <div className="chart-timeframes">
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
                <Select
                  value={
                    ["15m", "1h", "4h", "1d"].includes(tf) ? undefined : tf
                  }
                  onValueChange={(v) => setTf(v as Timeframe)}
                >
                  <SelectTrigger aria-label="Другой таймфрейм">
                    <SelectValue placeholder="Ещё" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      ["1m", "1 минута"],
                      ["3m", "3 минуты"],
                      ["5m", "5 минут"],
                      ["15m", "15 минут"],
                      ["30m", "30 минут"],
                      ["1h", "1 час"],
                      ["2h", "2 часа"],
                      ["4h", "4 часа"],
                      ["1d", "1 день"],
                      ["1w", "1 неделя"],
                    ].map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              <button
                className="button toolbar-button"
                onClick={() => setEditorOpen((v) => !v)}
                aria-pressed={editorOpen}
              >
                <TerminalSquare size={16} /> Pine Editor
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
              {otherWarning && `${otherWarning}. `}Данные не являются рыночными.
            </div>
          )}
          {candleData?.source !== "demo" && otherWarning && (
            <div className="notice">{otherWarning}</div>
          )}
          {indicators.length > 0 && (
            <div className="indicator-strip">
              {indicators.map((i) => (
                <div className="indicator-chip" key={i.id}>
                  <button
                    type="button"
                    className="indicator-chip-main"
                    title="Нажмите для настроек · двойное нажатие — удалить"
                    onClick={() => {
                      if (indicatorClickTimer.current)
                        clearTimeout(indicatorClickTimer.current);
                      indicatorClickTimer.current = setTimeout(() => {
                        i.pine
                          ? setPineSettingsId(i.id)
                          : hasIndicatorSettings(i.definitionId)
                            ? openIndicatorSettings(i.id)
                            : setManager(true);
                        indicatorClickTimer.current = null;
                      }, 300);
                    }}
                    onDoubleClick={() => {
                      if (indicatorClickTimer.current)
                        clearTimeout(indicatorClickTimer.current);
                      indicatorClickTimer.current = null;
                      changeIndicators(indicators.filter((x) => x.id !== i.id));
                    }}
                    style={{ opacity: i.enabled ? 1 : 0.5 }}
                  >
                    <IndicatorIcon name={i.icon} color={i.color} />
                    {i.pine?.name ??
                      indicatorRegistry.find((x) => x.id === i.definitionId)
                        ?.name}
                  </button>
                  <button
                    type="button"
                    className={`indicator-visibility${i.enabled ? " is-visible" : ""}`}
                    aria-label={`${i.enabled ? "Скрыть" : "Показать"} ${i.pine?.name ?? indicatorRegistry.find((x) => x.id === i.definitionId)?.name ?? ""}`}
                    aria-pressed={i.enabled}
                    title={
                      i.enabled ? "Скрыть индикатор" : "Показать индикатор"
                    }
                    onClick={() =>
                      changeIndicators((previous) =>
                        previous.map((x) =>
                          x.id === i.id ? { ...x, enabled: !x.enabled } : x,
                        ),
                      )
                    }
                  >
                    <span />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="chart-stage">
            {whale.selection && (
              <div className="whale-chart-toolbar">
                <a href={`/whales/${whale.selection.address}`}>
                  Кит {whale.selection.address.slice(0, 8)}…
                  {whale.selection.address.slice(-4)}
                </a>
                <span>
                  {whale.resource.error ||
                    whale.resource.data?.error ||
                    (!whale.resource.data?.profile || whale.positionLoading
                      ? "Загружаем сделки…"
                      : !whale.selected
                        ? "Выбранная сделка или позиция отсутствует в доступной истории"
                        : whale.selected.time === undefined
                          ? `Средняя цена входа $${whale.selected.price.toLocaleString("ru-RU", { maximumFractionDigits: 8 })} · время неизвестно, метка не выставляется`
                          : bars.length && whale.selected.time < bars[0].time
                            ? "Сделка вне загруженной истории — увеличьте таймфрейм"
                            : "Входы и выходы · наведите на отметку для подробностей")}
                </span>
                <button className="button" onClick={whale.clear}>
                  Скрыть сделки кита
                </button>
              </div>
            )}
            <MarketChart
              key={`${exchange}:${symbol}`}
              symbol={symbol}
              bars={bars}
              whalePoints={whale.points}
              timeframe={tf}
              palette={palette}
              timezone={timezone}
              tickSize={candleData?.tickSize}
              resetKey={reset}
              vmcPanes={vmc.panes}
              stochRsiPanes={stochRsi}
              mtmPanes={mtmPanes}
              orderBlocks={orderBlocks}
              priceOverlays={overlays.overlays}
              historyCount={historyCount}
              coinglass={coinglass.overlays}
              heatmapLevels={heatmap.levels}
              heatmapLayer={heatmapLayer}
              pineResults={pine.results}
              indicatorNames={Object.fromEntries(
                indicators
                  .filter(
                    (i) =>
                      i.enabled && (!i.timeframes || i.timeframes.includes(tf)),
                  )
                  .map((i) => [
                    i.id,
                    i.pine?.name ??
                      indicatorRegistry.find((d) => d.id === i.definitionId)
                        ?.name ??
                      i.definitionId,
                  ]),
              )}
            />
            {historyWarning && (
              <div className="chart-history-note" role="status">
                {historyWarning}
              </div>
            )}
            {!bars.length && (resource.error || latest.error) && (
              <div className="chart-history-note" role="alert">
                Не удалось загрузить график
              </div>
            )}
          </div>
          {pine.loading && (
            <p className="pine-status muted" role="status">
              Расчёт Pine Script…
            </p>
          )}
          {pine.errors.map((error) => (
            <p className="notice error" role="alert" key={error}>
              {error}
            </p>
          ))}
          {pine.results.flatMap((r) =>
            r.warnings.map((w) => (
              <p className="notice" key={`${r.id}:${w}`}>
                {r.name}: {w}
              </p>
            )),
          )}
          {editorOpen && (
            <PineEditor
              draft={draft}
              scripts={scripts}
              onChange={setDraft}
              onSave={savePine}
              onRun={(s) => {
                savePine(s);
                addPine(s);
              }}
              onClose={() => setEditorOpen(false)}
              loading={pine.loading}
              errors={pine.errors}
            />
          )}
          <PineStrategyReport results={pine.results} />
          {(coinglass.instances.length > 0 || heatmap.instance) && (
            <details className="chart-extra-panels">
              <summary>
                <Layers3 size={14} /> CoinGlass · карты и данные
              </summary>
              <div className="chart-extra-grid">
                <CoinglassPanel
                  onChange={(next) =>
                    changeIndicators(
                      indicators.map((i) => (i.id === next.id ? next : i)),
                    )
                  }
                  state={coinglass}
                  openSettings={openIndicatorSettings}
                />
                <HeatmapPanel
                  state={heatmap}
                  onChange={(params) =>
                    changeIndicators(
                      indicators.map((i) =>
                        i.id === heatmap.instance?.id ? { ...i, params } : i,
                      ),
                    )
                  }
                  openSettings={() =>
                    heatmap.instance &&
                    openIndicatorSettings(heatmap.instance.id)
                  }
                />
              </div>
            </details>
          )}
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
        </section>
        <aside className="watchlist panel">
          <div className="section-heading watchlist-heading">
            <h2>{onlyFavorites ? "Избранные пары" : "Инструменты"}</h2>
            <button
              className={
                "watchlist-filter " + (onlyFavorites ? "selected" : "")
              }
              aria-label={
                onlyFavorites
                  ? "Показать все инструменты"
                  : "Показать избранное"
              }
              title={onlyFavorites ? "Все инструменты" : "Избранное"}
              aria-pressed={onlyFavorites}
              onClick={() => setOnlyFavorites(!onlyFavorites)}
            >
              {onlyFavorites ? "Все" : <Star size={13} />}
            </button>
          </div>
          <SymbolSearch
            exchange={exchange}
            favorites={favorites}
            star={star}
            query={query}
            onQueryChange={setQuery}
          />
          <div className="watchlist-labels">
            <span>Инструмент</span>
            <span>Цена / 24ч</span>
          </div>
          <div
            className="watchlist-items"
            ref={favoriteListRef}
            data-favorites-order={onlyFavorites ? favorites.join("|") : ""}
          >
            {list.map((x) => (
              <div
                className={`watch-item ${marketSymbol(x.symbol) === marketSymbol(symbol) ? "active" : ""}`}
                key={x.symbol}
                data-sort-id={onlyFavorites ? favoriteKey(x.symbol) : undefined}
                draggable={onlyFavorites}
                data-dragging={
                  draggingFavorite === favoriteKey(x.symbol) || undefined
                }
                data-drop-target={
                  dropFavorite === favoriteKey(x.symbol) || undefined
                }
                onDragStart={(event) => {
                  if (!onlyFavorites) return;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    "text/plain",
                    favoriteKey(x.symbol),
                  );
                  setDraggingFavorite(favoriteKey(x.symbol));
                }}
                onDragOver={(event) => {
                  if (
                    !onlyFavorites ||
                    !draggingFavorite ||
                    draggingFavorite === favoriteKey(x.symbol)
                  )
                    return;
                  event.preventDefault();
                  setDropFavorite(favoriteKey(x.symbol));
                }}
                onDragLeave={() => setDropFavorite("")}
                onDrop={(event) => {
                  if (!onlyFavorites) return;
                  event.preventDefault();
                  const source =
                    event.dataTransfer.getData("text/plain") ||
                    draggingFavorite;
                  const rect = event.currentTarget.getBoundingClientRect();
                  moveFavorite(
                    source,
                    favoriteKey(x.symbol),
                    event.clientY > rect.top + rect.height / 2,
                  );
                  setDraggingFavorite("");
                  setDropFavorite("");
                }}
                onDragEnd={() => {
                  setDraggingFavorite("");
                  setDropFavorite("");
                }}
                style={{
                  borderLeftColor: favoriteColorMap[x.symbol] || undefined,
                }}
              >
                {onlyFavorites && (
                  <span
                    className="favorite-drag-handle watch-drag-handle"
                    title={`Перетащить ${x.base}`}
                    aria-label={`Перетащить ${x.base}`}
                  >
                    <GripVertical size={14} />
                  </span>
                )}
                <a
                  className="watch-item-link"
                  href={"/pair/" + encodeURIComponent(x.symbol)}
                >
                  <div className="watch-item-instrument">
                    <CoinIcon base={x.base} />
                    <b>
                      {x.base} / {x.quote}
                    </b>
                  </div>
                  <div className="mono watch-item-quote">
                    <b>
                      {Number.isFinite(x.price) ? priceFormat(x.price) : "—"}
                    </b>{" "}
                    {Number.isFinite(x.change) ? (
                      <Change value={x.change} />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                </a>
                {onlyFavorites && (
                  <details className="favorite-color-picker">
                    <summary
                      title="Цветная метка"
                      aria-label={`Цветная метка ${x.base}`}
                    >
                      <span
                        style={{
                          background:
                            favoriteColorMap[x.symbol] || "transparent",
                          borderColor:
                            favoriteColorMap[x.symbol] ||
                            "var(--muted-foreground)",
                        }}
                      />
                    </summary>
                    <div
                      className="favorite-color-options"
                      role="group"
                      aria-label={`Цветная метка ${x.base}`}
                    >
                      {favoriteColors.map(({ name, value }) => (
                        <button
                          key={value}
                          type="button"
                          title={name}
                          aria-label={name}
                          aria-pressed={favoriteColorMap[x.symbol] === value}
                          style={{ background: value }}
                          onClick={(event) => {
                            setFavoriteColor(x.symbol, value);
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                          }}
                        />
                      ))}
                      <button
                        type="button"
                        className="favorite-color-clear"
                        title="Убрать метку"
                        aria-label="Убрать метку"
                        onClick={(event) => {
                          setFavoriteColor(x.symbol, "");
                          event.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                      />
                    </div>
                  </details>
                )}
              </div>
            ))}
            {!list.length && (
              <p className="empty-state">Инструменты не найдены</p>
            )}
          </div>
          <div className="panel-foot">{list.length} инструментов</div>
        </aside>
      </div>
      <Dialog open={manager} onOpenChange={setManager}>
        <DialogContent className="indicator-dialog indicator-manager">
          <DialogHeader>
            <DialogTitle>Индикаторы и стратегии</DialogTitle>
            <DialogDescription>
              Встроенные инструменты и мои Pine Script. Набор сохраняется при
              переключении пары.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={catalogTab} onValueChange={setCatalogTab}>
            <TabsList>
              <TabsTrigger value="indicators">Индикаторы</TabsTrigger>
              <TabsTrigger value="strategies">Стратегии</TabsTrigger>
              <TabsTrigger value="custom-indicators">
                Мои индикаторы
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <button className="button" onClick={() => openPineEditor()}>
            <TerminalSquare size={16} /> Открыть Pine Editor
          </button>
          <label className="search-field">
            <Search size={16} />
            <input
              placeholder="Найти индикатор или стратегию…"
              aria-label="Поиск индикаторов"
              value={indicatorSearch}
              onChange={(e) => setIndicatorSearch(e.target.value)}
            />
          </label>
          <div className="indicator-manager-columns">
            <section>
              <h3>Доступные</h3>
              <div className="indicator-catalog">
                {catalogTab === "indicators" &&
                  indicatorRegistry
                    .filter(
                      (x) =>
                        x.id !== "pine-script" &&
                        !["stoch-rsi", "pine-rsi", "pine-sma"].includes(x.id) &&
                        x.name
                          .toLowerCase()
                          .includes(indicatorSearch.toLowerCase()),
                    )
                    .map((d) => (
                      <div className="indicator-definition" key={d.id}>
                        <div>
                          <b>{d.name}</b>
                        </div>
                        <button
                          className="icon-button"
                          disabled={
                            ["coinglass", "coinglass-heatmap"].includes(d.id) &&
                            indicators.some((i) => i.definitionId === d.id)
                          }
                          aria-label={"Добавить " + d.name}
                          onClick={() =>
                            changeIndicators([
                              ...indicators,
                              {
                                id: crypto.randomUUID(),
                                definitionId: d.id,
                                enabled: true,
                                period:
                                  d.id === "vmc" ? 9 : d.id === "mtm" ? 60 : 20,
                                color:
                                  d.id === "stoch-rsi"
                                    ? "#2962FF"
                                    : d.id === "sonarlab-ob"
                                      ? orderBlockDefaults.col_bullish
                                      : "#99a5ff",
                                paneId: ["vmc", "stoch-rsi", "mtm"].includes(
                                  d.id,
                                )
                                  ? "oscillator"
                                  : "main",
                                ...(d.id === "mtm"
                                  ? { params: { maPeriod: 60 } }
                                  : d.id === "stoch-rsi"
                                    ? { params: { ...stochRsiDefaults } }
                                    : d.id === "vmc"
                                      ? {
                                          params: { ...vmcDefaults },
                                          style: { ...vmcStyleDefaults },
                                        }
                                      : d.id === "sonarlab-ob"
                                        ? { params: { ...orderBlockDefaults } }
                                        : d.id === "drz"
                                          ? { params: { ...drzDefaults } }
                                          : d.id === "fvg-luxalgo"
                                            ? { params: { ...fvgDefaults } }
                                            : d.id === "smc"
                                              ? { params: { ...smcDefaults } }
                                              : d.id === "coinglass"
                                                ? {
                                                    params: {
                                                      ...coinglassDefaults,
                                                    },
                                                  }
                                                : d.id === "coinglass-heatmap"
                                                  ? {
                                                      params: {
                                                        ...heatmapDefaults,
                                                      },
                                                    }
                                                  : {}),
                              },
                            ])
                          }
                        >
                          <Plus size={19} />
                        </button>
                      </div>
                    ))}
                <PineCatalog
                  tab={catalogTab}
                  query={indicatorSearch}
                  scripts={scripts}
                  onAdd={addPine}
                  onEdit={openPineEditor}
                  onDelete={(id) => {
                    setScripts(scripts.filter((s) => s.id !== id));
                    setIndicators((previous) =>
                      previous.filter((i) => i.pine?.id !== id),
                    );
                  }}
                />
              </div>
            </section>
            <section>
              <h3>Активные · {indicators.length}</h3>
              <div className="indicator-instances">
                {indicators.map((i, index) => (
                  <div className="indicator-instance" key={i.id}>
                    <button
                      className="indicator-row-name"
                      onClick={() => openIndicatorSettings(i.id)}
                      title="Открыть настройки"
                    >
                      {i.pine?.name ??
                        indicatorRegistry.find((d) => d.id === i.definitionId)
                          ?.name}
                    </button>
                    <Switch
                      checked={i.enabled}
                      aria-label={`Видимость ${i.pine?.name ?? i.definitionId}`}
                      onCheckedChange={(enabled) =>
                        changeIndicators((previous) =>
                          previous.map((x) =>
                            x.id === i.id ? { ...x, enabled } : x,
                          ),
                        )
                      }
                    />
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
                        changeIndicators(
                          indicators.filter((x) => x.id !== i.id),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {!indicators.length && (
                  <p className="muted">
                    Добавьте индикатор из каталога, чтобы настроить его
                    параметры.
                  </p>
                )}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
      {(() => {
        const instance = indicators.find((item) => item.id === pineSettingsId);
        const result = pine.results.find((item) => item.id === pineSettingsId);
        if (!instance?.pine) return null;
        return (
          <Dialog
            open
            onOpenChange={(open) => !open && setPineSettingsId(null)}
          >
            <DialogContent className="indicator-dialog pine-settings-dialog">
              <DialogHeader>
                <DialogTitle>Настройки · {instance.pine.name}</DialogTitle>
                <DialogDescription>
                  Параметры скрипта и оформление элементов на графике.
                </DialogDescription>
              </DialogHeader>
              <IndicatorPresets
                instance={instance}
                onLoad={(next) =>
                  changeIndicators(
                    indicators.map((item) =>
                      item.id === next.id ? next : item,
                    ),
                  )
                }
              />
              <div className="instance-options">
                <span>Иконка</span>
                <IndicatorIcon name={instance.icon} color={instance.color} />
                <Choice
                  label="Иконка индикатора"
                  value={instance.icon ?? "layers"}
                  items={indicatorIcons.map(([key, label]) => [key, label])}
                  onChange={(icon) =>
                    changeIndicators(
                      indicators.map((item) =>
                        item.id === instance.id ? { ...item, icon } : item,
                      ),
                    )
                  }
                />
                <span>Цвет значка</span>
                <input
                  type="color"
                  aria-label={`Цвет значка ${instance.pine.name}`}
                  value={instance.color}
                  onChange={(event) =>
                    changeIndicators(
                      indicators.map((item) =>
                        item.id === instance.id
                          ? { ...item, color: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </div>
              {result ? (
                <PineSettings
                  result={result}
                  settings={
                    (instance.params as PineInstanceSettings | undefined) ?? {}
                  }
                  defaultOpen
                  onChange={(params) =>
                    changeIndicators(
                      indicators.map((item) =>
                        item.id === instance.id ? { ...item, params } : item,
                      ),
                    )
                  }
                />
              ) : (
                <p className="muted">
                  {pine.errors.find((message) =>
                    message.startsWith(`${instance.pine!.name}:`),
                  ) ??
                    "Параметры скрипта станут доступны после его расчёта на текущем таймфрейме."}
                </p>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}
      {editingIndicator?.definitionId === "mtm" && (
        <Dialog open onOpenChange={(open) => !open && setSettingsId(null)}>
          <DialogContent className="settings-dialog">
            <DialogHeader>
              <DialogTitle>TM · Momentum</DialogTitle>
              <DialogDescription>
                Параметры расчёта импульса и сглаживания.
              </DialogDescription>
            </DialogHeader>
            <IndicatorPresets
              instance={editingIndicator}
              onLoad={(next) =>
                changeIndicators(
                  indicators.map((item) => (item.id === next.id ? next : item)),
                )
              }
            />
            <div className="vmc-fields">
              <label className="vmc-field">
                <span>N · импульс</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editingIndicator.period}
                  onChange={(e) =>
                    changeIndicators(
                      indicators.map((i) =>
                        i.id === editingIndicator.id
                          ? {
                              ...i,
                              period: Math.max(
                                1,
                                Math.min(100, Number(e.target.value) || 1),
                              ),
                            }
                          : i,
                      ),
                    )
                  }
                />
              </label>
              <label className="vmc-field">
                <span>N1 · средняя MTM</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={
                    Number(
                      (editingIndicator.params as { maPeriod?: number })
                        ?.maPeriod,
                    ) || 60
                  }
                  onChange={(e) =>
                    changeIndicators(
                      indicators.map((i) =>
                        i.id === editingIndicator.id
                          ? {
                              ...i,
                              params: {
                                ...i.params,
                                maPeriod: Math.max(
                                  1,
                                  Math.min(100, Number(e.target.value) || 1),
                                ),
                              },
                            }
                          : i,
                      ),
                    )
                  }
                />
              </label>
              <label className="vmc-field">
                <span>Цвет значка</span>
                <input
                  type="color"
                  value={editingIndicator.color}
                  onChange={(e) =>
                    changeIndicators(
                      indicators.map((i) =>
                        i.id === editingIndicator.id
                          ? { ...i, color: e.target.value }
                          : i,
                      ),
                    )
                  }
                />
              </label>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {editingIndicator &&
        ["drz", "smc", "fvg-luxalgo"].includes(
          editingIndicator.definitionId,
        ) && (
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
      {editingIndicator?.definitionId === "coinglass-heatmap" && (
        <HeatmapSettings
          instance={editingIndicator}
          state={heatmap}
          onClose={() => setSettingsId(null)}
          onChange={(params) =>
            changeIndicators(
              indicators.map((i) =>
                i.id === editingIndicator.id ? { ...i, params } : i,
              ),
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
      {editingIndicator?.definitionId === "stoch-rsi" && (
        <StochRsiSettingsDialog
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
