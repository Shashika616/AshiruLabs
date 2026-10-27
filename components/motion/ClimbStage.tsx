"use client";

import { useEffect, useRef } from "react";
import { pose, STATIONS, TOTAL_U } from "@/lib/stairs";
import { STATION_NAMES } from "@/content/site";
import type { SceneHandle, Tier } from "@/scene/createScene";
import { introActive, whenSiteOpen } from "@/lib/intro";
import { reportProgress, reportReady } from "@/lib/loading";

/**
 * Owns the one animation loop on the page.
 *
 * Scroll position maps to a point on the staircase through keyframes measured
 * from the sections themselves ([data-station]), so editing copy can never
 * desync the climb from the words: the figure walks its landing while a
 * section is read and climbs the flight in the gap between sections.
 *
 * The loop eases the figure towards that point, writes the instrument readout
 * straight to the DOM (no React renders per frame), and hands the result to
 * the WebGL scene once its chunk has loaded.
 */

type Key = { y: number; u: number; side: number };

/**
 * Steps per second. Walking is the cruising pace: a flight takes far less scroll than it
 * takes legs, so the figure is usually a little behind the page and simply keeps walking.
 * Only when it falls well behind (a fast scroll through a whole section) does it ease into
 * a light jog, capped well short of a sprint.
 */
const WALK = 1.45;
const JOG = 2.5;
const ACCEL = 1.6;
/** Steps behind at which the jog starts, and where it is fully in. */
const JOG_FROM = 11;
const JOG_FULL = 22;
/** Further than this behind, the climb cuts ahead instead of running. */
const SNAP = 30;
const SNAP_LEAD = 10;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function measure(): Key[] {
  const vh = window.innerHeight;
  const max = Math.max(1, document.documentElement.scrollHeight - vh);
  const keys: Key[] = [];
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-station]"));
  for (const el of els) {
    const i = Number(el.dataset.station);
    const side = Number(el.dataset.side ?? 0);
    const [u0, u1] = STATIONS[i] ?? [TOTAL_U, TOTAL_U];
    const top = el.getBoundingClientRect().top + window.scrollY;
    if (i === 0) {
      keys.push({ y: 0, u: 0, side }, { y: vh * 0.12, u: 0, side });
      continue;
    }
    const last = i === STATIONS.length - 1;
    const a = Math.min(max, Math.max(0, top - vh * 0.55));
    const b = last ? max : Math.min(max, top + el.offsetHeight - vh * 0.6);
    keys.push({ y: a, u: u0, side }, { y: Math.max(a + 1, b), u: u1, side });
  }
  keys.sort((p, q) => p.y - q.y);
  return keys;
}

function sample(keys: Key[], y: number) {
  if (!keys.length) return { u: 0, side: 1 };
  if (y <= keys[0].y) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (y <= b.y) {
      const a = keys[i - 1];
      const t = (y - a.y) / Math.max(1, b.y - a.y);
      const e = t * t * (3 - 2 * t);
      return { u: a.u + (b.u - a.u) * t, side: a.side + (b.side - a.side) * e };
    }
  }
  return keys[keys.length - 1];
}

