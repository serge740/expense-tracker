/**
 * React Native's Animated and Easing, written for the browser: values that change over time (timing, loops,
 * sequences), interpolation between ranges (including strings like '0%'→'100%' and '0deg'→'360deg'), and
 * components that re-draw as their values change. Driven by requestAnimationFrame.
 */
import { createElement, forwardRef, useEffect, useReducer, useRef, type ComponentType } from 'react';
import { View, Text, Image } from './components';

// ── Easing ─────────────────────────────────────────────────────────────────────────────────────────
export type EasingFn = (t: number) => number;

function bezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = x;
    while (lo < hi) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) return t;
      if (x > v) lo = t; else hi = t;
      t = (hi - lo) / 2 + lo;
      if (hi - lo < 1e-7) break;
    }
    return t;
  };
  return x => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
}

export const Easing = {
  linear: ((t: number) => t) as EasingFn,
  ease: bezier(0.42, 0, 1, 1),
  quad: ((t: number) => t * t) as EasingFn,
  cubic: ((t: number) => t * t * t) as EasingFn,
  poly: (n: number): EasingFn => t => Math.pow(t, n),
  sin: ((t: number) => 1 - Math.cos((t * Math.PI) / 2)) as EasingFn,
  circle: ((t: number) => 1 - Math.sqrt(1 - t * t)) as EasingFn,
  exp: ((t: number) => Math.pow(2, 10 * (t - 1))) as EasingFn,
  back: (s = 1.70158): EasingFn => t => t * t * ((s + 1) * t - s),
  bounce: ((t: number) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
    if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
    t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;
  }) as EasingFn,
  elastic: (bounciness = 1): EasingFn => { const p = bounciness * Math.PI; return t => 1 - Math.pow(Math.cos((t * Math.PI) / 2), 3) * Math.cos(t * p); },
  bezier,
  in: (f: EasingFn): EasingFn => f,
  out: (f: EasingFn): EasingFn => t => 1 - f(1 - t),
  inOut: (f: EasingFn): EasingFn => t => (t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2),
};

// ── Interpolation ──────────────────────────────────────────────────────────────────────────────────
export interface InterpolationConfig {
  inputRange: number[];
  outputRange: (number | string)[];
  extrapolate?: 'extend' | 'clamp' | 'identity';
  extrapolateLeft?: 'extend' | 'clamp' | 'identity';
  extrapolateRight?: 'extend' | 'clamp' | 'identity';
  easing?: EasingFn;
}

const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

function mapNumber(x: number, cfg: InterpolationConfig, out: number[]): number {
  const { inputRange: inp } = cfg;
  const left = cfg.extrapolateLeft ?? cfg.extrapolate ?? 'extend';
  const right = cfg.extrapolateRight ?? cfg.extrapolate ?? 'extend';
  if (x < inp[0]) { if (left === 'identity') return x; if (left === 'clamp') return out[0]; }
  if (x > inp[inp.length - 1]) { if (right === 'identity') return x; if (right === 'clamp') return out[out.length - 1]; }
  let i = 1;
  while (i < inp.length - 1 && x > inp[i]) i++;
  const [a, b] = [inp[i - 1], inp[i]];
  let t = b === a ? 0 : (x - a) / (b - a);
  if (cfg.easing) t = cfg.easing(t);
  return out[i - 1] + (out[i] - out[i - 1]) * t;
}

export function interpolate(x: number, cfg: InterpolationConfig): number | string {
  const { outputRange: out } = cfg;
  if (typeof out[0] === 'number') return mapNumber(x, cfg, out as number[]);
  // Strings with numbers inside ('0%', '45deg', 'rgba(0,0,0,0.5)'): interpolate each number, keep the text around them.
  const strings = out as string[];
  const columns = strings.map(s => (s.match(NUMBER) ?? []).map(Number));
  const template = strings[0].split(NUMBER);
  let k = 0;
  return template.reduce((acc, piece, idx) => {
    if (idx === 0) return piece;
    const value = mapNumber(x, cfg, columns.map(c => c[k]));
    k++;
    return acc + String(Math.round(value * 1e4) / 1e4) + piece;
  }, '');
}

