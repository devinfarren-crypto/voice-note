"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDuration } from "../lib/format";
import { PauseIcon, PlayIcon } from "./icons";

const BARS = 42;

// Compact player: play/pause plus a bar-style scrubber drawn from the take's
// actual loudness profile. Blob durations from MediaRecorder are often
// Infinity/NaN in the <audio> element, so the known length is passed in.
export default function AudioPlayer({
  blob,
  durationMs,
  peaks,
}: {
  blob: Blob;
  durationMs?: number;
  peaks?: number[];
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [bars, setBars] = useState<number[] | null>(peaks ?? null);
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  const total = (durationMs ?? 0) / 1000;

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  // Decode once to get a real waveform when one wasn't recorded live.
  useEffect(() => {
    if (peaks) return;
    let cancelled = false;
    (async () => {
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        void ctx.close();
        const data = buf.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / BARS));
        const out: number[] = [];
        for (let b = 0; b < BARS; b++) {
          let sum = 0;
          for (let i = b * step; i < Math.min(data.length, (b + 1) * step); i++) {
            sum += data[i] * data[i];
          }
          out.push(Math.sqrt(sum / step));
        }
        const max = Math.max(...out, 0.0001);
        if (!cancelled) setBars(out.map((v) => v / max));
      } catch {
        // Undecodable — fall back to a flat line.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, peaks]);

  const heights = bars ?? Array.from({ length: BARS }, () => 0.15);
  const progress = total ? Math.min(1, pos / total) : 0;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const seek = (clientX: number, target: HTMLElement) => {
    const el = audioRef.current;
    if (!el || !total) return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    el.currentTime = ratio * total;
    setPos(el.currentTime);
  };

  return (
    <div className="player">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPos(0);
        }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
      />
      <button
        type="button"
        className="play"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div
        className="track"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(pos)}
        onPointerDown={(e) => seek(e.clientX, e.currentTarget)}
      >
        {heights.map((h, i) => (
          <span
            key={i}
            className={i / heights.length < progress ? "on" : undefined}
            style={{ height: `${Math.max(12, h * 100)}%` }}
          />
        ))}
      </div>
      <span className="time">{formatDuration((playing || pos ? pos : total) * 1000)}</span>
    </div>
  );
}
