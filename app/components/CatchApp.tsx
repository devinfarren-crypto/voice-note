"use client";

// Catch — a pocket notebook for a songwriter. Two ways in: Lyrics (dictate
// onto a lyric sheet) and Melody (record audio with a live note readout).
// Everything saved lands in Takes, stored on the device, and any take can be
// emailed or sent through the share sheet.

import { useCallback, useEffect, useState } from "react";
import { deleteTake, listTakes, type Take, type TakeKind } from "../lib/db";
import BirthdayCard from "./BirthdayCard";
import Library from "./Library";
import LyricsCapture from "./LyricsCapture";
import MelodyCapture from "./MelodyCapture";
import { GiftIcon, MicIcon, NoteIcon, QuillIcon, StackIcon } from "./icons";

type Tab = "capture" | "takes";
const MODE_KEY = "catch:mode";

export default function CatchApp() {
  const [mode, setMode] = useState<TakeKind>("lyrics");
  const [tab, setTab] = useState<Tab>("capture");
  const [busy, setBusy] = useState(false);
  const [takes, setTakes] = useState<Take[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      // Restoring the last-used mode can only happen client-side.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "melody" || saved === "lyrics") setMode(saved);
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
    <main className="app" data-mode={mode}>
      <div className="column">
        <header className="brand">
          <div className="wordmark">
            <h1>
              Catch<em>.</em>
            </h1>
            <span>lyrics &amp; melodies</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setShowCard(true)}
            aria-label="Open birthday card"
          >
            <GiftIcon />
          </button>
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

      <BirthdayCard forceOpen={showCard} onClose={() => setShowCard(false)} />
    </main>
  );
}
