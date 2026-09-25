"use client";
import { useEffect, useState } from "react";
import { Activity, ChartNoAxesCombined, LayoutGrid, Settings2, Waves } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStored } from "../hooks/use-resource";

const themes = [
  ["dark", "Графит"], ["midnight", "Полночь"], ["light", "Светлая"],
  ["ocean", "Океан"], ["forest", "Лес"], ["plum", "Слива"],
  ["coffee", "Кофе"], ["slate", "Сланец"], ["burgundy", "Бордо"],
  ["teal", "Лагуна"], ["indigo", "Индиго"], ["olive", "Олива"], ["rose", "Роза"],
];

export function SiteHeader({
  active,
  onOpenSettings,
}: {
  active: "markets" | "chart" | "fear-greed" | "rsi-heatmap" | "backlog";
  onOpenSettings?: () => void;
}) {
  const [theme, setTheme] = useStored("vector.theme.v1", "dark");
  const [accent, setAccent] = useStored("vector.accent.v1", "#99a5ff");
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty("--brand", accent);
  }, [theme, accent]);

  return (
    <>
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-mark"><ChartNoAxesCombined size={22} /></span>
          DiVMoney<span className="brand-tag">TERMINAL</span>
        </a>
        <nav>
          <a className={active === "markets" ? "active" : ""} href="/"><LayoutGrid size={16} /> Рынки</a>
          <a className={active === "chart" ? "active" : ""} href="/pair/BTCUSDT"><ChartNoAxesCombined size={17} /> График</a>
          <a className={active === "fear-greed" ? "active" : ""} href="/fear-greed"><Activity size={16} /> Fear &amp; Greed</a>
          <a className={active === "rsi-heatmap" ? "active" : ""} href="/rsi-heatmap"><Waves size={16} /> RSI Heatmap</a>
          <a className={active === "backlog" ? "active" : ""} href="/backlog">Беклог</a>
        </nav>
        <div className="topbar-right">
          <span className="workspace-label">Личная рабочая область</span>
          <button className="icon-button" aria-label="Настройки оформления" onClick={() => onOpenSettings ? onOpenSettings() : setSettings(true)}>
            <Settings2 size={19} />
          </button>
          <span className="avatar">DM</span>
        </div>
      </header>
      {!onOpenSettings && <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="settings-dialog">
          <DialogHeader><DialogTitle>Настройки оформления</DialogTitle></DialogHeader>
          <label className="settings-row">Тема сайта
            <select value={theme} onChange={event => setTheme(event.target.value)}>
              {themes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label className="settings-row">Акцент интерфейса
            <input type="color" value={accent} onChange={event => setAccent(event.target.value)} />
          </label>
          <button className="button" onClick={() => setSettings(false)}>Готово</button>
        </DialogContent>
      </Dialog>}
    </>
  );
}
