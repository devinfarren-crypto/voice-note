import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";

// Voice-note delivery. Takes the dictated text plus client-formatted local
// time/date, asks Claude for a two-word summary, and emails the note to the
// configured recipient. The recipient is fixed server-side (env, defaulting to
// the owner) — this endpoint is unauthenticated by design, so the worst an
// abuser can do is spam that one inbox, never an arbitrary address.

const RECIPIENT = process.env.NOTE_RECIPIENT ?? "devinfarren@gmail.com";
const MAX_NOTE_CHARS = 8000;
const SUMMARY_MODEL = "claude-haiku-4-5";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

// Fallback when the model is unavailable: first two meaningful words of the note.
function fallbackSummary(text: string): string {
  const two = toTwoWords(text);
  return two || "Voice Note";
}

async function summarize(text: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackSummary(text);
  try {
    const response = await anthropic.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 16,
      system:
        "You label voice notes. Reply with EXACTLY two words that summarize the note's topic, in Title Case, no punctuation, no quotes, nothing else.",
      messages: [{ role: "user", content: text.slice(0, 4000) }],
    });
    const block = response.content.find((b) => b.type === "text");
    const candidate = block && block.type === "text" ? toTwoWords(block.text) : "";
    return candidate || fallbackSummary(text);
  } catch (err) {
    console.error("[notes/send] summary failed, using fallback:", err);
    return fallbackSummary(text);
  }
}

export async function POST(req: NextRequest) {
  let body: { text?: unknown; timeLabel?: unknown; dateLabel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ ok: false, error: "Note is empty." }, { status: 400 });
  }
  if (text.length > MAX_NOTE_CHARS) {
    return NextResponse.json({ ok: false, error: "Note is too long." }, { status: 413 });
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
    typeof body.timeLabel === "string" && body.timeLabel.trim()
      ? body.timeLabel.trim().slice(0, 40)
      : now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dateLabel =
    typeof body.dateLabel === "string" && body.dateLabel.trim()
      ? body.dateLabel.trim().slice(0, 40)
      : now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const twoWords = await summarize(text);
  const subject = `${timeLabel} · ${dateLabel} · ${twoWords}`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: RECIPIENT,
      subject,
      text,
    });
    if (error) {
      console.error("[notes/send] resend error:", error);
      return NextResponse.json(
        { ok: false, error: "Couldn't send the email." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, subject });
  } catch (err) {
    console.error("[notes/send] send threw:", err);
    return NextResponse.json({ ok: false, error: "Couldn't send the email." }, { status: 502 });
  }
}
