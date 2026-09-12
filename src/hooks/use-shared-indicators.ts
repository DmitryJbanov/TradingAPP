"use client";
import { useEffect, useRef, useState } from "react";
import type { IndicatorInstance } from "../domain/workspace";
import {
  initialSharedIndicators,
  supportedIndicators,
  SHARED_INDICATORS_KEY,
  LEGACY_INDICATORS_KEY,
} from "../domain/shared-indicators";

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return undefined;
  }
}

export function useSharedIndicators(symbol: string) {
  const firstSymbol = useRef(symbol);
  const [indicators, setIndicators] = useState<IndicatorInstance[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setIndicators(
      initialSharedIndicators(
        read(SHARED_INDICATORS_KEY),
        read(LEGACY_INDICATORS_KEY),
        firstSymbol.current,
      ),
    );
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        SHARED_INDICATORS_KEY,
        JSON.stringify(supportedIndicators(indicators)),
      );
    } catch {
      /* Retain the selection in memory if browser storage is unavailable. */
    }
  }, [indicators, ready]);
  return [indicators, setIndicators] as const;
}
