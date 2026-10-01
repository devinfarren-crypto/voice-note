"use client";

import { useEffect, useState } from "react";

// "Shed hours": 10pm–5am local time. A `catch:night` value of "on" or "off"
// in localStorage overrides the clock (handy for showing it off by daylight).
const OVERRIDE_KEY = "catch:night";

function isNight(): boolean {
  try {
    const o = localStorage.getItem(OVERRIDE_KEY);
    if (o === "on") return true;
    if (o === "off") return false;
  } catch {
    // ignore
  }
  const h = new Date().getHours();
  return h >= 22 || h < 5;
}

export function useNight(): boolean {
  const [night, setNight] = useState(false);
  useEffect(() => {
    // The clock is only known client-side; start false to match SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNight(isNight());
    const id = setInterval(() => setNight(isNight()), 60_000);
    const onStorage = () => setNight(isNight());
    window.addEventListener("storage", onStorage);
    window.addEventListener("catch:night", onStorage);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("catch:night", onStorage);
    };
  }, []);
  return night;
}
