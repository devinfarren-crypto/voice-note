"use client";

// Truck mode: the whole screen is one giant Start / Stop button. Truck mode
// stays on across launches until he climbs out, so the app opens straight to
// it; one tap anywhere starts recording, another stops and saves. Nothing to
// aim for, nothing to read; eyes stay on the road.

import { useCallback, useEffect, useRef, useState } from "react";
import { newId, saveTake, type Take } from "../lib/db";
import { formatDuration, pickAudioMime } from "../lib/format";

type Phase = "idle" | "starting" | "recording" | "saved" | "blocked";

export default function TruckMode({
  onSaved,
  onExit,
}: {
  onSaved: (take: Take) => void;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [lastLength, setLastLength] = useState(0);
  const [count, setCount] = useState(0);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedRef = useRef(0);
  const tickRef = useRef(0);
  const exitingRef = useRef(false);
  // Parent callbacks change identity on every render; read them through refs
  // so truck mode only auto-starts once, when it first appears.
  const onSavedRef = useRef(onSaved);
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onSavedRef.current = onSaved;
    onExitRef.current = onExit;
  }, [onSaved, onExit]);

  const release = () => {
    clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async () => {
    if (recRef.current?.state === "recording") return;
    setPhase("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch {
      // iOS sometimes wants a tap before it hands over the mic.
      setPhase("blocked");
      return;
    }
    streamRef.current = stream;
    const mime = pickAudioMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = async () => {
      const durationMs = performance.now() - startedRef.current;
      release();
      // Opening the app and leaving truck mode straight away shouldn't leave
      // a one-second take of nothing behind.
      if (exitingRef.current && durationMs < 2000) {
        onExitRef.current();
        return;
      }
      const when = new Date();
      const take: Take = {
        id: newId(),
        kind: "melody",
        title: `Truck · ${when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
        text: "",
        createdAt: when.getTime(),
        audio: new Blob(chunks, { type: rec.mimeType || mime || "audio/mp4" }),
        durationMs,
      };
      try {
        await saveTake(take);
        onSavedRef.current(take);
      } catch {
        // Nothing sensible to do mid-drive; the take just isn't kept.
      }
      setLastLength(durationMs);
      setCount((c) => c + 1);
      if (exitingRef.current) onExitRef.current();
      else setPhase("saved");
    };
    recRef.current = rec;
    startedRef.current = performance.now();
    setElapsed(0);
    rec.start(500);
    setPhase("recording");
    tickRef.current = window.setInterval(() => setElapsed(performance.now() - startedRef.current), 250);
  }, []);

  const stop = () => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  // If truck mode is left some other way mid-take, still save what was caught.
  useEffect(
    () => () => {
      const rec = recRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      release();
    },
    []
  );

  // Keep the screen on while he's driving.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    const ask = () => {
      nav.wakeLock?.request("screen").then((l) => (lock = l), () => {});
    };
    ask();
    const onVisible = () => document.visibilityState === "visible" && ask();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  const recording = phase === "recording";

  const leave = () => {
    if (recording) {
      exitingRef.current = true;
      stop();
    } else {
      onExit();
    }
  };

  return (
    <div className={`truck${recording ? " on" : ""}`} role="dialog" aria-modal="true" aria-label="Truck mode">
      <button
        type="button"
        className="truck-hit"
        onClick={recording ? stop : start}
        aria-label={recording ? "Stop and save" : "Start recording"}
      >
        <span className="truck-disc-wrap" aria-hidden="true">
          <span className="truck-disc">
            <span className="truck-label" />
          </span>
          {/* Sits on top of the label but doesn't spin with the record. */}
          <span className="truck-word">{recording ? "Stop" : phase === "starting" ? "…" : "Start"}</span>
        </span>
        <span className="truck-time">
          {recording ? formatDuration(elapsed) : phase === "saved" ? "Saved" : ""}
        </span>
        <span className="truck-say">
          {recording
            ? "Rolling. Tap anywhere to stop and save."
            : phase === "saved"
              ? `${formatDuration(lastLength)} caught${count > 1 ? ` · ${count} this drive` : ""}. Tap Start for another.`
              : phase === "blocked"
                ? "Couldn't get the mic. Tap Start to try again."
                : phase === "starting"
                  ? "Getting the mic…"
                  : "Tap anywhere to start recording."}
        </span>
      </button>
      <button type="button" className="truck-exit" onClick={leave}>
        Out of the truck
      </button>
    </div>
  );
}
