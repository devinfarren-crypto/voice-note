"use client";

import { useEffect, useState } from "react";

// A one-time note shown the first time the app is opened. Edit the words here.
const TO = "Justin";
const FROM = "Devin";
const SEEN_KEY = "catch:birthday-seen";

export default function BirthdayCard({ forceOpen, onClose }: { forceOpen: boolean; onClose: () => void }) {
  const [firstVisit, setFirstVisit] = useState(false);

  useEffect(() => {
    try {
      // First-launch detection needs localStorage, which only exists client-side.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(SEEN_KEY)) setFirstVisit(true);
    } catch {
      // Storage blocked — skip the card rather than show it every time.
    }
  }, []);

  if (!firstVisit && !forceOpen) return null;

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
    setFirstVisit(false);
    onClose();
  };

  return (
    <div className="gift" role="dialog" aria-modal="true" aria-labelledby="gift-title">
      <div className="gift-card">
        <figure className="polaroid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="justin-truck.jpg" alt={`${TO} standing in the bed of his yellow Toyota pickup`} />
          <figcaption>all things born in ’82</figcaption>
        </figure>
        <div className="eyebrow">Happy birthday</div>
        <h2 id="gift-title">For the ones that show up uninvited, {TO}.</h2>
        <p>
          The line in the truck. The melody in the shower. The chorus at 2&nbsp;a.m. in the shed.
          Tap once and catch it before it&apos;s gone.
        </p>
        <div className="sig">Love, {FROM}</div>
        <button type="button" onClick={close}>
          Catch
        </button>
      </div>
    </div>
  );
}
