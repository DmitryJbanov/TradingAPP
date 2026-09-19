"use client";
import { useState, useEffect } from "react";
import { Clock3 } from "lucide-react";
const sessions = [
  {
    name: "Азия",
    city: "Токио",
    tz: "Asia/Tokyo",
    start: 9,
    end: 18,
    color: "#8e90fc",
  },
  {
    name: "Лондон",
    city: "Лондон",
    tz: "Europe/London",
    start: 8,
    end: 17,
    color: "#43b7d6",
  },
  {
    name: "Нью-Йорк",
    city: "Нью-Йорк",
    tz: "America/New_York",
    start: 8,
    end: 17,
    color: "#d6aa65",
  },
];
export function sessionInfo(
  date: Date,
  tz: string,
  start: number,
  end: number,
) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const local = Number(get("hour")) + Number(get("minute")) / 60;
  const utc = date.getUTCHours() + date.getUTCMinutes() / 60;
  const offset = local - utc;
  const begin = (((start - offset) % 24) + 24) % 24;
  const weekend = ["Sat", "Sun"].includes(get("weekday"));
  return {
    begin,
    duration: end - start,
    active: !weekend && local >= start && local < end,
  };
}
export function Sessions() {
  const [now, setNow] = useState<Date>();
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pos = now
    ? ((now.getUTCHours() +
        now.getUTCMinutes() / 60 +
        now.getUTCSeconds() / 3600) /
        24) *
      100
    : 0;
  return (
    <section className="session-panel panel">
      <div className="section-heading">
        <h2>
          <Clock3 size={16} /> Торговые сессии
        </h2>
        <span className="mono clock">
          {now?.toISOString().slice(11, 19) ?? "--:--:--"}
          <small> UTC</small>
        </span>
      </div>
      <div className="session-chart">
        <div className="session-labels">
          {sessions.map((s) => (
            <div key={s.name}>
              {s.name}
              <span
                className={
                  now && sessionInfo(now, s.tz, s.start, s.end).active
                    ? "positive"
                    : "muted"
                }
              >
                {now && sessionInfo(now, s.tz, s.start, s.end).active
                  ? "Открыта"
                  : "Закрыта"}
              </span>
            </div>
          ))}
        </div>
        <div className="session-tracks">
          <div className="time-ticks">
            {[0, 4, 8, 12, 16, 20, 24].map((h) => (
              <span key={h}>{String(h).padStart(2, "0")}:00</span>
            ))}
          </div>
          {sessions.map((s) => {
            const info = now
              ? sessionInfo(now, s.tz, s.start, s.end)
              : { begin: 0, duration: 9, active: false };
            return (
              <div className="session-track" key={s.name}>
                {now && (
                  <>
                    <div
                      className="session-bar"
                      style={{
                        left: (info.begin / 24) * 100 + "%",
                        width:
                          (Math.min(info.duration, 24 - info.begin) / 24) *
                            100 +
                          "%",
                        background: s.color,
                        opacity: info.active ? 0.65 : 0.25,
                      }}
                    />
                    {info.begin + info.duration > 24 && (
                      <div
                        className="session-bar"
                        style={{
                          left: 0,
                          width:
                            ((info.begin + info.duration - 24) / 24) * 100 +
                            "%",
                          background: s.color,
                          opacity: 0.3,
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
          {now && (
            <div className="now-marker" style={{ left: pos + "%" }}>
              <i />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
