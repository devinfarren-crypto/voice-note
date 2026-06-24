"use client";

// Dead-simple voice note taker, built to live on the iPhone home screen.
// One button starts/stops listening (Web Speech API, webkit-prefixed on iOS
// Safari); one button emails the note to its configured recipient. The email
// subject is assembled server-side as "time · date · two-word summary".
//
// Off-white background. No auth, no chrome — tap, talk, send.

import { useCallback, useEffect, useRef, useState } from "react";

// --- Minimal Web Speech API typings (not in the default TS lib) ---
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const CREAM = "#faf7f0";
const CORAL = "#e07850";
const TEAL = "#3a7c6a";
const INK = "#2c3e50";

type SendState = "idle" | "sending" | "sent" | "error";

export default function NotesClient() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState("");
  const [interim, setInterim] = useState("");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Tracks intent so an auto-`onend` (iOS ends the session after a pause) can
  // transparently restart while the user still wants to be listening.
  const wantListeningRef = useRef(false);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      // Browser-capability detection can only run client-side, so this post-
      // mount flip is intentional — `supported` starts true to match the SSR
      // markup and avoid a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSupported(false);
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (e: SpeechRecognitionEventLike) => {
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) {
          const clean = text.trim();
          if (clean) {
            setNote((prev) => (prev ? prev + " " + clean : clean));
          }
        } else {
          interimChunk += text;
        }
      }
      setInterim(interimChunk);
    };

    recognition.onerror = (e: { error: string }) => {
      // "no-speech" / "aborted" are routine on iOS — keep going unless it's a
      // real permission failure.
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantListeningRef.current = false;
        setListening(false);
        setStatusMsg("Microphone access was blocked. Allow it in Settings to dictate.");
      }
    };

    recognition.onend = () => {
      setInterim("");
      if (wantListeningRef.current) {
        // The engine timed out mid-note; restart so dictation feels continuous.
        try {
          recognition.start();
        } catch {
          // Already starting — ignore.
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    return () => {
      wantListeningRef.current = false;
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setStatusMsg("");
    setSendState("idle");
    wantListeningRef.current = true;
    setListening(true);
    try {
      recognition.start();
    } catch {
      // start() throws if it's already running — that's fine.
    }
  }, []);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    wantListeningRef.current = false;
    setListening(false);
    setInterim("");
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  const sendNote = useCallback(async () => {
    const text = note.trim();
    if (!text) return;
    stopListening();
    setSendState("sending");
    setStatusMsg("");

    // Format time + date in the user's local zone — the server runs in UTC.
    const now = new Date();
    const timeLabel = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    const dateLabel = now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    try {
      const res = await fetch("/api/notes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, timeLabel, dateLabel }),
      });
      const data: { ok?: boolean; subject?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) {
        setSendState("error");
        setStatusMsg(data.error ?? "Could not send the note. Try again.");
        return;
      }
      setSendState("sent");
      setStatusMsg(data.subject ? `Sent — “${data.subject}”` : "Sent.");
      setNote("");
    } catch {
      setSendState("error");
      setStatusMsg("Network error — the note wasn't sent.");
    }
  }, [note, stopListening]);

  const displayText = interim ? (note ? note + " " + interim : interim) : note;
  const hasText = note.trim().length > 0;

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: CREAM,
        color: INK,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom))",
        WebkitTapHighlightColor: "transparent",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <header style={{ marginTop: 8, marginBottom: 4, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.2 }}>
          Voice Note
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8a8f98" }}>
          Tap, talk, send to your inbox
        </p>
      </header>

      {/* Transcript */}
      <textarea
        value={displayText}
        onChange={(e) => {
          setNote(e.target.value);
          setInterim("");
        }}
        placeholder="Your note will appear here. You can also type or edit."
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 560,
          margin: "20px 0",
          padding: "18px",
          fontSize: 19,
          lineHeight: 1.5,
          color: INK,
          background: "#fffdf8",
          border: "1px solid #e8e2d4",
          borderRadius: 16,
          resize: "none",
          outline: "none",
          boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          fontFamily: "inherit",
        }}
      />

      {!supported && (
        <p
          style={{
            maxWidth: 560,
            fontSize: 13,
            color: CORAL,
            textAlign: "center",
            margin: "0 0 12px",
          }}
        >
          Speech recognition isn’t available in this browser. You can still type
          your note and email it. (On iPhone, open in Safari for dictation.)
        </p>
      )}

      {/* Controls */}
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          paddingBottom: 8,
        }}
      >
        {/* Big mic button */}
        <button
          type="button"
          onClick={toggleListening}
          disabled={!supported}
          aria-pressed={listening}
          style={{
            width: 104,
            height: 104,
            borderRadius: "50%",
            border: "none",
            cursor: supported ? "pointer" : "not-allowed",
            background: listening ? CORAL : "#fff",
            color: listening ? "#fff" : CORAL,
            boxShadow: listening
              ? `0 0 0 8px ${CORAL}22, 0 6px 18px ${CORAL}55`
              : "0 4px 14px rgba(0,0,0,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s, box-shadow 0.2s, transform 0.1s",
            transform: listening ? "scale(1.04)" : "scale(1)",
            opacity: supported ? 1 : 0.5,
            animation: listening ? "vn-pulse 1.4s ease-in-out infinite" : "none",
          }}
        >
          {/* Mic glyph */}
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
            <path
              d="M5 11a7 7 0 0 0 14 0"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            <path d="M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: listening ? CORAL : "#8a8f98" }}>
          {listening ? "Listening… tap to stop" : "Tap to start listening"}
        </span>

        {/* Send button */}
        <button
          type="button"
          onClick={sendNote}
          disabled={!hasText || sendState === "sending"}
          style={{
            width: "100%",
            padding: "16px",
            fontSize: 17,
            fontWeight: 700,
            color: "#fff",
            background: hasText && sendState !== "sending" ? TEAL : "#b9c2bd",
            border: "none",
            borderRadius: 14,
            cursor: hasText && sendState !== "sending" ? "pointer" : "default",
            transition: "background 0.15s",
            fontFamily: "inherit",
          }}
        >
          {sendState === "sending" ? "Sending…" : "Email this note"}
        </button>

        {statusMsg && (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              textAlign: "center",
              color:
                sendState === "error"
                  ? CORAL
                  : sendState === "sent"
                  ? TEAL
                  : "#8a8f98",
            }}
          >
            {statusMsg}
          </p>
        )}
      </div>

      <style>{`
        @keyframes vn-pulse {
          0%, 100% { box-shadow: 0 0 0 8px ${CORAL}22, 0 6px 18px ${CORAL}55; }
          50% { box-shadow: 0 0 0 16px ${CORAL}11, 0 6px 22px ${CORAL}66; }
        }
      `}</style>
    </main>
  );
}
