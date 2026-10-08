"use client";
import { useEffect, useRef } from "react";
import { useStored } from "./use-resource";
import { useProfiles } from "../components/profile-provider";
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
  const profiles = useProfiles();
  const [indicators, setStored] = useStored<IndicatorInstance[]>(SHARED_INDICATORS_KEY, []);
  const setIndicators: typeof setStored = (next) => setStored((previous) => {
    const value = typeof next === "function" ? next(previous) : next;
    return supportedIndicators(value);
  });
  useEffect(() => {
    if (profiles) return;
    if (!indicators.length) {
      const migrated = initialSharedIndicators(read(SHARED_INDICATORS_KEY), read(LEGACY_INDICATORS_KEY), firstSymbol.current);
      if (migrated.length) setStored(migrated);
    }
  }, []);
  return [indicators, setIndicators] as const;
}
