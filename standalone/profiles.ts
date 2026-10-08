import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

type User = { id: number; username: string; active_profile: string };
const dbPath = resolve(process.env.DATABASE_PATH ?? ".data/divmoney.sqlite");
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(dbPath);
try { chmodSync(dirname(dbPath), 0o700); chmodSync(dbPath, 0o600); } catch {}
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, active_profile TEXT NOT NULL DEFAULT 'shared', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS profile_settings(profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, key TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(profile_id,key));
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
INSERT OR IGNORE INTO profiles(id, owner_id, name, created_at) VALUES('shared', NULL, 'Общий профиль', unixepoch());`);

const secureCookie = process.env.SESSION_COOKIE_SECURE === "true" || (process.env.SESSION_COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production");
const cookieName = secureCookie ? "__Host-divmoney_session" : "divmoney_session";
const allowKey = (key: string) => /^vector\.(theme|accent|chart|favorites|favorite-colors|indicators\.shared|pine\.library|pine\.draft|candles)\.v1$/.test(key) || /^vector\.drawings\.v1:[A-Za-z0-9._:/%^-]{1,160}$/.test(key);
const color = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
function validSetting(key: string, value: unknown) {
  if (key === "vector.theme.v1") return ["light", "midnight", "black", "dark", "slate", "olive", "mist", "steel", "emerald", "sand", "monochrome"].includes(String(value));
  if (key === "vector.accent.v1") return color(value);
  if (key === "vector.candles.v1") return Number.isInteger(value) && Number(value) >= 300 && Number(value) <= 4000;
  if (key === "vector.chart.v1") return !!value && typeof value === "object" && ["background", "grid", "up", "down", "text"].every(name => color((value as Record<string, unknown>)[name]));
  if (key === "vector.favorites.v1") return Array.isArray(value) && value.length <= 500 && value.every(x => typeof x === "string" && /^[A-Za-z0-9._:/^%-]{1,48}$/.test(x));
  if (key === "vector.favorite-colors.v1") return !!value && typeof value === "object" && Object.keys(value).length <= 500 && Object.values(value).every(color);
  if (key === "vector.indicators.shared.v1") return Array.isArray(value) && value.length <= 200 && JSON.stringify(value).length <= 1_000_000;
  if (key === "vector.pine.library.v1") return Array.isArray(value) && value.length <= 100 && value.every(script => !!script && typeof script === "object" && typeof script.id === "string" && script.id.length <= 100 && typeof script.name === "string" && script.name.length <= 160 && (script.kind === "indicator" || script.kind === "strategy") && typeof script.source === "string" && script.source.length <= 100_000);
  if (key === "vector.pine.draft.v1") return !!value && typeof value === "object" && typeof (value as any).id === "string" && typeof (value as any).name === "string" && typeof (value as any).source === "string" && (value as any).source.length <= 100_000 && ["indicator", "strategy"].includes((value as any).kind);
  if (key.startsWith("vector.drawings.v1:")) return Array.isArray(value) && value.length <= 200 && JSON.stringify(value).length <= 1_500_000;
  return false;
}
function json(data: unknown, status = 200, headers: HeadersInit = {}) { return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...Object.fromEntries(new Headers(headers)) } }); }
function parseCookie(header: string | null) { return header?.split(";").map(x => x.trim()).find(x => x.startsWith(cookieName + "="))?.slice(cookieName.length + 1); }
function tokenFor(request: Request) { const token = parseCookie(request.headers.get("cookie")); return token ? createHash("sha256").update(token).digest("hex") : ""; }
function userFor(request: Request): User | undefined {
  const token = tokenFor(request); if (!token) return;
  return db.prepare("SELECT u.id,u.username,u.active_profile FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? ").get(token, Date.now()) as User | undefined;
}
function setSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(createHash("sha256").update(token).digest("hex"), userId, Date.now() + 30 * 86400000);
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureCookie ? "; Secure" : ""}`;
}
async function readBody(request: Request) { return await request.json() as Record<string, unknown>; }
export function validProfileOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const expected = process.env.PUBLIC_ORIGIN;
  try { return expected ? new URL(origin).origin === new URL(expected).origin : new URL(origin).host === request.headers.get("host"); }
  catch { return false; }
}
function profileAllowed(user: User, id: string) {
  return id === "shared" || !!db.prepare("SELECT 1 FROM profiles WHERE id=? AND owner_id=?").get(id, user.id);
}
function profilePayload(user: User) {
  const profiles = db.prepare("SELECT id,name FROM profiles WHERE id='shared' OR owner_id=? ORDER BY CASE WHEN id='shared' THEN 0 ELSE 1 END,created_at").all(user.id);
  const active = profileAllowed(user, user.active_profile) ? user.active_profile : "shared";
  const settings = Object.fromEntries(db.prepare("SELECT key,value FROM profile_settings WHERE profile_id=?").all(active).map((r: any) => [r.key, JSON.parse(r.value)]));
  return { profiles, active, settings };
}
const passwordHash = (password: string, salt: Buffer) => scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");

