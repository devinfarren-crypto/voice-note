"use client";

import { useState } from "react";
import type { Take, TakeKind } from "../lib/db";
import { formatDuration, friendlyDate } from "../lib/format";
import AudioPlayer from "./AudioPlayer";
import TakeActions from "./TakeActions";
import { NoteIcon, QuillIcon } from "./icons";

type Filter = "all" | TakeKind;

function preview(take: Take): string {
  if (take.kind === "melody") {
    const bits = [formatDuration(take.durationMs ?? 0)];
    if (take.keyHint) bits.push(`around ${take.keyHint}`);
    if (take.text) bits.push(take.text.split("\n")[0]);
    return bits.join(" · ");
  }
  return take.text.split("\n").find((l) => l.trim()) ?? "";
}

function fallbackTitle(take: Take): string {
  if (take.title) return take.title;
  if (take.kind === "lyrics") {
    const first = take.text.split("\n")[0].trim();
    return first.length > 34 ? `${first.slice(0, 34)}…` : first || "Untitled lyric";
  }
  return "Untitled melody";
}

export default function Library({
  takes,
  loading,
  onDelete,
}: {
  takes: Take[];
  loading: boolean;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const shown = filter === "all" ? takes : takes.filter((t) => t.kind === filter);
  const lyricCount = takes.filter((t) => t.kind === "lyrics").length;

  return (
    <section className="column" aria-label="Saved takes">
      <div className="lib-head">
        <h2>Takes</h2>
        <span>
          {lyricCount} lyric{lyricCount === 1 ? "" : "s"} · {takes.length - lyricCount} melod
          {takes.length - lyricCount === 1 ? "y" : "ies"}
        </span>
      </div>

      <div className="filters" role="group" aria-label="Filter takes">
        {(["all", "lyrics", "melody"] as Filter[]).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "lyrics" ? "Lyrics" : "Melodies"}
          </button>
        ))}
      </div>

      {!loading && shown.length === 0 ? (
        <div className="empty">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="portrait" src="justin-sketch.jpg" alt="" />
          <p className="big">Nothing caught yet.</p>
          <p>Every lyric you save and melody you record lands here.</p>
        </div>
      ) : (
        <ul className="takes">
          {shown.map((take) => {
            const isOpen = open === take.id;
            return (
              <li key={take.id} className="take" data-kind={take.kind}>
                <button
                  type="button"
                  className="take-head"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : take.id)}
                >
                  <span className="take-badge">
                    {take.kind === "melody" ? <NoteIcon /> : <QuillIcon />}
                  </span>
                  <span className="take-meta">
                    <div className="take-title">{fallbackTitle(take)}</div>
                    <div className="take-sub">
                      {friendlyDate(take.createdAt)}
                      {preview(take) ? ` · ${preview(take)}` : ""}
                    </div>
                  </span>
                </button>
                {isOpen && (
                  <div className="take-body">
                    {take.kind === "melody" && take.audio && (
                      <AudioPlayer blob={take.audio} durationMs={take.durationMs} peaks={take.peaks} />
                    )}
                    {take.kind === "lyrics" ? (
                      <pre className="take-lyrics">{take.text}</pre>
                    ) : (
                      take.text && <p className="take-note">{take.text}</p>
                    )}
                    <TakeActions take={take} onDelete={() => onDelete(take.id)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
