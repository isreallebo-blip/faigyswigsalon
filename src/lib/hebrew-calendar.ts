import { HDate, HebrewCalendar, Event, flags } from "@hebcal/core";

const MAJOR_HOLIDAYS = [
  "Rosh Hashana",
  "Yom Kippur",
  "Sukkot",
  "Shmini Atzeret",
  "Simchat Torah",
  "Chanukah",
  "Tu BiShvat",
  "Purim",
  "Pesach",
  "Lag BaOmer",
  "Shavuot",
  "Tish'a B'Av",
  "Rosh Chodesh",
];

export function hebrewDateString(date: Date): string {
  const hd = new HDate(date);
  return hd.renderGematriya(true);
}

export type HebHoliday = { date: Date; title: string; isMajor: boolean };

const cache = new Map<string, HebHoliday[]>();

export function getHolidaysInRange(from: Date, to: Date): HebHoliday[] {
  const key = `${from.toDateString()}|${to.toDateString()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const events: Event[] = HebrewCalendar.calendar({
    start: from,
    end: to,
    isHebrewYear: false,
    noMinorFast: true,
    noModern: true,
    noRoshChodesh: false,
    noSpecialShabbat: true,
    sedrot: false,
    candlelighting: false,
    locale: "he",
  });

  const out: HebHoliday[] = [];
  for (const ev of events) {
    const desc = ev.getDesc();
    const isMajor = MAJOR_HOLIDAYS.some((h) => desc.startsWith(h));
    if (!isMajor) continue;
    // Skip "Erev" prefixed events.
    if (desc.startsWith("Erev ")) continue;
    if (ev.getFlags() & flags.EREV) continue;
    out.push({
      date: ev.getDate().greg(),
      title: ev.render("he"),
      isMajor: true,
    });
  }
  cache.set(key, out);
  return out;
}

export function holidaysForDay(day: Date, all: HebHoliday[]): HebHoliday[] {
  return all.filter(
    (h) =>
      h.date.getFullYear() === day.getFullYear() &&
      h.date.getMonth() === day.getMonth() &&
      h.date.getDate() === day.getDate(),
  );
}

export function isShabbatColumn(day: Date): boolean {
  const d = day.getDay();
  return d === 5 || d === 6; // Friday or Saturday
}
