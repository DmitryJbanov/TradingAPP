"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Profile = { id: string; name: string };
type ProfileState = { profiles: Profile[]; active: string; settings: Record<string, unknown> };
type ProfileContextValue = ProfileState & {
  username: string;
  error: string;
  ready: boolean;
  getValue: <T>(key: string, initial: T) => T;
  setValue: <T>(key: string, value: T) => void;
  switchProfile: (id: string) => Promise<void>;
  createProfile: (name: string) => Promise<void>;
  logout: () => Promise<void>;
  importLocal: () => Promise<void>;
};
const ProfileContext = createContext<ProfileContextValue | null>(null);
export const useProfiles = () => useContext(ProfileContext);

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body as T;
}

export function StandaloneProfilesProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState("");
  const [profileState, setProfileState] = useState<ProfileState>({ profiles: [], active: "shared", settings: {} });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(new Map<string, { key: string; timer: number; profile: string; value: unknown }>());
  const apply = useCallback((data: ProfileState & { user?: { username: string } }) => {
    const settings = { ...data.settings };
    for (const change of pending.current.values()) if (change.profile === data.active) settings[change.key] = change.value;
    setProfileState({ profiles: data.profiles, active: data.active, settings });
    if (data.user) setUsername(data.user.username);
  }, []);
  const flushPending = useCallback(async (profile?: string) => {
    const entries = [...pending.current.entries()].filter(([, value]) => !profile || value.profile === profile);
    for (const [key, change] of entries) {
      window.clearTimeout(change.timer);
      await request(`/api/profiles/${encodeURIComponent(change.profile)}`, { method: "PATCH", body: JSON.stringify({ key: change.key, value: change.value }) });
      if (pending.current.get(key)?.timer === change.timer) pending.current.delete(key);
    }
  }, []);
  const refresh = useCallback(async () => { apply(await request<ProfileState & { user?: { username: string } }>("/api/auth/me")); }, [apply]);
  useEffect(() => { void refresh().catch(() => setUsername("" )).finally(() => setReady(true)); }, [refresh]);
  useEffect(() => {
    if (!username) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh().catch(() => {}); }, 7000);
    return () => clearInterval(timer);
  }, [username, refresh]);

  async function authenticate(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { apply(await request(`/api/auth/${register ? "register" : "login"}`, { method: "POST", body: JSON.stringify({ username: name, password }) })); setUsername(name.trim()); setPassword(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось войти"); }
    finally { setBusy(false); }
  }
  const getValue = useCallback(<T,>(key: string, initial: T): T => Object.hasOwn(profileState.settings, key) ? profileState.settings[key] as T : initial, [profileState.settings]);
  const setValue = useCallback(<T,>(key: string, value: T) => {
    if (!username) return;
    setProfileState(s => ({ ...s, settings: { ...s.settings, [key]: value } }));
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    const profile = profileState.active; const pendingKey = `${profile}\0${key}`; const previous = pending.current.get(pendingKey); if (previous) window.clearTimeout(previous.timer);
    const timer = window.setTimeout(() => {
      void request(`/api/profiles/${encodeURIComponent(profile)}`, { method: "PATCH", body: JSON.stringify({ key, value }) }).then(() => {
        if (pending.current.get(pendingKey)?.timer === timer) pending.current.delete(pendingKey);
        setError("");
      }).catch(e => setError(e instanceof Error ? e.message : "Не удалось сохранить профиль"));
    }, 350);
    pending.current.set(pendingKey, { key, timer, profile, value });
  }, [profileState.active, username]);
  const switchProfile = useCallback(async (id: string) => { try { await flushPending(profileState.active); apply(await request("/api/profiles/active", { method: "POST", body: JSON.stringify({ id }) })); setError(""); } catch(e) { setError(e instanceof Error ? e.message : "Не удалось переключить профиль"); } }, [apply, flushPending, profileState.active]);
  const createProfile = useCallback(async (profileName: string) => { try { await flushPending(profileState.active); apply(await request("/api/profiles", { method: "POST", body: JSON.stringify({ name: profileName, source: profileState.active }) })); setError(""); } catch(e) { setError(e instanceof Error ? e.message : "Не удалось создать профиль"); } }, [apply, flushPending, profileState.active]);
  const logout = useCallback(async () => { try { await flushPending(); await request("/api/auth/logout", { method: "POST", body: "{}" }); setUsername(""); setProfileState({ profiles: [], active: "shared", settings: {} }); } catch(e) { setError(e instanceof Error ? e.message : "Не удалось выйти"); } }, [flushPending]);
  const importLocal = useCallback(async () => {
    const entries: [string, unknown][] = [];
    const allowed = /^vector\.(theme|accent|chart|favorites|favorite-colors|indicators\.shared|pine\.library|pine\.draft|candles)\.v1$/;
    const drawings = /^vector\.drawings\.v1:[A-Za-z0-9._:/%^-]{1,160}$/;
    for (let i=0;i<localStorage.length;i++) { const key=localStorage.key(i); if (!key || (!allowed.test(key) && !drawings.test(key))) continue; try { entries.push([key, JSON.parse(localStorage.getItem(key) ?? "null")]); } catch {} }
    try { for (const [key, value] of entries) await request(`/api/profiles/${encodeURIComponent(profileState.active)}`, { method: "PATCH", body: JSON.stringify({ key, value }) }); await refresh(); setError(""); }
    catch(e) { setError(e instanceof Error ? e.message : "Не удалось импортировать настройки"); }
  }, [profileState.active, refresh]);
  const context = useMemo<ProfileContextValue>(() => ({ ...profileState, username, error, ready, getValue, setValue, switchProfile, createProfile, logout, importLocal }), [profileState, username, error, ready, getValue, setValue, switchProfile, createProfile, logout, importLocal]);

  if (!ready) return <main className="auth-screen">Подключение профиля…</main>;
  if (!username) return <main className="auth-screen"><form className="auth-card" onSubmit={authenticate}>
    <div className="brand auth-brand">DiVMoney <span className="brand-tag">0.5 ALFA</span></div><h1>{register ? "Создать аккаунт" : "Вход в рабочую область"}</h1>
    <p>Настройки, избранное, индикаторы и разметка синхронизируются с выбранным профилем.</p>
    <label>Имя пользователя<input autoComplete="username" minLength={3} maxLength={32} required value={name} onChange={e=>setName(e.target.value)} /></label>
    <label>Пароль<input type="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 12 : 1} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)} />{register && <small>Не менее 12 символов.</small>}</label>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button className="button" disabled={busy}>{busy ? "Подождите…" : register ? "Зарегистрироваться" : "Войти"}</button>
    <button type="button" className="auth-link" onClick={()=>{setRegister(v=>!v);setError("")}}>{register ? "Уже есть аккаунт? Войти" : "Создать аккаунт"}</button>
  </form></main>;
  return <ProfileContext.Provider value={context}>{children}</ProfileContext.Provider>;
}
