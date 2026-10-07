"use client";

// Owns "where do emailed takes go". Any Email button calls ensure(): if an
// address is already confirmed it resolves straight away, otherwise it opens
// the setup sheet and resolves once he's confirmed one (or null if he backs out).

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { confirmCode, loadRecipient, sendCode, storeRecipient, type Pending, type Recipient } from "../lib/recipient";

interface RecipientApi {
  recipient: Recipient | null;
  ensure: () => Promise<Recipient | null>;
  change: () => void;
  forget: () => void;
}

const RecipientContext = createContext<RecipientApi | null>(null);

export function useRecipient(): RecipientApi {
  const api = useContext(RecipientContext);
  if (!api) throw new Error("useRecipient must be used inside RecipientProvider");
  return api;
}

export default function RecipientProvider({ children }: { children: React.ReactNode }) {
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [open, setOpen] = useState(false);
  const waiting = useRef<((r: Recipient | null) => void) | null>(null);

  useEffect(() => {
    // Stored on the phone, so it can only be read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecipient(loadRecipient());
  }, []);

  const finish = useCallback((r: Recipient | null) => {
    if (r) {
      storeRecipient(r);
      setRecipient(r);
    }
    setOpen(false);
    waiting.current?.(r);
    waiting.current = null;
  }, []);

  const ensure = useCallback(() => {
    const known = loadRecipient();
    if (known) return Promise.resolve(known);
    return new Promise<Recipient | null>((resolve) => {
      waiting.current = resolve;
      setOpen(true);
    });
  }, []);

  const change = useCallback(() => setOpen(true), []);

  const forget = useCallback(() => {
    storeRecipient(null);
    setRecipient(null);
  }, []);

  return (
    <RecipientContext.Provider value={{ recipient, ensure, change, forget }}>
      {children}
      {open && <EmailSetup current={recipient?.email ?? ""} onDone={finish} />}
    </RecipientContext.Provider>
  );
}

function EmailSetup({ current, onDone }: { current: string; onDone: (r: Recipient | null) => void }) {
  const [email, setEmail] = useState(current);
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requestCode = async () => {
    setBusy(true);
    setError("");
    try {
      setPending(await sendCode(email));
      setCode("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      onDone(await confirmCode(pending, value));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="gift" role="dialog" aria-modal="true" aria-labelledby="send-to-title">
      <div className="send-to">
        <h2 id="send-to-title">Where should your takes go?</h2>
        {!pending ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void requestCode();
            }}
          >
            <p>Type your email. We&apos;ll send a quick code to make sure it&apos;s really yours.</p>
            <input
              className="field"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              autoFocus
            />
            <div className="actions spread">
              <button type="button" className="chip-btn ghost" onClick={() => onDone(null)}>
                Not now
              </button>
              <button type="submit" className="chip-btn primary" disabled={busy || !email.trim()}>
                {busy ? "Sending…" : "Send code"}
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <p>
              Check <b>{pending.email}</b> for a 6-digit code.
            </p>
            <input
              className="field code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                if (v.length === 6) void verify(v);
              }}
              placeholder="••••••"
              aria-label="6-digit code"
              autoFocus
            />
            <div className="actions spread">
              <button type="button" className="chip-btn ghost" onClick={() => setPending(null)} disabled={busy}>
                Different email
              </button>
              <button type="submit" className="chip-btn primary" disabled={busy || code.length !== 6}>
                {busy ? "Checking…" : "Confirm"}
              </button>
            </div>
          </form>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
