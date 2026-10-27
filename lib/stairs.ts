/**
 * The staircase, as pure geometry.
 *
 * Shared by the WebGL scene (which draws it) and the HUD (which reads the
 * figure's elevation off it), so the instrument and the picture can never
 * disagree. Units are metres: a rise of 0.17 and a run of 0.29 are the
 * proportions of a real stair, which is why the climbing figure reads as a
 * person rather than a toy.
 *
 * The path parameter `u` is measured in steps. Flights cost one unit per
 * tread; landings cost a few units of flat walking. Station i (one per page
 * section) sits on landing i-1, and the summit is the last landing.
 */

export const RISE = 0.17;
export const RUN = 0.29;
export const STEPS = 12; // treads per flight, the last one is the landing
export const WIDTH = 1.45; // tread width, along z
export const DEPTH = 1.75; // each flight sits this far behind the last
export const FLIGHTS = 5;
export const LANDING_UNITS = 4;
export const SUMMIT_UNITS = 2.4;
export const LANDING_OUT = 0.95;
const START_X = -1.7;
const PAD_BACK = 0.75;
const PAD_UNITS = 2;

export type Vec3 = { x: number; y: number; z: number };

type Flight = { kind: "flight"; u0: number; len: number; s: Vec3; dir: 1 | -1 };
type Landing = {
  kind: "landing";
  u0: number;
  len: number;
  a: Vec3;
  c1: Vec3;
  c2: Vec3;
  b: Vec3;
  /** The few paces across the base pad before the first step: walked, but not a station. */
  pad?: boolean;
};
type Segment = Flight | Landing;

export type Pose = {
  pos: Vec3;
  /** Unit tangent of travel in the xz plane, in the direction of increasing u. */
  tx: number;
  tz: number;
  /** 1 on a flight, 0 walking a landing. */
  climb: number;
};

function bez(a: number, b: number, c: number, d: number, t: number) {
  const m = 1 - t;
  return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d;
}
function bezD(a: number, b: number, c: number, d: number, t: number) {
  const m = 1 - t;
  return 3 * m * m * (b - a) + 6 * m * t * (c - b) + 3 * t * t * (d - c);
}

function build() {
  const segs: Segment[] = [];
  let u = 0;
  let s: Vec3 = { x: START_X, y: 0, z: 0 };
  // Start standing on the pad, a pace back from the first tread rather than straddling it.
  const from: Vec3 = { x: START_X - PAD_BACK, y: 0, z: 0 };
  segs.push({
    kind: "landing",
    u0: 0,
    len: PAD_UNITS,
    a: from,
    c1: { x: from.x + PAD_BACK / 3, y: 0, z: 0 },
    c2: { x: from.x + (2 * PAD_BACK) / 3, y: 0, z: 0 },
    b: s,
    pad: true,
  });
  u += PAD_UNITS;
  let dir: 1 | -1 = 1;
  for (let k = 0; k < FLIGHTS; k++) {
    segs.push({ kind: "flight", u0: u, len: STEPS, s, dir });
    u += STEPS;
    const e: Vec3 = { x: s.x + dir * STEPS * RUN, y: s.y + STEPS * RISE, z: s.z };
    const summit = k === FLIGHTS - 1;
    if (summit) {
      // Walk out onto the summit and stop facing the portal.
      const b = { x: e.x + dir * 0.55, y: e.y, z: e.z - 1.25 };
      segs.push({
        kind: "landing",
        u0: u,
        len: SUMMIT_UNITS,
        a: e,
        c1: { x: e.x + dir * 0.55, y: e.y, z: e.z },
        c2: { x: b.x, y: e.y, z: e.z - 0.6 },
        b,
      });
      u += SUMMIT_UNITS;
    } else {
      // A U-turn across the landing to the next flight, one depth further back.
      // The next flight's first tread starts where the landing does.
      const z2 = e.z - DEPTH;
      const b = { x: e.x - dir * RUN, y: e.y, z: z2 };
      segs.push({
        kind: "landing",
        u0: u,
        len: LANDING_UNITS,
        a: e,
        c1: { x: e.x + dir * 0.85, y: e.y, z: e.z },
        c2: { x: e.x + dir * 0.85, y: e.y, z: z2 },
        b,
      });
      u += LANDING_UNITS;
      s = b;
      dir = (dir === 1 ? -1 : 1) as 1 | -1;
    }
  }
  return { segs, total: u };
}

export const PATH = build();
export const TOTAL_U = PATH.total;

/** Station u ranges: [start, end] of the stretch the figure walks while a section is read. */
export const STATIONS: [number, number][] = (() => {
  const out: [number, number][] = [[0, 0]];
  for (const seg of PATH.segs) if (seg.kind === "landing" && !seg.pad) out.push([seg.u0, seg.u0 + seg.len]);
  return out;
})();