// ── Values ─────────────────────────────────────────────────────────────────────────────────────────
let nextId = 1;
type Subscriber = () => void;

interface Animatable {
  _id: number;
  getValue(): number | string;
  subscribe(fn: Subscriber): () => void;
}

export class AnimatedValue implements Animatable {
  _id = nextId++;
  private value: number;
  private subs = new Set<Subscriber>();
  _anim: { stop(): void } | null = null;
  private listeners = new Map<string, (s: { value: number }) => void>();

  constructor(v: number) { this.value = v; }
  getValue() { return this.value; }
  setValue(v: number) { this.stopAnimation(); this._set(v); }
  _set(v: number) {
    this.value = v;
    this.subs.forEach(s => s());
    this.listeners.forEach(l => l({ value: v }));
  }
  stopAnimation(cb?: (v: number) => void) { this._anim?.stop(); this._anim = null; cb?.(this.value); }
  interpolate(cfg: InterpolationConfig) { return new AnimatedInterpolation(this, cfg); }
  subscribe(fn: Subscriber) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  addListener(fn: (s: { value: number }) => void) { const id = String(nextId++); this.listeners.set(id, fn); return id; }
  removeListener(id: string) { this.listeners.delete(id); }
  removeAllListeners() { this.listeners.clear(); }
}

export class AnimatedInterpolation implements Animatable {
  _id = nextId++;
  constructor(private parent: Animatable, private cfg: InterpolationConfig) {}
  getValue() { return interpolate(Number(this.parent.getValue()), this.cfg); }
  subscribe(fn: Subscriber) { return this.parent.subscribe(fn); }
  interpolate(cfg: InterpolationConfig) { return new AnimatedInterpolation(this, cfg); }
}

const isAnimatable = (x: unknown): x is Animatable => x instanceof AnimatedValue || x instanceof AnimatedInterpolation;

/** Replaces every animated value inside a style or props object with its current number or string. */
export function resolveAnimated<T>(x: T, depth = 0): T {
  if (isAnimatable(x)) return x.getValue() as unknown as T;
  if (depth > 4 || x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map(v => resolveAnimated(v, depth + 1)) as unknown as T;
  const proto = Object.getPrototypeOf(x);
  if (proto !== Object.prototype && proto !== null) return x; // elements, DOM nodes, class instances: leave alone
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) out[k] = k === 'children' ? v : resolveAnimated(v, depth + 1);
  return out as T;
}

function collectAnimated(x: unknown, into: Animatable[] = [], depth = 0): Animatable[] {
  if (isAnimatable(x)) { into.push(x); return into; }
  if (depth > 4 || x === null || typeof x !== 'object') return into;
  if (Array.isArray(x)) { x.forEach(v => collectAnimated(v, into, depth + 1)); return into; }
  const proto = Object.getPrototypeOf(x);
  if (proto !== Object.prototype && proto !== null) return into;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) if (k !== 'children') collectAnimated(v, into, depth + 1);
  return into;
}

// ── Animations ─────────────────────────────────────────────────────────────────────────────────────
export interface EndResult { finished: boolean }
export interface CompositeAnimation {
  start(cb?: (r: EndResult) => void): void;
  stop(): void;
  reset(): void;
}

const raf = (fn: (t: number) => void) => requestAnimationFrame(fn);

function timing(value: AnimatedValue, cfg: { toValue: number; duration?: number; easing?: EasingFn; delay?: number; useNativeDriver?: boolean }): CompositeAnimation {
  const { toValue, duration = 500, easing = Easing.inOut(Easing.ease), delay = 0 } = cfg;
  let frame = 0, timer: ReturnType<typeof setTimeout> | null = null, done: ((r: EndResult) => void) | undefined;
  let from = 0;
  const finish = (finished: boolean) => { const cb = done; done = undefined; value._anim = null; cb?.({ finished }); };
  const handle = { stop() { if (timer) clearTimeout(timer); cancelAnimationFrame(frame); if (done) finish(false); } };
  return {
    start(cb) {
      value.stopAnimation();
      done = cb;
      value._anim = handle;
      const run = () => {
        from = value.getValue();
        const t0 = performance.now();
        const step = (now: number) => {
          const p = duration <= 0 ? 1 : Math.min(1, (now - t0) / duration);
          value._set(p >= 1 ? toValue : from + (toValue - from) * easing(p));
          if (p >= 1) finish(true); else frame = raf(step);
        };
        frame = raf(step);
      };
      if (delay > 0) timer = setTimeout(run, delay); else run();
    },
    stop() { handle.stop(); },
    reset() { value.setValue(from); },
  };
}

