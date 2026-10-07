import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { challengeFor, CODE_TTL_MS, newCode, normaliseEmail } from "../../../lib/server/recipient";

// Step 1 of choosing where takes are emailed: send a 6-digit code to the
// address. The only thing this endpoint ever emails a stranger is that code.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = normaliseEmail(body.email);
  if (!email) {
    return NextResponse.json({ ok: false, error: "That doesn't look like an email address." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!apiKey || !from) {
    return NextResponse.json({ ok: false, error: "Email isn't set up on the server yet." }, { status: 500 });
  }

  const code = newCode();
  const expires = Date.now() + CODE_TTL_MS;
  const challenge = challengeFor(email, code, expires);
  if (!challenge) {
    return NextResponse.json({ ok: false, error: "Email isn't set up on the server yet." }, { status: 500 });
  }

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from,
      to: email,
      subject: `Your Catch code: ${code}`,
      text: `${code}\n\nType this into Catch to send your takes to this address. It works for 10 minutes.\n\nIf you didn't ask for this, ignore it — nothing will be sent to you.`,
    });
    if (error) {
      console.error("[recipient/start] resend error:", error);
      return NextResponse.json({ ok: false, error: "Couldn't send the code. Check the address and try again." }, { status: 502 });
    }
  } catch (err) {
    console.error("[recipient/start] send threw:", err);
    return NextResponse.json({ ok: false, error: "Couldn't send the code. Try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, email, expires, challenge });
}
