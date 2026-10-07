"use client";
import { useEffect, useState } from "react";

const colors: Record<string, string> = {
  BTC: "#efac53",
  ETH: "#929df7",
  SOL: "#84d5c7",
  BNB: "#e3bd45",
  XRP: "#d2d9e4",
  DOGE: "#bba96d",
};

export function CoinIcon({ base }: { base: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [base]);
  const color = colors[base] ?? "#9badd4";
  return (
    <span
      className="coin-icon"
      style={{ color, background: `${color}16` }}
      aria-hidden="true"
    >
      {!failed ? (
        <img
          src={`https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : base === "BTC" ? (
        "₿"
      ) : (
        base.slice(0, 2)
      )}
    </span>
  );
}
