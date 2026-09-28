// Guitar tunings, low string to high. Strings are stored as MIDI note numbers
// so capo and custom edits are just integer shifts.

export interface Tuning {
  id: string;
  name: string;
  group: string;
  strings: number[];
  /** Spell notes with flats (E♭ standard etc.). */
  flats?: boolean;
  custom?: boolean;
}

const SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midi(note: string): number {
  const m = note.match(/^([A-G])([#b]?)(\d)$/)!;
  return LETTER[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

function t(group: string, name: string, notes: string, flats = false): Tuning {
  const strings = notes.split(" ").map(midi);
  return { id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, group, strings, flats };
}

export const PRESETS: Tuning[] = [
  t("Standard & drop", "Standard", "E2 A2 D3 G3 B3 E4"),
  t("Standard & drop", "Drop D", "D2 A2 D3 G3 B3 E4"),
  t("Standard & drop", "Double drop D", "D2 A2 D3 G3 B3 D4"),
  t("Standard & drop", "Drop C", "C2 G2 C3 F3 A3 D4"),
  t("Standard & drop", "Drop B", "B1 F#2 B2 E3 G#3 C#4"),
  t("Down-tuned", "Half step down", "Eb2 Ab2 Db3 Gb3 Bb3 Eb4", true),
  t("Down-tuned", "Whole step down", "D2 G2 C3 F3 A3 D4"),
  t("Down-tuned", "Baritone (B)", "B1 E2 A2 D3 F#3 B3"),
  t("Open", "Open D", "D2 A2 D3 F#3 A3 D4"),
  t("Open", "Open D minor", "D2 A2 D3 F3 A3 D4"),
  t("Open", "Open E", "E2 B2 E3 G#3 B3 E4"),
  t("Open", "Open G", "D2 G2 D3 G3 B3 D4"),
  t("Open", "Open G minor", "D2 G2 D3 G3 Bb3 D4", true),
  t("Open", "Open A", "E2 A2 E3 A3 C#4 E4"),
  t("Open", "Open C", "C2 G2 C3 G3 C4 E4"),
  t("Open", "Open C6", "C2 A2 C3 G3 C4 E4"),
  t("Modal & folk", "DADGAD", "D2 A2 D3 G3 A3 D4"),
  t("Modal & folk", "DGDGCD", "D2 G2 D3 G3 C4 D4"),
  t("Modal & folk", "CGCGCD", "C2 G2 C3 G3 C4 D4"),
  t("Modal & folk", "CGCFCE", "C2 G2 C3 F3 C4 E4"),
  t("Modal & folk", "EADEAE", "E2 A2 D3 E3 A3 E4"),
  t("Modal & folk", "DADEAD", "D2 A2 D3 E3 A3 D4"),
  t("Other", "All fourths", "E2 A2 D3 G3 C4 F4"),
  t("Other", "New standard", "C2 G2 D3 A3 E4 G4"),
];

export function noteName(m: number, flats = false): { name: string; octave: number } {
  return { name: (flats ? FLAT : SHARP)[((m % 12) + 12) % 12], octave: Math.floor(m / 12) - 1 };
}

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** "D A D G A D" — the way players write tunings down. */
export function spell(strings: number[], flats = false): string {
  return strings.map((m) => noteName(m, flats).name).join(" ");
}

// ----- Per-device memory: his own tunings, the last one used, capo -----

const CUSTOM_KEY = "catch:tunings";
const LAST_KEY = "catch:tuner";

export function loadCustom(): Tuning[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? (JSON.parse(raw) as Tuning[]) : [];
  } catch {
    return [];
  }
}

export function saveCustom(list: Tuning[]) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function loadLast(): { id: string; capo: number } | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLast(id: string, capo: number) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ id, capo }));
  } catch {
    // ignore
  }
}
