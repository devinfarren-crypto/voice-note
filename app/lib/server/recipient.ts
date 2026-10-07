import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

// Stateless proof that someone controls an email address. There's no database:
// the server signs what it needs to check later (with a secret only it knows)
// and hands the signature to the phone to keep.
//
//   1. start:   email a 6-digit code, return challenge = sign(email, code, expiry)
//   2. confirm: phone sends email + code + expiry + challenge back; if the
//               signature matches, return token = sign("recipient", email)
//   3. send:    only email takes to an address that comes with a valid token
//
// This keeps the send endpoint from being an open relay: nobody can make it
// mail an address whose inbox they can't read.

export const CODE_TTL_MS = 10 * 60 * 1000;

function secret(): string | null {
  return process.env.CATCH_SECRET || process.env.RESEND_API_KEY || null;
}

function sign(parts: string[]): string | null {
  const key = secret();
  if (!key) return null;
  return createHmac("sha256", key).update(parts.join("|")).digest("base64url");
}

function same(a: string, b: string | null): boolean {
  if (!b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export function newCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function challengeFor(email: string, code: string, expires: number): string | null {
  return sign(["verify", email, code, String(expires)]);
}

export function checkChallenge(email: string, code: string, expires: number, challenge: string): boolean {
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  return same(challenge, challengeFor(email, code, expires));
}

export function tokenFor(email: string): string | null {
  return sign(["recipient", email]);
}

export function checkToken(email: string, token: unknown): boolean {
  return typeof token === "string" && same(token, tokenFor(email));
}
