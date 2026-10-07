import {
  Activity,
  Atom,
  BadgeCheck,
  BarChart3,
  CircleDot,
  Compass,
  Crosshair,
  Gauge,
  GitBranch,
  Lightbulb,
  Layers3,
  LineChart,
  Orbit,
  Radar,
  ScanLine,
  Shield,
  Star,
  Spline,
  SquareActivity,
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
  ["line-chart", "Линейный график", LineChart],
  ["crosshair", "Прицел", Crosshair],
  ["radar", "Радар", Radar],
  ["gauge", "Индикатор", Gauge],
  ["circle-dot", "Точка", CircleDot],
  ["compass", "Компас", Compass],
  ["spline", "Кривая", Spline],
  ["orbit", "Орбита", Orbit],
  ["branch", "Ветвление", GitBranch],
  ["scan", "Сканирование", ScanLine],
  ["shield", "Защита", Shield],
  ["idea", "Идея", Lightbulb],
  ["atom", "Атом", Atom],
  ["check", "Сигнал", BadgeCheck],
  ["square-activity", "Активность", SquareActivity],
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
