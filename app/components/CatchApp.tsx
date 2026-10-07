"use client";

// Catch — a pocket notebook for a songwriter. Two ways in: Lyrics (dictate
// onto a lyric sheet) and Melody (record audio with a live note readout).
// Everything saved lands in Takes, stored on the device, and any take can be
// emailed or sent through the share sheet. Extras: a guitar tuner, truck mode
// (one giant record button that starts on launch), and shed hours after 10pm.

import { useCallback, useEffect, useState } from "react";
import { deleteTake, listTakes, type Take, type TakeKind } from "../lib/db";
import BirthdayCard from "./BirthdayCard";
import Library from "./Library";
import LyricsCapture from "./LyricsCapture";
import MelodyCapture from "./MelodyCapture";
import RecipientProvider from "./RecipientProvider";
import Tuner from "./Tuner";
import TruckMode from "./TruckMode";
import { useNight } from "../lib/useNight";
import { ForkIcon, MicIcon, NoteIcon, QuillIcon, StackIcon, TruckIcon } from "./icons";

type Tab = "capture" | "takes";
const MODE_KEY = "catch:mode";
const TRUCK_KEY = "catch:truck";

export default function CatchApp() {
  const [mode, setMode] = useState<TakeKind>("lyrics");
  const [tab, setTab] = useState<Tab>("capture");
  const [busy, setBusy] = useState(false);
  const [takes, setTakes] = useState<Take[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCard, setShowCard] = useState(false);
  // The tuner's AudioContext is created inside the tap so iOS lets it run.
  const [tunerCtx, setTunerCtx] = useState<AudioContext | null>(null);
  // Truck mode sticks across launches until he leaves it.
  const [truck, setTruck] = useState(false);
  const night = useNight();

  const setTruckMode = (on: boolean) => {
    setTruck(on);
    try {
      if (on) localStorage.setItem(TRUCK_KEY, "1");
      else localStorage.removeItem(TRUCK_KEY);
    } catch {
      // ignore
    }
  };

  const openTuner = () => {
    if (busy) return;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    void ctx.resume();
    setTunerCtx(ctx);
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      // Restoring the last-used mode can only happen client-side.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "melody" || saved === "lyrics") setMode(saved);
      if (localStorage.getItem(TRUCK_KEY)) setTruck(true);
    } catch {
      // ignore
    }
    listTakes()
      .then(setTakes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const chooseMode = (m: TakeKind) => {
    if (busy) return;
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // ignore
    }
  };

  const upsert = useCallback((take: Take) => {
    setTakes((prev) => [take, ...prev.filter((t) => t.id !== take.id)].sort((a, b) => b.createdAt - a.createdAt));
  }, []);

  const remove = useCallback((id: string) => {
    setTakes((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const removeAndDelete = useCallback(
    (id: string) => {
      remove(id);
      void deleteTake(id).catch(() => {});
    },
    [remove]
  );

  return (
    <RecipientProvider>
      <main className="app" data-mode={mode} data-night={night || undefined}>
        {night && (
          <div className="bulb" aria-hidden="true">
            <span />
          </div>
        )}
        <div className="column">
          <header className="brand">
            <div className="wordmark">
              <h1>Catch</h1>
              <span>{night ? "shed hours" : "lyrics & melodies"}</span>
            </div>
            <div className="brand-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setTruckMode(true)}
                disabled={busy}
                aria-label="Truck mode"
              >
                <TruckIcon />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={openTuner}
                disabled={busy}
                aria-label="Open guitar tuner"
              >
                <ForkIcon />
              </button>
              <button
                type="button"
                className="avatar-btn"
                onClick={() => setShowCard(true)}
                aria-label="Open birthday card"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="justin-sketch.jpg" alt="" />
              </button>
            </div>
          </header>

          {tab === "capture" ? (
            <>
              <div className="mode-switch" role="radiogroup" aria-label="What are you catching?">
                <span className="pill" aria-hidden="true" />
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === "lyrics"}
                  disabled={busy && mode !== "lyrics"}
                  onClick={() => chooseMode("lyrics")}
                >
                  <QuillIcon /> Lyrics
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === "melody"}
                  disabled={busy && mode !== "melody"}
                  onClick={() => chooseMode("melody")}
                >
                  <NoteIcon /> Melody
                </button>
              </div>

              {mode === "lyrics" ? (
                <LyricsCapture key="lyrics" onSaved={upsert} onBusyChange={setBusy} />
              ) : (
                <MelodyCapture key="melody" onSaved={upsert} onDeleted={remove} onBusyChange={setBusy} />
              )}
            </>
          ) : (
            <Library takes={takes} loading={loading} onDelete={removeAndDelete} />
          )}
        </div>

        <nav className="tabbar" role="tablist" aria-label="Sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "capture"}
            disabled={busy}
            onClick={() => setTab("capture")}
          >
            <MicIcon size={18} /> Catch
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "takes"}
            disabled={busy}
            onClick={() => setTab("takes")}
          >
            <StackIcon /> Takes
            {takes.length > 0 && <span className="count">{takes.length}</span>}
          </button>
        </nav>

        {truck && <TruckMode onSaved={upsert} onExit={() => setTruckMode(false)} />}

        {tunerCtx && <Tuner ctx={tunerCtx} onClose={() => setTunerCtx(null)} />}

        <BirthdayCard forceOpen={showCard} onClose={() => setShowCard(false)} />
      </main>
    </RecipientProvider>
  );
}
