"use client";

import { useEffect, useState } from "react";

// "Shed hours": 10pm–5am local time by default. He can pin it on or off from
// his settings, stored as `catch:night` = "on" | "off" (absent = by the clock).
const OVERRIDE_KEY = "catch:night";

export type NightPref = "auto" | "on" | "off";

export function getNightPref(): NightPref {
  try {
    const o = localStorage.getItem(OVERRIDE_KEY);
    return o === "on" || o === "off" ? o : "auto";
  } catch {
    return "auto";
  }
}

export function setNightPref(pref: NightPref) {
  try {
    if (pref === "auto") localStorage.removeItem(OVERRIDE_KEY);
    else localStorage.setItem(OVERRIDE_KEY, pref);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event("catch:night"));
}

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
