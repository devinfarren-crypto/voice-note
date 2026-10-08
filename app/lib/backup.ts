// "Back up everything": every take in one .zip, laid out so a person can use
// it without Catch — melodies as audio files, lyrics as text — plus a
// takes.json so a future "restore" could read it back in.

import { listTakes, type Take } from "./db";
import { extensionFor, formatDuration } from "./format";
import { makeZip, type ZipEntry } from "./zip";

function stamp(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
}

function safe(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

function label(t: Take): string {
  if (t.title) return safe(t.title);
  if (t.kind === "lyrics") return safe(t.text.split("\n")[0] || "Untitled lyric");
  return "Untitled melody";
}

export async function buildBackup(): Promise<{ file: File; count: number; bytes: number }> {
  const takes = await listTakes();
  const enc = new TextEncoder();
  const folder = `Catch backup ${stamp(Date.now())}`;
  const entries: ZipEntry[] = [];
  const used = new Set<string>();
  const unique = (path: string) => {
    let p = path;
    for (let i = 2; used.has(p); i++) p = path.replace(/(\.\w+)$/, ` (${i})$1`);
    used.add(p);
    return p;
  };

  for (const t of takes) {
    const base = `${stamp(t.createdAt)} - ${label(t)}`;
    const when = new Date(t.createdAt);
    if (t.kind === "lyrics") {
      const body = t.title ? `${t.title}\n\n${t.text}\n` : `${t.text}\n`;
      entries.push({ name: unique(`${folder}/Lyrics/${base}.txt`), data: enc.encode(body), modified: when });
    } else if (t.audio) {
      const ext = extensionFor(t.audio.type);
      entries.push({
        name: unique(`${folder}/Melodies/${base}.${ext}`),
        data: new Uint8Array(await t.audio.arrayBuffer()),
        modified: when,
      });
      const notes = [
        t.title,
        `${formatDuration(t.durationMs ?? 0)}${t.keyHint ? ` · around ${t.keyHint}` : ""}`,
        t.text,
      ].filter(Boolean);
      if (t.text || t.title) {
        entries.push({ name: unique(`${folder}/Melodies/${base}.txt`), data: enc.encode(notes.join("\n\n") + "\n"), modified: when });
      }
    }
  }

  const index = takes.map((t) => ({
    id: t.id,
    kind: t.kind,
    title: t.title,
    text: t.text,
    createdAt: new Date(t.createdAt).toISOString(),
    durationMs: t.durationMs,
    keyHint: t.keyHint,
  }));
  entries.push({ name: `${folder}/takes.json`, data: enc.encode(JSON.stringify(index, null, 2)) });

  const zip = makeZip(entries);
  const file = new File([zip], `${folder}.zip`, { type: "application/zip" });
  return { file, count: takes.length, bytes: zip.size };
}

/** Opens the share sheet (Save to Files / iCloud Drive), or downloads. */
export async function shareBackup(file: File): Promise<"shared" | "downloaded" | "cancelled"> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return "shared";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
