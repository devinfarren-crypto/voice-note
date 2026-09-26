"use client";

// Speech-to-text for lyric capture (Web Speech API, webkit-prefixed on iOS
// Safari). Final phrases are appended to the lyric text via `onFinal`; the
// in-progress phrase is exposed as `interim` so it can be shown ghosted.

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
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

export function useDictation(onFinal: (phrase: string) => void) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Tracks intent so an auto-`onend` (iOS ends the session after a pause) can
  // transparently restart while the user still wants to be listening.
  const wantListeningRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      // Capability detection can only run client-side; `supported` starts true
      // to match the SSR markup and avoid a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSupported(false);
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (e) => {
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) {
          const clean = text.trim();
          if (clean) onFinalRef.current(clean);
        } else {
          interimChunk += text;
        }
      }
      setInterim(interimChunk);
    };

    recognition.onerror = (e) => {
      // "no-speech" / "aborted" are routine on iOS — only stop for permissions.
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantListeningRef.current = false;
        setListening(false);
        setError("Microphone access was blocked. Allow it in Settings to dictate.");
      }
    };

    recognition.onend = () => {
      setInterim("");
      if (wantListeningRef.current) {
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

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setError("");
    wantListeningRef.current = true;
    setListening(true);
    try {
      recognition.start();
    } catch {
      // start() throws if it's already running — that's fine.
    }
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setListening(false);
    setInterim("");
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  return { supported, listening, interim, error, start, stop };
}
