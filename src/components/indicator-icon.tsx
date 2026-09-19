import {
  Activity,
  BarChart3,
  Layers3,
  Star,
  Target,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react";

export const indicatorIcons = [
  ["layers", "Слои", Layers3],
  ["activity", "Импульс", Activity],
  ["bars", "Столбцы", BarChart3],
  ["trend", "Тренд", TrendingUp],
  ["waves", "Волны", Waves],
  ["target", "Уровни", Target],
  ["star", "Звезда", Star],
  ["zap", "Молния", Zap],
] as const;

export function IndicatorIcon({
  name,
  color,
}: {
  name?: string;
  color?: string;
}) {
  const Icon = indicatorIcons.find(([id]) => id === name)?.[2] ?? Layers3;
  return (
    <Icon
      className="indicator-icon"
      size={17}
      color={color}
      aria-hidden="true"
    />
  );
}
