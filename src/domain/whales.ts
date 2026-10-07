export const exampleWhale = "0x6859da14835424957a1e6b397d8026b1d9ff7e1e";
export const validWhaleAddress = (value: string) =>
  /^0x[0-9a-fA-F]{40}$/.test(value.trim());
export interface WhalePosition {
  address: string;
  coin: string;
  side: "Long" | "Short";
  size: number;
  value: number | null;
  entryPrice: number | null;
  markPrice: number | null;
  leverage: number | null;
  marginType: string;
  pnl: number | null;
  roe: number | null;
  liquidationPrice: number | null;
  margin: number | null;
  funding: number | null;
}
export interface WhaleFill {
  id: string;
  address: string;
  coin: string;
  side: "Buy" | "Sell";
  action: string;
  price: number;
  size: number;
  value: number;
  time: number;
  pnl: number | null;
  fee: number | null;
  hash: string;
}
export interface WhaleProfile {
  address: string;
  collectedAt: string;
  accountValue: number | null;
  positionValue: number | null;
  marginUsed: number | null;
  withdrawable: number | null;
  positions: WhalePosition[];
  fills: WhaleFill[];
  performance: Record<string, number | null>;
  warnings: string[];
  history: Record<
    string,
    { pnlHistory: [number, string][]; accountValueHistory: [number, string][] }
  >;
  orders: {
    coin: string;
    side: string;
    limitPx: string;
    sz: string;
    orderType: string;
    timestamp: number;
    oid: number;
  }[];
  ledger: {
    time: number;
    hash: string;
    delta: {
      type: string;
      usdc?: string;
      usdcValue?: string;
      amount?: string;
      token?: string;
      destination?: string;
      user?: string;
    };
  }[];
}
export interface WhaleAccount {
  address: string;
  label: string;
  accountValue: number | null;
  pnl: number | null;
  pnl24h: number | null;
  positions: WhalePosition[];
  collectedAt: string | null;
}
export interface WhaleOverview {
  history?: WhaleRatioSnapshot[];
  accounts?: WhaleAccount[];
  activity?: WhaleFill[];
  collectedAt?: string;
  loaded?: number;
  total?: number;
  loading: boolean;
  error?: string;
}
export interface WhaleTraderCounts {
  long: number;
  short: number;
  total: number;
}
export interface WhaleRatioSnapshot extends WhaleTraderCounts {
  time: number;
}
export interface WatchedWhale {
  address: string;
  label: string;
  addedAt: string;
  profile?: Pick<
    WhaleProfile,
    | "address"
    | "collectedAt"
    | "accountValue"
    | "positionValue"
    | "positions"
    | "performance"
    | "fills"
  >;
  loading: boolean;
  error?: string;
}
export interface WhaleWatchlist {
  data: WatchedWhale[];
  pollSeconds: number;
  limit: number;
}
export interface WhaleProfileResponse {
  profile?: WhaleProfile;
  tracked: boolean;
  loading: boolean;
  error?: string;
}
export interface WhaleMarketSnapshot {
  collectedAt: string;
  source: "CoinGlass";
  coin: string;
  interval: string;
  positions: WhalePosition[];
  coinRatios: (WhaleTraderCounts & { coin: string; longPercent: number })[];
  history: WhaleRatioSnapshot[];
}
export interface WhaleMarketResponse {
  snapshot?: WhaleMarketSnapshot;
  loading: boolean;
  error?: string;
}
