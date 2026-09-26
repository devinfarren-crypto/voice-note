"use client";

// Lyric mode: sing or speak a line and it lands on a legal-pad lyric sheet.
// The sheet is always editable by hand, and the draft is kept in
// localStorage so a half-caught verse survives the app being closed.

import { useCallback, useEffect, useState } from "react";
import { newId, saveTake, type Take } from "../lib/db";
import { emailTake } from "../lib/send";
import { useDictation } from "../lib/useDictation";
import RecordButton from "./RecordButton";
import { MailIcon, SaveIcon } from "./icons";

const DRAFT_KEY = "catch:lyric-draft";

type Status = { kind: "idle" | "busy" | "ok" | "error"; msg: string };

function readDraft(): { title: string; text: string } {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Storage unavailable (private mode) — start blank.
  }
  return { title: "", text: "" };
}

export default function LyricsCapture({
  onSaved,
  onBusyChange,
}: {
  onSaved: (take: Take) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle", msg: "" });
  // Don't write the draft back until it has been read, or the blank initial
  // state would overwrite it.
  const [restored, setRestored] = useState(false);

  const appendPhrase = useCallback((phrase: string) => {
    // Each pause in dictation becomes a new line — that's usually where the
    // line breaks in a lyric fall anyway.
    setText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")}\n${phrase}` : phrase));
  }, []);
  const dictation = useDictation(appendPhrase);

  useEffect(() => {
    const draft = readDraft();
    // Restoring from storage can only happen after mount (no SSR access).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(draft.title);
    setText(draft.text);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, text }));
    } catch {
      // ignore
    }
  }, [restored, title, text]);

  useEffect(() => onBusyChange(dictation.listening), [dictation.listening, onBusyChange]);

  const hasText = text.trim().length > 0;

  const buildTake = (): Take => ({
    id: newId(),
    kind: "lyrics",
    title: title.trim(),
    text: text.trim(),
    createdAt: Date.now(),
  });

  const clearSheet = () => {
    setTitle("");
    setText("");
  };

  const save = async () => {
    dictation.stop();
    const take = buildTake();
    try {
      await saveTake(take);
      onSaved(take);
      clearSheet();
      setStatus({ kind: "ok", msg: "Tucked away in Takes." });
    } catch {
      setStatus({ kind: "error", msg: "Couldn't save on this device." });
    }
  };

  const email = async () => {
    dictation.stop();
    const take = buildTake();
    setStatus({ kind: "busy", msg: "Sending…" });
    try {
      const subject = await emailTake(take);
      // Emailed lyrics are kept too — the inbox is a backup, not the library.
      await saveTake(take).catch(() => {});
      onSaved(take);
      clearSheet();
      setStatus({ kind: "ok", msg: `Sent & saved — “${subject}”` });
    } catch (err) {
      setStatus({ kind: "error", msg: (err as Error).message });
    }
  };

  return (
    <>
      <section className="sheet" aria-label="Lyric sheet">
        <input
          className="sheet-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          aria-label="Song title"
          maxLength={80}
        />
        <div className="sheet-body">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              dictation.supported
                ? "Tap the record and sing or say the line…"
                : "Write the line down before it's gone…"
            }
            aria-label="Lyrics"
          />
          {dictation.interim && <div className="interim">{dictation.interim}</div>}
        </div>
      </section>

      <div className="transport">
        <div className="side">
          <button type="button" className="chip-btn" onClick={save} disabled={!hasText}>
            <SaveIcon /> Save
          </button>
        </div>
        <RecordButton
          on={dictation.listening}
          disabled={!dictation.supported}
          onClick={dictation.listening ? dictation.stop : dictation.start}
          label={dictation.listening ? "Stop dictating" : "Dictate lyrics"}
        />
        <div className="side right">
          <button
            type="button"
            className="chip-btn primary"
            onClick={email}
            disabled={!hasText || status.kind === "busy"}
          >
            <MailIcon /> Send
          </button>
        </div>
      </div>
      <p className={`rec-caption${dictation.listening ? " on" : ""}`}>
        {dictation.listening
          ? "Listening — each pause starts a new line"
          : dictation.supported
            ? "Tap to catch lyrics"
            : "Dictation needs Safari on iPhone — typing works everywhere"}
      </p>

      {(dictation.error || status.msg) && (
        <p
          className={`notice${dictation.error || status.kind === "error" ? " error" : status.kind === "ok" ? " ok" : ""}`}
          role="status"
        >
          {dictation.error || status.msg}
        </p>
      )}
    </>
  );
}