function nearestStation(u: number) {
  let best = 0;
  let dist = Infinity;
  STATIONS.forEach(([a, b], i) => {
    const d = u < a ? a - u : u > b ? u - b : 0;
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

function pickTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  return small || weak ? "low" : "high";
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function ClimbStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elevRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let keys = measure();
    let scene: SceneHandle | null = null;
    let raf = 0;
    let alive = true;
    let u = sample(keys, window.scrollY).u;
    let side = sample(keys, window.scrollY).side;
    let last = performance.now();
    const t0 = last;
    let introStart = 0;
    let lastScroll = last;
    let frameSkip = 0;
    let shownElev = "";
    let shownStation = -1;
    let shownTrend = 0;
    let vel = 0;

    const topY = pose(TOTAL_U).pos.y;

    // The cursor, for the figure to follow with her eyes. Mouse only; it goes stale after a few
    // quiet seconds and she looks back at the viewer.
    const cursor = { x: 0, y: 0, at: -Infinity };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      cursor.x = (e.clientX / window.innerWidth) * 2 - 1;
      cursor.y = -(e.clientY / window.innerHeight) * 2 + 1;
      cursor.at = performance.now();
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const writeHud = (station: number, elev: number, trend: number) => {
      const e = elev.toFixed(2).padStart(5, "0");
      if (e !== shownElev) {
        shownElev = e;
        if (elevRef.current) elevRef.current.textContent = e;
        if (needleRef.current) needleRef.current.style.transform = `translate3d(0, ${(-elev / topY) * 100}%, 0)`;
        if (railRef.current) railRef.current.style.transform = `scaleY(${Math.max(0.02, elev / topY)})`;
      }
      if (station !== shownStation) {
        shownStation = station;
        if (nameRef.current) nameRef.current.textContent = STATION_NAMES[station];
        if (mobileRef.current) mobileRef.current.textContent = STATION_NAMES[station];
      }
      if (trend !== shownTrend) {
        shownTrend = trend;
        if (trendRef.current) trendRef.current.dataset.trend = trend > 0 ? "up" : trend < 0 ? "down" : "hold";
      }
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = sample(keys, window.scrollY);
      if (still) {
        // Cut between landings instead of travelling: the scene changes with the section, never moves.
        const s = nearestStation(target.u);
        u = STATIONS[s][0];
        side = target.side;
      } else {
        // The figure is a walker, not a cursor: it accelerates, walks for ordinary scrolling,
        // eases into a light jog only when it falls well behind, and never goes faster. A long jump (a nav click) cuts most of the way and
        // jogs the rest, rather than sprinting the whole staircase.
        const gap = target.u - u;
        if (Math.abs(gap) > SNAP) {
          u = target.u - Math.sign(gap) * SNAP_LEAD;
          vel = Math.sign(gap) * WALK;
        }
        // Brake early enough to stop on the mark: never faster than the stopping distance allows.
        const left = Math.abs(target.u - u);
        const cruise = WALK + (JOG - WALK) * smooth(JOG_FROM, JOG_FULL, left);
        const want = Math.sign(target.u - u) * Math.min(cruise, Math.sqrt(2 * ACCEL * 0.85 * left), left * 3);
        const step = ACCEL * dt;
        vel += Math.max(-step, Math.min(step, want - vel));
        u += vel * dt;
        const k = 1 - Math.exp(-dt * 4.2);
        side += (target.side - side) * k;
      }
      if (Math.abs(target.u - u) > 0.002 || Math.abs(vel) > 0.01) lastScroll = now;

      const p = pose(u);
      writeHud(nearestStation(u), p.pos.y, Math.abs(vel) < 0.08 ? 0 : Math.sign(vel));

      // Nothing to draw yet, or the intro is covering the stage: spend nothing on it.
      if (!scene || covered) return;
      // Idle: halve the frame rate. The glints still twinkle, the battery is spared.
      const idle = now - Math.max(lastScroll, cursor.at) > 2200 && (now - introStart) / 1000 > 2.6;
      if (idle && frameSkip++ % 2 === 1) return;
      const intro = still ? 1 : Math.min(1, Math.max(0, now - introStart) / 2400);
      const e = 1 - Math.pow(1 - intro, 4);
      scene.frame({
        u,
        velocity: vel,
        dt: idle ? dt * 2 : dt,
        time: still ? 0 : (now - t0) / 1000,
        side,
        intro: e,
        still,
        pointer: !still && now - cursor.at < 4000 ? cursor : null,
      });
    };

    const onResize = () => {
      keys = measure();
      scene?.resize(window.innerWidth, window.innerHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(document.body);
    window.addEventListener("resize", onResize, { passive: true });
    document.fonts?.ready.then(onResize).catch(() => {});

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(tick);

    // While the keyboard intro is up the scene loads but does not render; the camera's opening
    // dolly is held back to play as the site opens.
    let covered = introActive();
    const stopWaiting = whenSiteOpen(() => {
      covered = false;
      introStart = performance.now();
      lastScroll = introStart;
    });

    const boot = () => {
      if (!alive) return;
      if (!webglAvailable()) return reportReady();
      reportProgress(0.06);
      // The summit sign is drawn in the display face, so let the fonts land first.
      Promise.all([import("@/scene/createScene"), document.fonts?.ready.catch(() => {})])
        .then(([mod]) => mod)
        .then(({ createScene }) => {
          if (!alive) return;
          reportProgress(0.22);
          scene = createScene(
            canvas,
            pickTier(),
            { body: "/models/human.glb", motion: "/models/motion.glb" },
            { onProgress: (p) => reportProgress(0.22 + 0.76 * p), onReady: reportReady },
          );
          scene.resize(window.innerWidth, window.innerHeight);
          if (!covered) introStart = performance.now();
          lastScroll = performance.now();
          canvas.dataset.live = "true";
          canvas.addEventListener("webglcontextlost", () => {
            scene = null;
            canvas.dataset.live = "false";
          });
        })
        .catch(() => reportReady());
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(boot, { timeout: 900 });
    else setTimeout(boot, 120);

    return () => {
      alive = false;
      stopWaiting();
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      scene?.dispose();
    };
  }, []);

  return (
    <>
      <div className="stage" aria-hidden="true">
        <canvas ref={canvasRef} className="stage-canvas" />
        <div className="stage-grid" />
        <div className="stage-vignette" />
      </div>

      <div className="rail" aria-hidden="true">
        <div ref={railRef} className="rail-fill" />
      </div>

      <aside className="gauge" aria-hidden="true">
        <div className="gauge-read">
          <span className="gauge-label">ELEV</span>
          <span className="gauge-value">
            <span ref={elevRef}>00.00</span>
            <span className="gauge-unit">m</span>
          </span>
          <span ref={trendRef} className="gauge-trend" data-trend="hold">
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M5 1.5 L8.5 7.5 H1.5 Z" />
            </svg>
          </span>
        </div>
        <div className="gauge-scale">
          <div ref={needleRef} className="gauge-needle" />
        </div>
        <div className="gauge-station">
          <span ref={nameRef}>{STATION_NAMES[0]}</span>
        </div>
      </aside>

      <div className="gauge-mobile" aria-hidden="true">
        <span ref={mobileRef}>{STATION_NAMES[0]}</span>
      </div>
    </>
  );
}
