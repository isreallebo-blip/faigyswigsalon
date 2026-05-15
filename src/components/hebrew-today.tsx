import { useEffect, useState } from "react";
import { HDate, HebrewCalendar, months, flags } from "@hebcal/core";

// Approximate sunset hour for the user's local date (no geolocation).
// Varies seasonally between ~17:00 (winter) and ~20:00 (summer) in the
// northern hemisphere — close enough for "after nightfall" rollover.
function approxSunsetHour(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((d.getTime() - start.getTime()) / 86400000);
  return 18.5 + 1.5 * Math.sin(((dayOfYear - 80) * 2 * Math.PI) / 365);
}

function effectiveHebrewDate(now: Date): Date {
  const sunset = approxSunsetHour(now);
  const hours = now.getHours() + now.getMinutes() / 60;
  if (hours >= sunset) {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    return next;
  }
  return now;
}

const HEB_MONTHS: Record<number, string> = {
  [months.NISAN]: "ניסן",
  [months.IYYAR]: "אייר",
  [months.SIVAN]: "סיון",
  [months.TAMUZ]: "תמוז",
  [months.AV]: "אב",
  [months.ELUL]: "אלול",
  [months.TISHREI]: "תשרי",
  [months.CHESHVAN]: "חשון",
  [months.KISLEV]: "כסלו",
  [months.TEVET]: "טבת",
  [months.SHVAT]: "שבט",
  [months.ADAR_I]: "אדר א׳",
  [months.ADAR_II]: "אדר ב׳",
};

function getTodayInfo(now: Date) {
  const eff = effectiveHebrewDate(now);
  const hd = new HDate(eff);
  const hebrew = hd.renderGematriya(true);

  const events = HebrewCalendar.calendar({
    start: eff,
    end: eff,
    isHebrewYear: false,
    noMinorFast: true,
    noModern: true,
    noRoshChodesh: false,
    sedrot: false,
    candlelighting: false,
    locale: "he",
  });

  let holiday: string | null = null;
  let roshChodesh: string | null = null;
  for (const ev of events) {
    const desc = ev.getDesc();
    if (desc.startsWith("Erev ") || ev.getFlags() & flags.EREV) continue;
    if (desc.startsWith("Rosh Chodesh")) {
      const monthName = HEB_MONTHS[hd.getMonth()] ?? "";
      roshChodesh = `ראש חודש ${monthName}`;
    } else if (!holiday) {
      holiday = ev.render("he");
    }
  }

  return { hebrew, holiday, roshChodesh };
}

export function HebrewToday() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const next = new Date();
    next.setHours(24, 0, 5, 0);
    const t = setTimeout(function loop() {
      tick();
      const n = new Date();
      n.setHours(24, 0, 5, 0);
      setTimeout(loop, n.getTime() - Date.now());
    }, next.getTime() - Date.now());
    return () => clearTimeout(t);
  }, []);

  const { hebrew, holiday, roshChodesh } = getTodayInfo(now);

  return (
    <p
      dir="rtl"
      className="mt-1 text-xs uppercase tracking-[0.22em] text-muted-foreground"
      style={{ fontFeatureSettings: "normal" }}
    >
      <span>{hebrew}</span>
      {roshChodesh && <span className="block normal-case tracking-normal text-primary">{roshChodesh}</span>}
      {holiday && <span className="block normal-case tracking-normal text-primary">{holiday}</span>}
    </p>
  );
}