/** Elevation of each station in metres, for markup that is rendered on the server. */
export const STATION_ELEVATION = STATIONS.map((_, i) => i * STEPS * RISE);

export function pose(u: number): Pose {
  const uu = Math.min(Math.max(u, 0), TOTAL_U);
  let seg = PATH.segs[PATH.segs.length - 1];
  for (const s of PATH.segs) {
    if (uu <= s.u0 + s.len) {
      seg = s;
      break;
    }
  }
  const t = Math.min(Math.max((uu - seg.u0) / seg.len, 0), 1);
  if (seg.kind === "flight") {
    const d = t * seg.len;
    return {
      pos: { x: seg.s.x + seg.dir * d * RUN, y: seg.s.y + d * RISE, z: seg.s.z },
      tx: seg.dir,
      tz: 0,
      climb: 1,
    };
  }
  const { a, c1, c2, b } = seg;
  const dx = bezD(a.x, c1.x, c2.x, b.x, t);
  const dz = bezD(a.z, c1.z, c2.z, b.z, t);
  const n = Math.hypot(dx, dz) || 1;
  return {
    pos: { x: bez(a.x, c1.x, c2.x, b.x, t), y: a.y, z: bez(a.z, c1.z, c2.z, b.z, t) },
    tx: dx / n,
    tz: dz / n,
    climb: 0,
  };
}

/** Every box the scene draws: treads, landings, the base pad and a flight falling away below it. */
export type Box = { cx: number; cy: number; cz: number; sx: number; sy: number; sz: number; tread: boolean; nose: number };

export const TREAD_T = 0.075;

export function boxes(): Box[] {
  const out: Box[] = [];
  for (const seg of PATH.segs) {
    if (seg.kind === "landing" && seg.pad) continue;
    if (seg.kind === "flight") {
      for (let j = 0; j < STEPS - 1; j++) {
        out.push({
          cx: seg.s.x + seg.dir * (j + 0.5) * RUN,
          cy: seg.s.y + (j + 1) * RISE - TREAD_T / 2,
          cz: seg.s.z,
          sx: RUN * 0.96,
          sy: TREAD_T,
          sz: WIDTH,
          tread: true,
          nose: -seg.dir,
        });
      }
      continue;
    }
    const isSummit = seg.len === SUMMIT_UNITS;
    const dir = Math.sign(seg.c1.x - seg.a.x) || 1;
    const x0 = seg.a.x - dir * RUN;
    const x1 = seg.a.x + dir * (isSummit ? 1.6 : LANDING_OUT);
    const z0 = seg.a.z + WIDTH / 2;
    const z1 = isSummit ? seg.a.z - 3.4 : seg.b.z - WIDTH / 2;
    out.push({
      cx: (x0 + x1) / 2,
      cy: seg.a.y - TREAD_T / 2,
      cz: (z0 + z1) / 2,
      sx: Math.abs(x1 - x0),
      sy: TREAD_T,
      sz: Math.abs(z1 - z0),
      tread: false,
      nose: -dir,
    });
  }
  // The base pad the figure starts on, and a flight that keeps going down into the dark.
  out.push({ cx: START_X - 0.8, cy: -TREAD_T / 2, cz: 0, sx: 1.6, sy: TREAD_T, sz: WIDTH, tread: false, nose: 1 });
  for (let j = 1; j <= 12; j++) {
    out.push({
      cx: START_X - 1.6 - (j - 0.5) * RUN,
      cy: -j * RISE - TREAD_T / 2,
      cz: 0,
      sx: RUN * 0.96,
      sy: TREAD_T,
      sz: WIDTH,
      tread: true,
      nose: -1,
    });
  }
  return out;
}

/** Where the summit portal stands. */
export function summitPortal(): Vec3 {
  const last = PATH.segs[PATH.segs.length - 1] as Landing;
  return { x: last.b.x, y: last.b.y, z: last.b.z - 1.5 };
}

/**
 * Height of the glass top under a point, for planting feet. Only surfaces no higher than
 * `yMax` count, so a foot finds the tread it is standing on, not the one above its head.
 */
let cache: Box[] | null = null;
export function surfaceAt(x: number, z: number, yMax: number): number | null {
  cache ??= boxes();
  let best = -Infinity;
  for (const b of cache) {
    if (Math.abs(x - b.cx) > b.sx / 2 + 0.03 || Math.abs(z - b.cz) > b.sz / 2 + 0.03) continue;
    const top = b.cy + b.sy / 2;
    if (top <= yMax && top > best) best = top;
  }
  return best === -Infinity ? null : best;
}
