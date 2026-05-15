import { useEffect, useState } from "react";

const KEY_DATES = "hebcal:show-dates";
const KEY_HOLIDAYS = "hebcal:show-holidays";

function read(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "1";
}

export function useHebrewSettings() {
  const [showDates, setShowDates] = useState(true);
  const [showHolidays, setShowHolidays] = useState(true);

  useEffect(() => {
    setShowDates(read(KEY_DATES, true));
    setShowHolidays(read(KEY_HOLIDAYS, true));
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_DATES) setShowDates(read(KEY_DATES, true));
      if (e.key === KEY_HOLIDAYS) setShowHolidays(read(KEY_HOLIDAYS, true));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = (key: string, value: boolean) => {
    window.localStorage.setItem(key, value ? "1" : "0");
    window.dispatchEvent(new StorageEvent("storage", { key }));
  };

  return {
    showDates,
    showHolidays,
    setShowDates: (v: boolean) => {
      setShowDates(v);
      update(KEY_DATES, v);
    },
    setShowHolidays: (v: boolean) => {
      setShowHolidays(v);
      update(KEY_HOLIDAYS, v);
    },
  };
}
