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

/**
 * Tuner-grade detector for plucked strings. Uses normalised autocorrelation
 * and takes the *first* peak close to the strongest one (McLeod-style), which
 * avoids the octave slips that strong string harmonics cause. Reaches down to
 * ~55Hz for drop B / baritone tunings. Expects a buffer already downsampled
 * to keep the work cheap on a phone.
 */
export function detectStringPitch(
  buf: Float32Array,
  sampleRate: number,
  minHz = 55,
  maxHz = 1000
): { freq: number; clarity: number } | null {
  const size = buf.length;
  let energy = 0;
  for (let i = 0; i < size; i++) energy += buf[i] * buf[i];
  if (Math.sqrt(energy / size) < 0.003) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(size * 0.66));

  // NSDF: 2·r(τ) / (m(τ)), bounded to [-1, 1].
  const nsdf = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let acf = 0;
    let m = 0;
    for (let i = 0; i < size - lag; i++) {
      const a = buf[i];
      const b = buf[i + lag];
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[lag] = m ? (2 * acf) / m : 0;
  }

  // Collect local maxima after the first zero crossing.
  let lag = minLag;
  while (lag <= maxLag && nsdf[lag] > 0) lag++;
  const peaks: number[] = [];
  let globalMax = 0;
  for (; lag <= maxLag; lag++) {
    if (nsdf[lag] > 0 && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] > nsdf[lag + 1]) {
      peaks.push(lag);
      if (nsdf[lag] > globalMax) globalMax = nsdf[lag];
    }
  }
  if (!peaks.length || globalMax < 0.8) return null;

  const chosen = peaks.find((p) => nsdf[p] >= 0.88 * globalMax)!;
  const a = nsdf[chosen - 1];
  const b = nsdf[chosen];
  const c = nsdf[chosen + 1];
  const denom = a - 2 * b + c;
  const shift = denom ? (0.5 * (a - c)) / denom : 0;
  return { freq: sampleRate / (chosen + shift), clarity: b };
}
