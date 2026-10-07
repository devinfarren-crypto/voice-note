import { NextRequest, NextResponse } from "next/server";
import { checkChallenge, normaliseEmail, tokenFor } from "../../../lib/server/recipient";

// Step 2: if the code matches the one we emailed, hand back a token that lets
// the send endpoint mail this address from now on.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = normaliseEmail(body.email);
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  const expires = Number(body.expires);
  const challenge = typeof body.challenge === "string" ? body.challenge : "";

  if (!email || code.length !== 6 || !challenge) {
    return NextResponse.json({ ok: false, error: "Enter the 6-digit code from the email." }, { status: 400 });
  }
  if (Date.now() > expires) {
    return NextResponse.json({ ok: false, error: "That code has expired. Send a new one." }, { status: 400 });
  }
  if (!checkChallenge(email, code, expires, challenge)) {
    return NextResponse.json({ ok: false, error: "That code doesn't match. Try again." }, { status: 400 });
  }
  const token = tokenFor(email);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Email isn't set up on the server yet." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, email, token });
}
