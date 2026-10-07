"use client";

import { useState } from "react";
import type { Take } from "../lib/db";
import { downloadTake, emailTake, RecipientRejected, shareTake } from "../lib/send";
import { useRecipient } from "./RecipientProvider";
import { CopyIcon, MailIcon, ShareIcon, TrashIcon } from "./icons";

type Status = { kind: "idle" | "busy" | "ok" | "error"; msg: string };

// Email / share / copy / delete for a saved take. Shared by the melody review
// screen and the library so both behave identically.
export default function TakeActions({
  take,
  onDelete,
  deleteLabel = "Delete",
}: {
  take: Take;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle", msg: "" });
  const [confirming, setConfirming] = useState(false);
  const { ensure, forget } = useRecipient();

  const email = async () => {
    const to = await ensure();
    if (!to) return;
    setStatus({ kind: "busy", msg: "Sending…" });
    try {
      await emailTake(take, to);
      setStatus({ kind: "ok", msg: `Sent to ${to.email}` });
    } catch (err) {
      if (err instanceof RecipientRejected) forget();
      setStatus({ kind: "error", msg: (err as Error).message });
    }
  };

  const share = async () => {
    try {
      const shared = await shareTake(take);
      if (!shared) {
        downloadTake(take);
        setStatus({ kind: "ok", msg: "Downloaded." });
      }
    } catch {
      setStatus({ kind: "error", msg: "Couldn't open the share sheet." });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(take.title ? `${take.title}\n\n${take.text}` : take.text);
      setStatus({ kind: "ok", msg: "Copied to clipboard." });
    } catch {
      setStatus({ kind: "error", msg: "Couldn't copy." });
    }
  };

  return (
    <div>
      <div className="actions">
        <button type="button" className="chip-btn" onClick={email} disabled={status.kind === "busy"}>
          <MailIcon /> Email
        </button>
        <button type="button" className="chip-btn" onClick={share}>
          <ShareIcon /> Share
        </button>
        {take.kind === "lyrics" && (
          <button type="button" className="chip-btn" onClick={copy}>
            <CopyIcon /> Copy
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="chip-btn ghost danger"
            onClick={() => (confirming ? onDelete() : setConfirming(true))}
            onBlur={() => setConfirming(false)}
          >
            <TrashIcon /> {confirming ? "Sure?" : deleteLabel}
          </button>
        )}
      </div>
      {status.msg && (
        <p
          className={`notice${status.kind === "error" ? " error" : status.kind === "ok" ? " ok" : ""}`}
          role="status"
        >
          {status.msg}
        </p>
      )}
    </div>
  );
}
