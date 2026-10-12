"use client";
import { useEffect, useRef } from "react";
import { useStored } from "./use-resource";
import { useProfiles } from "../components/profile-provider";
import type { IndicatorInstance } from "../domain/workspace";
import {
  INDICATOR_PRESETS_KEY,
  applyDefaultPreset,
} from "../domain/indicator-presets";
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
  const [indicators, setStored] = useStored<IndicatorInstance[]>(
    SHARED_INDICATORS_KEY,
    [],
  );
  const setIndicators: typeof setStored = (next) => {
    let visibilityChanged = false;
    setStored((previous) => {
      const presets = profiles
        ? profiles.getValue(INDICATOR_PRESETS_KEY, undefined)
        : read(INDICATOR_PRESETS_KEY);
      const value = supportedIndicators(
        typeof next === "function" ? next(previous) : next,
      ).map((item) =>
        previous.some((old) => old.id === item.id)
          ? item
          : applyDefaultPreset(item, presets),
      );
      visibilityChanged = previous.some((item) => {
        const updated = value.find((candidate) => candidate.id === item.id);
        return updated && updated.enabled !== item.enabled;
      });
      return value;
    });
    if (visibilityChanged)
      void profiles?.saveValue(SHARED_INDICATORS_KEY).catch(() => {});
  };
  useEffect(() => {
    if (profiles) return;
    if (!indicators.length) {
      const migrated = initialSharedIndicators(
        read(SHARED_INDICATORS_KEY),
        read(LEGACY_INDICATORS_KEY),
        firstSymbol.current,
      );
      if (migrated.length) setStored(migrated);
    }
  }, []);
  return [indicators, setIndicators] as const;
}