export async function handleProfileApi(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method.toUpperCase();
  if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/profiles")) {
    if (["POST", "PATCH", "DELETE"].includes(method) && !validProfileOrigin(request)) return json({ error: "Недопустимый источник запроса" }, 403);
  }
  try {
    if (pathname === "/api/auth/register" && method === "POST") {
      const body = await readBody(request); const username = String(body.username ?? "").trim(); const password = String(body.password ?? "");
      if (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(username) || password.length < 12 || password.length > 128) return json({ error: "Имя: 3–32 символа. Пароль: от 12 до 128 символов." }, 400);
      const salt = randomBytes(16); const id = Number((db.prepare("INSERT INTO users(username,salt,password_hash,created_at) VALUES(?,?,?,?) RETURNING id").get(username, salt.toString("hex"), passwordHash(password, salt), Date.now()) as { id: number }).id);
      db.prepare("INSERT INTO profiles(id,owner_id,name,created_at) VALUES(?,?,?,?)").run(`user-${id}`, id, "Личный профиль", Date.now());
      return json({ user: { username }, ...profilePayload({ id, username, active_profile: "shared" }) }, 201, { "Set-Cookie": setSession(id) });
    }
    if (pathname === "/api/auth/login" && method === "POST") {
      const body = await readBody(request); const username = String(body.username ?? "").trim(); const password = String(body.password ?? "");
      const row = db.prepare("SELECT id,username,salt,password_hash,active_profile FROM users WHERE username=?").get(username) as (User & { salt: string; password_hash: string }) | undefined;
      const salt = row ? Buffer.from(row.salt, "hex") : Buffer.alloc(16); const candidate = Buffer.from(passwordHash(password.slice(0,128), salt), "hex"); const stored = Buffer.from(row?.password_hash ?? "00".repeat(64), "hex");
      if (!row || candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) return json({ error: "Неверное имя пользователя или пароль" }, 401);
      return json({ user: { username: row.username }, ...profilePayload(row) }, 200, { "Set-Cookie": setSession(row.id) });
    }
    const user = userFor(request);
    if (pathname === "/api/auth/logout" && method === "POST") {
      const token = tokenFor(request); if (token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(token);
      return json({ ok: true }, 200, { "Set-Cookie": `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie ? "; Secure" : ""}` });
    }
    if (pathname === "/api/auth/me" && method === "GET") return user ? json({ user: { username: user.username }, ...profilePayload(user) }) : json({ error: "Требуется вход" }, 401);
    if (!pathname.startsWith("/api/profiles")) return json({ error: "Не найдено" }, 404);
    if (!user) return json({ error: "Требуется вход" }, 401);
    if (pathname === "/api/profiles" && method === "GET") return json(profilePayload(user));
    if (pathname === "/api/profiles" && method === "POST") {
      const body = await readBody(request); const name = String(body.name ?? "Новый профиль").trim().slice(0, 48) || "Новый профиль";
      if (Number((db.prepare("SELECT COUNT(*) AS count FROM profiles WHERE owner_id=?").get(user.id) as { count: number }).count) >= 20) return json({ error: "Достигнут лимит: не более 20 личных профилей" }, 409);
      const id = `profile-${randomBytes(12).toString("hex")}`;
      db.prepare("INSERT INTO profiles(id,owner_id,name,created_at) VALUES(?,?,?,?)").run(id, user.id, name, Date.now());
      const source = String(body.source ?? user.active_profile); if (profileAllowed(user, source)) db.prepare("INSERT INTO profile_settings(profile_id,key,value,updated_at) SELECT ?,key,value,? FROM profile_settings WHERE profile_id=?").run(id, Date.now(), source);
      db.prepare("UPDATE users SET active_profile=? WHERE id=?").run(id, user.id);
      return json(profilePayload({ ...user, active_profile: id }), 201);
    }
    if (pathname === "/api/profiles/active" && method === "POST") {
      const { id } = await readBody(request); if (typeof id !== "string" || !profileAllowed(user, id)) return json({ error: "Профиль недоступен" }, 403);
      db.prepare("UPDATE users SET active_profile=? WHERE id=?").run(id, user.id); return json(profilePayload({ ...user, active_profile: id }));
    }
    const match = pathname.match(/^\/api\/profiles\/([^/]+)$/); if (!match) return json({ error: "Не найдено" }, 404);
    const id = decodeURIComponent(match[1]); if (!profileAllowed(user, id)) return json({ error: "Профиль недоступен" }, 403);
    if (method === "PATCH") {
      const body = await readBody(request);
      if (typeof body.name === "string") {
        if (id === "shared") return json({ error: "Название общего профиля нельзя менять" }, 403);
        db.prepare("UPDATE profiles SET name=? WHERE id=? AND owner_id=?").run(body.name.trim().slice(0,48) || "Мой профиль", id, user.id);
      } else if (typeof body.key === "string" && allowKey(body.key)) {
        if (!validSetting(body.key, body.value)) return json({ error: "Формат настройки не прошёл проверку" }, 400);
        const value = JSON.stringify(body.value); if (value.length > 2_000_000) return json({ error: "Значение слишком большое" }, 413);
        const existing = db.prepare("SELECT length(value) AS size FROM profile_settings WHERE profile_id=? AND key=?").get(id, body.key) as { size: number } | undefined;
        const total = Number((db.prepare("SELECT COALESCE(SUM(length(value)),0) AS size FROM profile_settings WHERE profile_id=?").get(id) as { size: number }).size) - Number(existing?.size ?? 0) + value.length;
        if (total > 32_000_000) return json({ error: "Лимит данных профиля (32 МБ) достигнут" }, 413);
        db.prepare("INSERT INTO profile_settings(profile_id,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(profile_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(id, body.key, value, Date.now());
      } else return json({ error: "Недопустимый ключ настройки" }, 400);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      if (id === "shared") return json({ error: "Общий профиль удалить нельзя" }, 403);
      db.prepare("DELETE FROM profiles WHERE id=? AND owner_id=?").run(id, user.id);
      if (user.active_profile === id) db.prepare("UPDATE users SET active_profile='shared' WHERE id=?").run(user.id);
      return json({ ok: true });
    }
    return json({ error: "Метод не поддерживается" }, 405);
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: users.username")) return json({ error: "Это имя уже занято" }, 409);
    console.error("profile API error", error); return json({ error: "Ошибка серверного хранилища профилей" }, 500);
  }
}

export function requireProfileUser(request: Request) { return !!userFor(request); }
