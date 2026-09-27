"use client";

// Melody mode: records raw audio (no processing — it's music, not a phone
// call), draws a live waveform, and shows the note being sung/hummed/played
// like a tuner. Every take is saved the moment recording stops so an idea can
// never be lost; naming it and jotting chords is optional afterwards.

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteTake, newId, saveTake, type Take } from "../lib/db";
import { formatDuration, pickAudioMime } from "../lib/format";
import { detectPitch, frequencyToNote, type NoteReading } from "../lib/pitch";
import AudioPlayer from "./AudioPlayer";
import RecordButton from "./RecordButton";
import TakeActions from "./TakeActions";

type Phase = "idle" | "recording" | "review";

const PEAK_BARS = 42;
// Keep showing the last note briefly through breaths and consonants.
const NOTE_HOLD_MS = 450;

function downsample(levels: number[], n: number): number[] {
  if (!levels.length) return [];
  const step = levels.length / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const slice = levels.slice(Math.floor(i * step), Math.max(Math.floor((i + 1) * step), Math.floor(i * step) + 1));
    out.push(slice.reduce((a, b) => Math.max(a, b), 0));
  }
  const max = Math.max(...out, 0.0001);
  return out.map((v) => v / max);
}

export default function MelodyCapture({
  onSaved,
  onDeleted,
  onBusyChange,
}: {
  onSaved: (take: Take) => void;
  onDeleted: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<NoteReading | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const [title, setTitle] = useState("");
  const [jot, setJot] = useState("");
  const [error, setError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef(0);
  const levelsRef = useRef<number[]>([]);
  const noteCountsRef = useRef(new Map<string, number>());
  const lastNoteAtRef = useRef(0);

  useEffect(() => onBusyChange(phase === "recording"), [phase, onBusyChange]);

  // ----- Waveform drawing -----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const accent = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#7fa2d8";
    const barW = 3;
    const gap = 2;
    const count = Math.floor(w / (barW + gap));
    const levels = levelsRef.current.slice(-count);
    const offset = count - levels.length;

    for (let i = 0; i < count; i++) {
      const lvl = i >= offset ? levels[i - offset] : 0;
      // sqrt scaling keeps quiet humming visible without loud strums clipping.
      const amp = Math.min(1, Math.sqrt(lvl) * 2.4);
      const bh = Math.max(2, amp * (h - 8));
      const x = i * (barW + gap);
      // Older bars fade out toward the left, like tape rolling off the head.
      const age = i / count;
      g.globalAlpha = i >= offset ? 0.25 + age * 0.75 : 0.15;
      g.fillStyle = i >= offset ? accent : "rgba(243,233,216,0.5)";
      g.beginPath();
      g.roundRect(x, (h - bh) / 2, barW, bh, 1.5);
      g.fill();
    }
    g.globalAlpha = 1;
  }, []);

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw, phase]);

  // ----- Recording -----
  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(
    () => () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      teardown();
    },
    [teardown]
  );

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record audio. On iPhone, open Catch in Safari.");
      return;
    }
    // Create the AudioContext inside the tap so iOS lets it run.
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch {
      void ctx.close();
      setError("Microphone access was blocked. Allow it in Settings to record.");
      return;
    }
    void ctx.resume();
    ctxRef.current = ctx;
    streamRef.current = stream;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);

    const mime = pickAudioMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const startedAt = performance.now();
    recorder.onstop = async () => {
      const durationMs = performance.now() - startedAt;
      teardown();
      const blob = new Blob(chunks, { type: recorder.mimeType || mime || "audio/mp4" });
      let keyHint: string | undefined;
      let best = 0;
      noteCountsRef.current.forEach((n, k) => {
        if (n > best) {
          best = n;
          keyHint = k;
        }
      });
      const fresh: Take = {
        id: newId(),
        kind: "melody",
        title: "",
        text: "",
        createdAt: Date.now(),
        audio: blob,
        durationMs,
        keyHint,
        peaks: downsample(levelsRef.current, PEAK_BARS),
      };
      setNote(null);
      setTake(fresh);
      setTitle("");
      setJot("");
      setPhase("review");
      try {
        await saveTake(fresh);
        onSaved(fresh);
      } catch {
        setError("Couldn't save on this device — share it before leaving.");
      }
    };
    recorderRef.current = recorder;

    levelsRef.current = [];
    noteCountsRef.current = new Map();
    lastNoteAtRef.current = 0;
    setElapsed(0);
    setNote(null);
    setTake(null);
    setPhase("recording");
    recorder.start(250);

    const buf = new Float32Array(analyser.fftSize);
    let lastTick = 0;
    let lastKey = "";
    const loop = (t: number) => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      levelsRef.current.push(Math.sqrt(sum / buf.length));

      const freq = detectPitch(buf, ctx.sampleRate);
      if (freq) {
        const reading = frequencyToNote(freq);
        const key = `${reading.name}${reading.octave}`;
        noteCountsRef.current.set(key, (noteCountsRef.current.get(key) ?? 0) + 1);
        lastNoteAtRef.current = t;
        // Only re-render when the reading visibly changes.
        const shown = `${key}:${Math.round(reading.cents / 4)}`;
        if (shown !== lastKey) {
          lastKey = shown;
          setNote(reading);
        }
      } else if (lastKey && t - lastNoteAtRef.current > NOTE_HOLD_MS) {
        lastKey = "";
        setNote(null);
      }

      if (t - lastTick > 200) {
        lastTick = t;
        setElapsed(performance.now() - startedAt);
      }
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const stop = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  // Autosave the name and jotted notes as they're typed.
  useEffect(() => {
    if (!take || (take.title === title.trim() && take.text === jot.trim())) return;
    const id = setTimeout(() => {
      const updated = { ...take, title: title.trim(), text: jot.trim() };
      setTake(updated);
      saveTake(updated).then(() => onSaved(updated), () => {});
    }, 400);
    return () => clearTimeout(id);
  }, [take, title, jot, onSaved]);

  const discard = async () => {
    if (!take) return;
    await deleteTake(take.id).catch(() => {});
    onDeleted(take.id);
    setTake(null);
    setPhase("idle");
    levelsRef.current = [];
  };

  const done = () => {
    setTake(null);
    setPhase("idle");
    levelsRef.current = [];
  };

  const recording = phase === "recording";
  const liveTake = take ? { ...take, title: title.trim(), text: jot.trim() } : null;

  return (
    <>
      <section className="deck" aria-label="Melody recorder">
        <div className="deck-top">
          {recording ? (
            <span className="live">
              Rec <span className="timer">{formatDuration(elapsed)}</span>
            </span>
          ) : phase === "review" && take ? (
            <span>
              Take saved · {formatDuration(take.durationMs ?? 0)}
              {take.keyHint ? ` · around ${take.keyHint}` : ""}
            </span>
          ) : (
            <span>Ready</span>
          )}
          {phase !== "review" && <span>Melody</span>}
        </div>

        {phase === "review" && take && liveTake ? (
          <div className="review">
            <AudioPlayer blob={take.audio!} durationMs={take.durationMs} peaks={take.peaks} />
            <input
              className="field title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name this melody"
              aria-label="Melody name"
              maxLength={80}
            />
            <textarea
              className="field"
              value={jot}
              onChange={(e) => setJot(e.target.value)}
              placeholder="Chords, capo, tuning, where it goes…"
              aria-label="Notes"
              rows={2}
            />
            <TakeActions take={liveTake} onDelete={discard} deleteLabel="Discard" />
          </div>
        ) : (
          <>
            <div className="note-readout" aria-live="polite">
              <div className={`note-name${note ? "" : " idle"}`}>
                {note ? (
                  <>
                    {note.name}
                    <sub>{note.octave}</sub>
                  </>
                ) : (
                  "—"
                )}
              </div>
              {recording ? (
                <div className="tuner" aria-hidden="true">
                  <i
                    style={{
                      left: `${50 + (note?.cents ?? 0)}%`,
                      opacity: note ? 1 : 0,
                    }}
                  />
                </div>
              ) : (
                <p className="deck-hint">
                  Hum it, whistle it, play it.
                  <br />
                  Catch follows the notes as you go.
                </p>
              )}
            </div>
            <canvas ref={canvasRef} className="wave" aria-hidden="true" />
          </>
        )}
      </section>

      <div className="transport">
        <div className="side">
          {phase === "review" && (
            <button type="button" className="chip-btn ghost" onClick={done}>
              Done
            </button>
          )}
        </div>
        <RecordButton
          on={recording}
          onClick={recording ? stop : start}
          label={recording ? "Stop recording" : "Record a melody"}
        />
        <div className="side right" />
      </div>
      <p className={`rec-caption${recording ? " on" : ""}`}>
        {recording
          ? "Recording — tap to stop"
          : phase === "review"
            ? "Tap to catch another take"
            : "Tap to catch a melody"}
      </p>

      {error && (
        <p className="notice error" role="status">
          {error}
        </p>
      )}
    </>
  );
}
