"use client";

// Guitar tuner, opened from the tuning-fork button in the header. Listens
// without recording, works out which string is being played (or sticks to one
// he taps), and shows a smoothed needle. Built for someone who lives in
// alternate tunings: two dozen presets, a capo, and his own tunings saved on
// the phone.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectStringPitch } from "../lib/pitch";
import {
  loadCustom,
  loadLast,
  midiToHz,
  noteName,
  PRESETS,
  saveCustom,
  saveLast,
  spell,
  type Tuning,
} from "../lib/tunings";

const IN_TUNE_CENTS = 3;
const HOLD_MS = 700;
const TUNED_AFTER_MS = 350;

interface Reading {
  idx: number;
  cents: number;
  freq: number;
  heard: number; // nearest MIDI note actually heard
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export default function Tuner({ ctx, onClose }: { ctx: AudioContext; onClose: () => void }) {
  const [custom, setCustom] = useState<Tuning[]>([]);
  const [tuning, setTuning] = useState<Tuning>(PRESETS[0]);
  const [capo, setCapo] = useState(0);
  const [locked, setLocked] = useState<number | null>(null);
  const [tuned, setTuned] = useState<boolean[]>([]);
  const [reading, setReading] = useState<Reading | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");

  // Restore his tunings and where he left off.
  useEffect(() => {
    const mine = loadCustom();
    const last = loadLast();
    const all = [...mine, ...PRESETS];
    // Browser storage is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustom(mine);
    const found = last && all.find((x) => x.id === last.id);
    if (found) setTuning(found);
    if (last) setCapo(Math.min(9, Math.max(0, last.capo)));
  }, []);

  const targets = useMemo(() => tuning.strings.map((m) => m + capo), [tuning, capo]);

  // Anything the detection loop needs, without restarting the mic.
  const live = useRef({ targets, locked });
  useEffect(() => {
    live.current = { targets, locked };
  }, [targets, locked]);

  const resetProgress = useCallback(() => {
    setTuned([]);
    setLocked(null);
  }, []);

  const pick = (t: Tuning) => {
    setTuning(t);
    setListOpen(false);
    setEditing(false);
    resetProgress();
    saveLast(t.id, capo);
  };

  const changeCapo = (d: number) => {
    const next = Math.min(9, Math.max(0, capo + d));
    setCapo(next);
    resetProgress();
    saveLast(tuning.id, next);
  };

  // ----- Listening -----
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    const history: number[] = [];
    let lastIdx = -1;
    let shown = 0;
    let lastHeardAt = 0;
    let inTuneSince = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch {
        setError("Microphone access was blocked. Allow it in Settings to tune.");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      void ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const raw = new Float32Array(analyser.fftSize);
      const half = new Float32Array(analyser.fftSize / 2);
      const rate = ctx.sampleRate / 2;
      let frame = 0;

      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        // ~30 checks a second is plenty and keeps the phone cool.
        if (frame++ % 2) return;
        analyser.getFloatTimeDomainData(raw);
        for (let i = 0; i < half.length; i++) half[i] = (raw[2 * i] + raw[2 * i + 1]) * 0.5;
        const hit = detectStringPitch(half, rate);

        if (!hit) {
          if (lastHeardAt && now - lastHeardAt > HOLD_MS) {
            lastHeardAt = 0;
            history.length = 0;
            inTuneSince = 0;
            setReading(null);
          }
          return;
        }

        const { targets, locked } = live.current;
        let f = hit.freq;
        let idx: number;
        if (locked !== null) {
          idx = locked;
          // A locked string may be heard an octave off through a strong
          // harmonic — fold it back toward the string's pitch.
          const target = midiToHz(targets[idx]);
          while (f > target * 1.45) f /= 2;
          while (f < target / 1.45) f *= 2;
        } else {
          idx = 0;
          let best = Infinity;
          targets.forEach((m, i) => {
            const d = Math.abs(1200 * Math.log2(f / midiToHz(m)));
            if (d < best) {
              best = d;
              idx = i;
            }
          });
        }

        if (idx !== lastIdx) {
          history.length = 0;
          lastIdx = idx;
          inTuneSince = 0;
        }
        history.push(f);
        if (history.length > 5) history.shift();
        const smoothF = median(history);
        const cents = 1200 * Math.log2(smoothF / midiToHz(targets[idx]));
        // Ease the needle instead of letting it twitch.
        shown = history.length === 1 ? cents : shown + (cents - shown) * 0.35;
        lastHeardAt = now;

        if (Math.abs(shown) <= IN_TUNE_CENTS) {
          if (!inTuneSince) inTuneSince = now;
          if (now - inTuneSince > TUNED_AFTER_MS) {
            setTuned((prev) => {
              if (prev[idx]) return prev;
              const next = [...prev];
              next[idx] = true;
              return next;
            });
          }
        } else {
          inTuneSince = 0;
        }

        setReading({
          idx,
          cents: shown,
          freq: smoothF,
          heard: Math.round(69 + 12 * Math.log2(smoothF / 440)),
        });
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => {});
    };
  }, [ctx]);

  // ----- Editing his own tunings -----
  const nudge = (i: number, d: number) => {
    const strings = [...tuning.strings];
    strings[i] = Math.min(76, Math.max(28, strings[i] + d));
    setTuning({ id: "draft", name: "Custom", group: "Yours", strings, flats: tuning.flats, custom: true });
    resetProgress();
  };

  const saveDraft = () => {
    const name = draftName.trim() || spell(tuning.strings, tuning.flats).replace(/ /g, "");
    const saved: Tuning = { ...tuning, id: `custom-${Date.now().toString(36)}`, name, group: "Yours", custom: true };
    const list = [saved, ...custom];
    setCustom(list);
    saveCustom(list);
    setTuning(saved);
    setEditing(false);
    setDraftName("");
    saveLast(saved.id, capo);
  };

  const removeCustom = (id: string) => {
    const list = custom.filter((x) => x.id !== id);
    setCustom(list);
    saveCustom(list);
    if (tuning.id === id) pick(PRESETS[0]);
  };

  const groups = useMemo(() => {
    const out: { name: string; items: Tuning[] }[] = [];
    if (custom.length) out.push({ name: "Yours", items: custom });
    for (const p of PRESETS) {
      const g = out.find((x) => x.name === p.group);
      if (g) g.items.push(p);
      else out.push({ name: p.group, items: [p] });
    }
    return out;
  }, [custom]);

  // ----- Display -----
  const active = reading?.idx ?? locked;
  const target = active !== null && active !== undefined ? noteName(targets[active], tuning.flats) : null;
  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const inTune = !!reading && Math.abs(reading.cents) <= IN_TUNE_CENTS;
  const verdict = !reading
    ? locked !== null
      ? "Play that string"
      : "Play a string"
    : inTune
      ? "In tune"
      : reading.cents < 0
        ? "Tune up"
        : "Tune down";
  const heard = reading ? noteName(reading.heard, tuning.flats) : null;
  const allTuned = tuned.filter(Boolean).length === targets.length;

  return (
    <div className="tuner-sheet" role="dialog" aria-modal="true" aria-label="Guitar tuner">
      <div className="column">
        <header className="tuner-head">
          <h2>Tuner</h2>
          <button type="button" className="chip-btn" onClick={onClose}>
            Done
          </button>
        </header>

        <button
          type="button"
          className="tuning-pick"
          aria-expanded={listOpen}
          onClick={() => {
            setListOpen(!listOpen);
            setEditing(false);
          }}
        >
          <span className="tp-name">{tuning.name}</span>
          <span className="tp-notes">
            {spell(tuning.strings, tuning.flats)}
            {capo ? ` · capo ${capo}` : ""}
          </span>
          <span className="tp-caret" aria-hidden="true">
            {listOpen ? "▴" : "▾"}
          </span>
        </button>

        {listOpen ? (
          <div className="tuning-list">
            {groups.map((g) => (
              <section key={g.name}>
                <h3>{g.name}</h3>
                <ul>
                  {g.items.map((x) => (
                    <li key={x.id}>
                      <button
                        type="button"
                        className="tl-row"
                        aria-current={x.id === tuning.id}
                        onClick={() => pick(x)}
                      >
                        <span className="tl-name">{x.name}</span>
                        <span className="tl-notes">{spell(x.strings, x.flats)}</span>
                      </button>
                      {x.custom && (
                        <button
                          type="button"
                          className="tl-remove"
                          aria-label={`Remove ${x.name}`}
                          onClick={() => removeCustom(x.id)}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <>
            <section className={`dial${inTune ? " in" : ""}${reading ? "" : " idle"}`} aria-live="polite">
              <svg viewBox="0 0 300 168" aria-hidden="true">
                <path className="dial-arc" d="M 43.9 61.9 A 150 150 0 0 1 256.1 61.9" />
                <path className="dial-zone" d="M 142.9 18.2 A 150 150 0 0 1 157.1 18.2" />
                {Array.from({ length: 21 }, (_, i) => {
                  const c = -50 + i * 5;
                  const a = ((c * 0.9) * Math.PI) / 180;
                  const r1 = 150;
                  const r2 = c % 25 === 0 ? 132 : c % 10 === 0 ? 138 : 143;
                  return (
                    <line
                      key={c}
                      className={c === 0 ? "tick zero" : "tick"}
                      x1={150 + r1 * Math.sin(a)}
                      y1={168 - r1 * Math.cos(a)}
                      x2={150 + r2 * Math.sin(a)}
                      y2={168 - r2 * Math.cos(a)}
                    />
                  );
                })}
                <text className="dial-label" x="42" y="150">♭</text>
                <text className="dial-label" x="250" y="150">♯</text>
                <g className="needle" style={{ transform: `rotate(${cents * 0.9}deg)` }}>
                  <line x1="150" y1="168" x2="150" y2="30" />
                  <circle cx="150" cy="168" r="7" />
                </g>
              </svg>
              <div className="dial-note">
                {target ? (
                  <>
                    {target.name}
                    <sub>{target.octave}</sub>
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div className="dial-verdict">{verdict}</div>
              <div className="dial-meta">
                {reading && heard
                  ? `hearing ${heard.name}${heard.octave} · ${reading.freq.toFixed(1)} Hz · ${reading.cents > 0 ? "+" : ""}${Math.round(reading.cents)}¢`
                  : allTuned
                    ? "All strings in tune. Go write something."
                    : locked !== null
                      ? "Tap the string again to go back to auto"
                      : "Tap a string to stick to it"}
              </div>
            </section>

            <div className="strings" role="group" aria-label="Strings, low to high">
              {targets.map((m, i) => {
                const n = noteName(m, tuning.flats);
                return (
                  <div key={i} className="string-col">
                    {editing && (
                      <button type="button" className="nudge" aria-label={`Raise string ${6 - i}`} onClick={() => nudge(i, 1)}>
                        ▲
                      </button>
                    )}
                    <button
                      type="button"
                      className={`string-pill${active === i ? " active" : ""}${locked === i ? " locked" : ""}${tuned[i] ? " tuned" : ""}`}
                      aria-pressed={locked === i}
                      aria-label={`String ${6 - i}, ${n.name}${n.octave}${tuned[i] ? ", in tune" : ""}`}
                      onClick={() => setLocked(locked === i ? null : i)}
                    >
                      {n.name}
                      {tuned[i] && <span className="check" aria-hidden="true">✓</span>}
                    </button>
                    {editing && (
                      <button type="button" className="nudge" aria-label={`Lower string ${6 - i}`} onClick={() => nudge(i, -1)}>
                        ▼
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {editing ? (
              <div className="tuner-edit">
                <input
                  className="field"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder={`Name it (${spell(tuning.strings, tuning.flats).replace(/ /g, "")})`}
                  aria-label="Tuning name"
                  maxLength={40}
                />
                <div className="actions spread">
                  <button type="button" className="chip-btn ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                  <button type="button" className="chip-btn primary" onClick={saveDraft}>
                    Save tuning
                  </button>
                </div>
              </div>
            ) : (
              <div className="tuner-tools">
                <div className="capo" role="group" aria-label="Capo">
                  <button type="button" className="chip-btn" onClick={() => changeCapo(-1)} disabled={!capo} aria-label="Capo down">
                    −
                  </button>
                  <span>{capo ? `Capo ${capo}` : "No capo"}</span>
                  <button type="button" className="chip-btn" onClick={() => changeCapo(1)} disabled={capo >= 9} aria-label="Capo up">
                    +
                  </button>
                </div>
                <button type="button" className="chip-btn" onClick={() => setEditing(true)}>
                  Make my own
                </button>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="notice error" role="status">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
