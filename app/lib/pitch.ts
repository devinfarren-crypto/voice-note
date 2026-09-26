// Monophonic pitch detection by autocorrelation — good enough to show which
// note is being hummed or sung while a melody is being captured.

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/** Returns the fundamental frequency in Hz, or null for silence/noise. */
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.012) return null;

  // Only consider lags for ~70Hz–1100Hz (low male voice to high whistle).
  const minLag = Math.floor(sampleRate / 1100);
  const maxLag = Math.min(Math.floor(sampleRate / 70), size - 1);

  let bestLag = -1;
  let bestCorr = 0;
  const corr = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < size - lag; i++) sum += buf[i] * buf[i + lag];
    corr[lag] = sum;
    if (sum > bestCorr) {
      bestCorr = sum;
      bestLag = lag;
    }
  }
  if (bestLag <= minLag || bestLag >= maxLag) return null;

  // Reject weak periodicity (breath, consonants, room noise).
  let energy = 0;
  for (let i = 0; i < size; i++) energy += buf[i] * buf[i];
  if (bestCorr / energy < 0.5) return null;

  // Parabolic interpolation around the peak for sub-sample accuracy.
  const a = corr[bestLag - 1];
  const b = corr[bestLag];
  const c = corr[bestLag + 1];
  const denom = a - 2 * b + c;
  const shift = denom ? (0.5 * (a - c)) / denom : 0;
  return sampleRate / (bestLag + shift);
}

export interface NoteReading {
  name: string;
  octave: number;
  /** Cents off from the nearest equal-tempered note, -50..50. */
  cents: number;
}

export function frequencyToNote(freq: number): NoteReading {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const nearest = Math.round(midi);
  return {
    name: NOTE_NAMES[((nearest % 12) + 12) % 12],
    octave: Math.floor(nearest / 12) - 1,
    cents: Math.round((midi - nearest) * 100),
  };
}
