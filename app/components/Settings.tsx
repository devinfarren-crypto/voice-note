"use client";

// His own little settings sheet, opened by tapping his face in the header.

import { useEffect, useState } from "react";
import { getNightPref, setNightPref, type NightPref } from "../lib/useNight";
import { useRecipient } from "./RecipientProvider";
import { TruckIcon } from "./icons";

const NIGHT_OPTIONS: { value: NightPref; label: string }[] = [
  { value: "auto", label: "After 10pm" },
  { value: "on", label: "Always" },
  { value: "off", label: "Never" },
];

export default function Settings({
  onClose,
  onTruck,
  onCard,
}: {
  onClose: () => void;
  onTruck: () => void;
  onCard: () => void;
}) {
  const [night, setNight] = useState<NightPref>("auto");
  const { recipient, change } = useRecipient();

  useEffect(() => {
    // Saved on the phone, so read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNight(getNightPref());
  }, []);

  const pickNight = (v: NightPref) => {
    setNight(v);
    setNightPref(v);
  };

  return (
    <div
      className="gift"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="settings">
        <header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="justin-sketch.jpg" alt="" />
          <h2 id="settings-title">Your stuff</h2>
          <button type="button" className="chip-btn" onClick={onClose}>
            Done
          </button>
        </header>

        <section>
          <h3>Shed hours</h3>
          <p>Dim, warm lights and a bare bulb, for writing late.</p>
          <div className="segmented" role="radiogroup" aria-label="Shed hours">
            {NIGHT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={night === o.value}
                onClick={() => pickNight(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Emailed takes go to</h3>
          <div className="row">
            <span className="value">{recipient ? recipient.email : "Nowhere yet"}</span>
            <button type="button" className="chip-btn" onClick={change}>
              {recipient ? "Change" : "Choose"}
            </button>
          </div>
        </section>

        <section>
          <h3>Truck mode</h3>
          <p>One giant button that records the moment Catch opens. Stays on until you climb out.</p>
          <button type="button" className="chip-btn primary wide" onClick={onTruck}>
            <TruckIcon size={20} /> Get in the truck
          </button>
        </section>

        <section>
          <button type="button" className="chip-btn ghost wide" onClick={onCard}>
            Read Devin&apos;s note again
          </button>
        </section>
      </div>
    </div>
  );
}
