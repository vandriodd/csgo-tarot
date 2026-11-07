/**
 * Tiny synthesized sound kit (no audio files). Everything is generated with WebAudio
 * so the page stays light. Call `unlock()` from a user gesture before playing.
 */

const STORAGE_KEY = 'csgo-tarot.muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambience: { stop: () => void } | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.8, ctx.currentTime, 0.1);
}

export function unlock() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function noiseBuffer(seconds: number) {
  const buf = ctx!.createBuffer(1, ctx!.sampleRate * seconds, ctx!.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function ready() {
  return ctx && master && !muted;
}

/** Short typewriter tick. */
export function blip(pitch = 1) {
  if (!ready()) return;
  const t = ctx!.currentTime;
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.type = 'square';
  o.frequency.value = (180 + Math.random() * 40) * pitch;
  g.gain.setValueAtTime(0.035, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + 0.06);
}

/** Card sliding over cloth. */
export function swish(duration = 0.22, gain = 0.25) {
  if (!ready()) return;
  const t = ctx!.currentTime;
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuffer(duration);
  const f = ctx!.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(1800, t);
  f.frequency.exponentialRampToValueAtTime(700, t + duration);
  f.Q.value = 0.8;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + duration * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(f).connect(g).connect(master!);
  src.start(t);
}

/** Paper snap when a card is turned. */
export function flip() {
  if (!ready()) return;
  swish(0.12, 0.35);
  const t = ctx!.currentTime + 0.1;
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuffer(0.05);
  const f = ctx!.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 2500;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(f).connect(g).connect(master!);
  src.start(t);
}

/** Low mystical chime for a reveal. */
export function chime(reversed = false) {
  if (!ready()) return;
  const t = ctx!.currentTime;
  const base = reversed ? 220 : 330;
  [1, 1.5, 2.01].forEach((m, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'sine';
    o.frequency.value = base * m * (reversed && i === 1 ? 0.94 : 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.02 + i * 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g).connect(master!);
    o.start(t);
    o.stop(t + 1.7);
  });
}

/** UI click, like a buy-menu button. */
export function click() {
  if (!ready()) return;
  const t = ctx!.currentTime;
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(400, t + 0.04);
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + 0.07);
}

/** Bawk. */
export function chicken() {
  if (!ready()) return;
  const t = ctx!.currentTime;
  [0, 0.13].forEach((d, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(i ? 700 : 520, t + d);
    o.frequency.exponentialRampToValueAtTime(i ? 1100 : 380, t + d + 0.1);
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.07, t + d + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.12);
    const f = ctx!.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1200;
    o.connect(f).connect(g).connect(master!);
    o.start(t + d);
    o.stop(t + d + 0.14);
  });
}

/** Room tone: low drone plus distant wind through the door. */
export function startAmbience() {
  if (!ctx || !master || ambience) return;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.5, t + 3);
  out.connect(master);

  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 55;
  const dg = ctx.createGain();
  dg.gain.value = 0.05;
  drone.connect(dg).connect(out);

  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuffer(4);
  wind.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'lowpass';
  wf.frequency.value = 400;
  const wg = ctx.createGain();
  wg.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.03;
  lfo.connect(lfoGain).connect(wg.gain);
  wind.connect(wf).connect(wg).connect(out);

  drone.start();
  wind.start();
  lfo.start();
  ambience = {
    stop: () => {
      out.gain.setTargetAtTime(0.0001, ctx!.currentTime, 0.5);
      setTimeout(() => [drone, wind, lfo].forEach((n) => n.stop()), 2000);
      ambience = null;
    },
  };
}

/** Muffled footstep on stone. */
export function step() {
  if (!ready()) return;
  const t = ctx!.currentTime;
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuffer(0.12);
  const f = ctx!.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 260 + Math.random() * 80;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  src.connect(f).connect(g).connect(master!);
  src.start(t);
}