/** A gentle spring is close enough to a short ease-out for the screens that use it. */
function spring(value: AnimatedValue, cfg: { toValue: number; useNativeDriver?: boolean }): CompositeAnimation {
  return timing(value, { toValue: cfg.toValue, duration: 420, easing: Easing.out(Easing.back(1.1)) });
}

function sequence(list: CompositeAnimation[]): CompositeAnimation {
  let stopped = false;
  return {
    start(cb) {
      stopped = false;
      const run = (i: number) => {
        if (stopped) return cb?.({ finished: false });
        if (i >= list.length) return cb?.({ finished: true });
        list[i].start(r => (r.finished ? run(i + 1) : cb?.({ finished: false })));
      };
      run(0);
    },
    stop() { stopped = true; list.forEach(a => a.stop()); },
    reset() { list.forEach(a => a.reset()); },
  };
}

function parallel(list: CompositeAnimation[]): CompositeAnimation {
  return {
    start(cb) {
      let left = list.length, ok = true;
      if (!left) return cb?.({ finished: true });
      list.forEach(a => a.start(r => { ok = ok && r.finished; if (--left === 0) cb?.({ finished: ok }); }));
    },
    stop() { list.forEach(a => a.stop()); },
    reset() { list.forEach(a => a.reset()); },
  };
}

function loop(anim: CompositeAnimation, cfg: { iterations?: number } = {}): CompositeAnimation {
  const total = cfg.iterations ?? -1;
  let stopped = false;
  return {
    start(cb) {
      stopped = false;
      const run = (n: number) => {
        if (stopped) return cb?.({ finished: false });
        if (total >= 0 && n >= total) return cb?.({ finished: true });
        anim.reset();
        anim.start(r => (r.finished ? run(n + 1) : cb?.({ finished: false })));
      };
      run(0);
    },
    stop() { stopped = true; anim.stop(); },
    reset() { anim.reset(); },
  };
}

function delay(ms: number): CompositeAnimation {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    start(cb) { timer = setTimeout(() => cb?.({ finished: true }), ms); },
    stop() { if (timer) clearTimeout(timer); },
    reset() {},
  };
}

// ── Components ─────────────────────────────────────────────────────────────────────────────────────
export function createAnimatedComponent<P extends object>(Component: ComponentType<P>) {
  return forwardRef<unknown, P>(function AnimatedComponent(props, ref) {
    const [, redraw] = useReducer((n: number) => n + 1, 0);
    const watched = collectAnimated(props);
    const key = watched.map(w => w._id).join(',');
    const frame = useRef(0);
    useEffect(() => {
      const schedule = () => { if (!frame.current) frame.current = raf(() => { frame.current = 0; redraw(); }); };
      const unsubs = watched.map(w => w.subscribe(schedule));
      return () => { unsubs.forEach(u => u()); if (frame.current) cancelAnimationFrame(frame.current); frame.current = 0; };
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
    return createElement(Component as ComponentType<Record<string, unknown>>, { ...resolveAnimated(props as Record<string, unknown>), ref });
  });
}

export const Animated = {
  Value: AnimatedValue,
  timing, spring, sequence, parallel, loop, delay,
  createAnimatedComponent,
  View: createAnimatedComponent(View),
  Text: createAnimatedComponent(Text),
  Image: createAnimatedComponent(Image),
};

// Types live in the same namespace, as on the phone: Animated.Value, Animated.CompositeAnimation.
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Animated {
  type Value = AnimatedValue;
  type CompositeAnimation = import('./animated').CompositeAnimation;
}
