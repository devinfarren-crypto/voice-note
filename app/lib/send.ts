// Client-side delivery helpers: email a take through the API route, or hand
// it to the iOS share sheet (Voice Memos, Messages, Files, AirDrop…).

import type { Take } from "./db";
import { blobToBase64, extensionFor, timeAndDateLabels } from "./format";

// Vercel caps request bodies at 4.5 MB; base64 inflates by 4/3.
const MAX_EMAIL_AUDIO_BYTES = 3_200_000;

export function fileNameFor(take: Take): string {
  const base = (take.title || take.kind).replace(/[^\w\- ]+/g, "").trim() || take.kind;
  return `${base}.${extensionFor(take.audio?.type ?? "")}`;
}

export async function emailTake(take: Take): Promise<string> {
  if (take.audio && take.audio.size > MAX_EMAIL_AUDIO_BYTES) {
    throw new Error("That take is too long to email — use Share instead.");
  }
  const { timeLabel, dateLabel } = timeAndDateLabels(new Date(take.createdAt));
  const audio = take.audio
    ? {
        base64: await blobToBase64(take.audio),
        mime: take.audio.type || "audio/mp4",
        filename: fileNameFor(take),
      }
    : undefined;

  const res = await fetch("/api/notes/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: take.kind,
      title: take.title,
      text: take.text,
      keyHint: take.keyHint,
      timeLabel,
      dateLabel,
      audio,
    }),
  });
  const data: { ok?: boolean; subject?: string; error?: string } = await res
    .json()
    .catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't send it. Try again.");
  return data.subject ?? "Sent";
}

/** Returns false when the share sheet isn't available so callers can fall back. */
export async function shareTake(take: Take): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share) return false;
  const data: ShareData = { title: take.title || "Song idea" };
  if (take.audio) {
    const file = new File([take.audio], fileNameFor(take), { type: take.audio.type });
    const withFile = { ...data, files: [file] };
    if (nav.canShare?.(withFile)) Object.assign(data, withFile);
    else return false;
  } else {
    data.text = take.title ? `${take.title}\n\n${take.text}` : take.text;
  }
  try {
    await nav.share(data);
  } catch (err) {
    // Dismissing the sheet is not a failure.
    if ((err as DOMException)?.name !== "AbortError") throw err;
  }
  return true;
}

export function downloadTake(take: Take) {
  const blob = take.audio ?? new Blob([take.text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = take.audio ? fileNameFor(take) : `${take.title || "lyrics"}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
