import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { checkToken, normaliseEmail } from "../../../lib/server/recipient";

// Song-idea delivery. Takes a lyric or melody take plus client-formatted local
// time/date, asks Claude for a two-word summary of any lyric text, and emails
// it (with the melody audio attached). It goes to the address he chose in the
// app — but only with a token proving he confirmed that inbox (see
// lib/server/recipient.ts) — or else to NOTE_RECIPIENT if one is set. The
// endpoint is unauthenticated, so it must never mail an unconfirmed address.

const FALLBACK_RECIPIENT = process.env.NOTE_RECIPIENT || null;
const MAX_NOTE_CHARS = 8000;
// Vercel rejects bodies over 4.5 MB, so real audio never gets near this.
const MAX_AUDIO_BASE64_CHARS = 4_400_000;
const SUMMARY_MODEL = "claude-haiku-4-5";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Kind = "lyrics" | "melody";

// Title-case + strip anything that isn't a letter/number/space so a stray
// model flourish can't land in the subject line.
function toTwoWords(raw: string): string {
  const words = raw
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(" ");
}

function fallbackSummary(text: string, kind: Kind): string {
  return toTwoWords(text) || (kind === "melody" ? "Melody Idea" : "Lyric Idea");
}

async function summarize(text: string, kind: Kind): Promise<string> {
  if (!text || !process.env.ANTHROPIC_API_KEY) return fallbackSummary(text, kind);
  try {
    const response = await anthropic.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 16,
      system:
        "You label a songwriter's rough song ideas. Reply with EXACTLY two evocative words capturing the idea's image or theme, in Title Case, no punctuation, no quotes, nothing else.",
      messages: [{ role: "user", content: text.slice(0, 4000) }],
    });
    const block = response.content.find((b) => b.type === "text");
    const candidate = block && block.type === "text" ? toTwoWords(block.text) : "";
    return candidate || fallbackSummary(text, kind);
  } catch (err) {
    console.error("[notes/send] summary failed, using fallback:", err);
    return fallbackSummary(text, kind);
  }
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const kind: Kind = body.kind === "melody" ? "melody" : "lyrics";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const title = str(body.title, 80);
  const keyHint = str(body.keyHint, 12);

  const rawAudio = body.audio as { base64?: unknown; mime?: unknown; filename?: unknown } | undefined;
  const audioBase64 = typeof rawAudio?.base64 === "string" ? rawAudio.base64 : "";

  if (kind === "lyrics" && !text) {
    return NextResponse.json({ ok: false, error: "Lyrics are empty." }, { status: 400 });
  }
  if (kind === "melody" && !audioBase64) {
    return NextResponse.json({ ok: false, error: "No recording attached." }, { status: 400 });
  }
  if (text.length > MAX_NOTE_CHARS) {
    return NextResponse.json({ ok: false, error: "That's too long to send." }, { status: 413 });
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    return NextResponse.json(
      { ok: false, error: "That take is too long to email — use Share instead." },
      { status: 413 }
    );
  }

  const chosen = normaliseEmail(body.to);
  if (body.to && !(chosen && checkToken(chosen, body.toToken))) {
    return NextResponse.json(
      { ok: false, error: "Confirm your email address again.", needsRecipient: true },
      { status: 400 }
    );
  }
  const recipient = chosen ?? FALLBACK_RECIPIENT;
  if (!recipient) {
    return NextResponse.json(
      { ok: false, error: "Choose where your takes should go first.", needsRecipient: true },
      { status: 400 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!apiKey || !from) {
    return NextResponse.json(
      { ok: false, error: "Email isn't configured on the server." },
      { status: 500 }
    );
  }

  // Prefer the client's local time/date (server runs in UTC); fall back to now.
  const now = new Date();
  const timeLabel =
    str(body.timeLabel, 40) ||
    now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dateLabel =
    str(body.dateLabel, 40) ||
    now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // A named take keeps its name; untitled ones get a two-word summary.
  const label = title.replace(/\s+/g, " ") || (await summarize(text, kind));
  const kindLabel = kind === "melody" ? "Melody" : "Lyrics";
  const subject = `${kindLabel} · ${timeLabel} · ${dateLabel} · ${label}`;

  const lines = [
    title ? title : null,
    kind === "melody" && keyHint ? `Hovering around ${keyHint}` : null,
    text || null,
  ].filter(Boolean);
  const emailText = lines.length ? lines.join("\n\n") : "Melody attached.";

  const mime = str(rawAudio?.mime, 60) || "audio/mp4";
  const filename = str(rawAudio?.filename, 100).replace(/[^\w.\- ]+/g, "") || "melody.m4a";

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: recipient,
      subject,
      text: emailText,
      attachments: audioBase64
        ? [{ filename, content: audioBase64, contentType: mime }]
        : undefined,
    });
    if (error) {
      console.error("[notes/send] resend error:", error);
      return NextResponse.json({ ok: false, error: "Couldn't send the email." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, subject, to: recipient });
  } catch (err) {
    console.error("[notes/send] send threw:", err);
    return NextResponse.json({ ok: false, error: "Couldn't send the email." }, { status: 502 });
  }
}
