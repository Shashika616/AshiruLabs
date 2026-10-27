/**
 * Load progress for the 3D scene, shared by everything that shows it: the intro's loader,
 * the stage skeleton and the stage loader. Progress only ever moves forward.
 */
export type LoadState = { progress: number; ready: boolean };

const state: LoadState = { progress: 0, ready: false };
const subscribers = new Set<(s: LoadState) => void>();

const emit = () => subscribers.forEach((fn) => fn(state));

export function reportProgress(p: number) {
  if (state.ready || p <= state.progress) return;
  state.progress = Math.min(0.99, p);
  emit();
}

export function reportReady() {
  if (state.ready) return;
  state.ready = true;
  state.progress = 1;
  emit();
}

export function onLoad(fn: (s: LoadState) => void) {
  subscribers.add(fn);
  fn(state);
  return () => {
    subscribers.delete(fn);
  };
}
