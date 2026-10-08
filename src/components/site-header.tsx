"use client";
import { useEffect, useState } from "react";
import {
  Activity,
  ChartNoAxesCombined,
  LayoutGrid,
  Settings2,
  Waves,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStored } from "../hooks/use-resource";
import { isSiteTheme, siteThemes } from "../domain/themes";
import { Sessions } from "./sessions";
import { useProfiles } from "./profile-provider";

export function SiteHeader({
  active,
  onOpenSettings,
}: {
  active:
    | "markets"
    | "chart"
    | "fear-greed"
    | "rsi-heatmap"
    | "backlog"
    | "whales";
  onOpenSettings?: () => void;
}) {
  const [theme, setTheme] = useStored("vector.theme.v1", "black");
  const [accent, setAccent] = useStored("vector.accent.v1", "#99a5ff");
  const [settings, setSettings] = useState(false);
  const profiles = useProfiles();
  const [profileName, setProfileName] = useState("");
  useEffect(() => {
    const selectedTheme = isSiteTheme(theme) ? theme : "dark";
    if (selectedTheme !== theme) setTheme(selectedTheme);
    document.documentElement.dataset.theme = selectedTheme;
    document.documentElement.style.setProperty("--brand", accent);
  }, [theme, accent, setTheme]);

  return (
    <>
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-mark">
            <ChartNoAxesCombined size={22} />
          </span>
          DiVMoney<span className="brand-tag">0.5 ALFA</span>
        </a>
        <nav>
          <a className={active === "markets" ? "active" : ""} href="/">
            <LayoutGrid size={16} /> Рынки
          </a>
          <a
            className={active === "chart" ? "active" : ""}
            href="/pair/BTCUSDT"
          >
            <ChartNoAxesCombined size={17} /> График
          </a>
          <a
            className={active === "fear-greed" ? "active" : ""}
            href="/fear-greed"
          >
            <Activity size={16} /> Fear &amp; Greed
          </a>
          <a
            className={active === "rsi-heatmap" ? "active" : ""}
            href="/rsi-heatmap"
          >
            <Waves size={16} /> RSI Heatmap
          </a>
          <a className={active === "whales" ? "active" : ""} href="/whales">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 13.3c1.7-4.1 5.1-6.2 9.8-6.2 3.1 0 5.7 1 7.3 2.8l2.4-1.1v5l-2.3-.5c-1.3 3.6-4.5 5.7-8.9 5.7H7.1L4 20.5v-4C2.6 15.4 2 13.9 2 12.5l1 0.8Z" />
              <path d="M12.5 7c.3-1.1-.2-2-1.4-2.7M11.2 4.4 13 3.5M8.5 14.3c1.4 1 2.9 1.2 4.5.3" />
              <circle
                cx="17"
                cy="10.7"
                r=".7"
                fill="currentColor"
                stroke="none"
              />
            </svg>{" "}
            Киты
          </a>
          <a className={active === "backlog" ? "active" : ""} href="/backlog">
            Беклог
          </a>
        </nav>
        <div className="topbar-right">
          <Sessions compact />
          {profiles && <details className="profile-menu">
            <summary title={`Профиль: ${profiles.profiles.find(p => p.id === profiles.active)?.name ?? "Общий"}`}>{profiles.username}</summary>
            <div className="profile-menu-panel">
              <label>Рабочий профиль<select value={profiles.active} onChange={e => void profiles.switchProfile(e.target.value)}>
                {profiles.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select></label>
              <form onSubmit={e => { e.preventDefault(); if (profileName.trim()) void profiles.createProfile(profileName.trim()).then(() => setProfileName("")); }}>
                <input aria-label="Название профиля" placeholder="Новый профиль" maxLength={48} value={profileName} onChange={e => setProfileName(e.target.value)} />
                <button className="button" type="submit">Создать</button>
              </form>
              <button className="auth-link" onClick={() => void profiles.importLocal()}>Импортировать настройки этого браузера</button>
              {profiles.error && <div className="auth-error" role="status">{profiles.error}</div>}
              <button className="auth-link" onClick={() => void profiles.logout()}>Выйти</button>
            </div>
          </details>}
          <button
            className="icon-button"
            aria-label="Настройки оформления"
            onClick={() =>
              onOpenSettings ? onOpenSettings() : setSettings(true)
            }
          >
            <Settings2 size={19} />
          </button>
          {!profiles && <span className="avatar">DM</span>}
        </div>
      </header>
      {!onOpenSettings && (
        <Dialog open={settings} onOpenChange={setSettings}>
          <DialogContent className="settings-dialog">
            <DialogHeader>
              <DialogTitle>Настройки оформления</DialogTitle>
            </DialogHeader>
            <label className="settings-row">
              Тема сайта
              <select
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
              >
                {siteThemes.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-row">
              Акцент интерфейса
              <input
                type="color"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
              />
            </label>
            <button className="button" onClick={() => setSettings(false)}>
              Готово
            </button>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
