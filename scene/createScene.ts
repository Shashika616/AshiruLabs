/**
 * The climb: glass treads, a lit figure, and a camera that follows it.
 *
 * Loaded as its own chunk after first paint, so three.js never sits on the
 * critical path. Everything is generated in code: no textures, models or
 * images are downloaded. Glow is faked with additive sprites and edge lines
 * rather than a bloom pass, which keeps the whole frame to a handful of draw
 * calls and holds 60fps on mid-range phones.
 */
import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Material,
  MathUtils,
  Matrix4,
  Mesh,
  ImageBitmapLoader,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  NoColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
  ACESFilmicToneMapping,
} from "three";
import { boxes, pose, STATIONS, summitPortal, surfaceAt, type Box } from "@/lib/stairs";
import { loadClimber, type Climber } from "./climber";

export type Tier = "high" | "low";

export type FrameInput = {
  u: number;
  /** Path units per second, signed. Drives the gait and which way the figure faces. */
  velocity: number;
  dt: number;
  time: number;
  /** Where the figure should sit on screen: -1 left, 0 centre, 1 right. */
  side: number;
  /** 0 → 1 over the opening dolly. */
  intro: number;
  /** The cursor in normalised device coordinates, or null when there is none to follow. */
  pointer: { x: number; y: number } | null;
  /** Hold the camera rigid and the figure still (reduced motion). */
  still: boolean;
};

export type SceneHandle = {
  frame(input: FrameInput): void;
  resize(width: number, height: number): void;
  dispose(): void;
};

const BG = 0x0d1b2a;
const FOG = 0.052;
const TIEHERE_BLUE = new Color(0x3b8dff);
const TIEHERE_GREEN = new Color(0x34c24c);
/* The palette, in light: glacier glass, a cool rim, and ember only where the climb ends. */
const GLASS = new Color(0x778da9);
const NOSE = new Color(0xedf2f4);
const GLINT = new Color(0xedf2f4);
const RIM = new Color(0x9fb3cc);
const TIEHERE_STATION = 2;

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const radial = () =>
  canvasTexture(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.35, "rgba(255,255,255,0.35)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });

/* ---------------------------------------------------------------- glass
   Anime glass, drawn the way a background artist paints it rather than the
   way a renderer simulates it: flat cel tones (lit tops, darker sides), a
   crisp ink line round every edge, and two hard diagonal highlight streaks
   across each top. Lines are measured in world units from the nearest face
   edge and antialiased with screen derivatives, so they stay crisp at any
   distance. Drawn additively, so far edges show through near slabs. */

const GLASS_VERT = /* glsl */ `
  varying vec3 vP;
  varying vec3 vH;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vP = position * sc;
    vH = sc * 0.5;
    vN = normal;
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const GLASS_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSide;
  uniform vec3 uLight;
  uniform float uShine;
  uniform float uFog;
  varying vec3 vP;
  varying vec3 vH;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec3 e = max(vH - abs(vP), 0.0);
    vec3 n = normalize(vN);
    float d;
    vec2 q;
    vec2 h;
    if (abs(n.x) > 0.5) { d = min(e.y, e.z); q = vP.zy; h = vH.zy; }
    else if (abs(n.y) > 0.5) { d = min(e.x, e.z); q = vP.xz; h = vH.xz; }
    else { d = min(e.x, e.y); q = vP.xy; h = vH.xy; }
    float top = step(0.5, n.y);
    float bottom = step(0.5, -n.y);
    float side = 1.0 - top - bottom;

    // The ink line: a hard edge, antialiased by one pixel.
    float aa = fwidth(d);
    float w = max(0.0055, aa * 1.1);
    float line = (1.0 - smoothstep(w, w + aa * 1.5, d)) * min(1.0, 0.0055 / w + 0.35);
    // Flat cel fills: steel-blue tops catch the light, slate sides hold the shade.
    vec3 tone = uColor * top * 0.42 + uSide * side * 0.36 + uSide * bottom * 0.12;
    // Two hard diagonal streaks of reflected light across each top.
    vec2 uv = q / max(h, vec2(1e-3));
    float g = uv.x * 0.8 + uv.y * 0.6;
    float ga = max(fwidth(g), 1e-4);
    float streak = (smoothstep(-0.05 - ga, -0.05, g) - smoothstep(0.2, 0.2 + ga, g)) * 0.42
                 + (smoothstep(0.32 - ga, 0.32, g) - smoothstep(0.4, 0.4 + ga, g)) * 0.3;
    streak *= top;

    // A pool of light around the climber, in two tones with a soft seam between them.
    float lit = 0.55 + 0.8 * (1.0 - smoothstep(1.5, 2.4, distance(vW, uLight)));
    float fog = exp(-pow(uFog * distance(vW, cameraPosition), 2.0));
    vec3 rgb = (tone + vec3(0.88, 0.92, 0.95) * streak + vec3(0.93, 0.95, 0.96) * line) * lit * fog;
    // The shine: a band of light running up the stair, as light catches a cut stone. Edges
    // flare, the tops take a raking sheen. Off (uShine far below the stair) between sweeps.
    float band = exp(-pow((vW.y - uShine) / 0.6, 2.0));
    float rake = 0.5 + 0.5 * sin((vW.x + vW.z) * 7.0 - vW.y * 5.0);
    rgb += vec3(0.95, 0.97, 1.0) * band * (line * 1.7 + top * (0.2 + 0.35 * rake) + side * 0.08) * fog;
    float a = max(rgb.r, max(rgb.g, rgb.b));
    gl_FragColor = vec4(rgb, a);
  }
`;

/* ---------------------------------------------------------------- points */

const GLINT_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  uniform float uTime;
  uniform float uPR;
  uniform float uFog;
  uniform float uShine;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float flare = exp(-pow((position.y - uShine) / 0.5, 2.0));
    // A slow shimmer, never a hard blink: a full flash read as flicker.
    float tw = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * (0.22 + aPhase * 0.3) + aPhase * 6.2831), 3.0);
    float d = -mv.z;
    tw = max(tw, flare);
    vA = tw * exp(-pow(uFog * d, 2.0));
    gl_PointSize = aSize * uPR * (0.25 + tw + flare * 0.8) * (26.0 / d);
  }
`;
const GLINT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = exp(-d * d * 140.0) + exp(-d * d * 18.0) * 0.18;
    float h = max(0.0, 1.0 - abs(c.y) * 44.0) * pow(max(0.0, 1.0 - abs(c.x) * 2.0), 2.2);
    float v = max(0.0, 1.0 - abs(c.x) * 44.0) * pow(max(0.0, 1.0 - abs(c.y) * 2.0), 2.2);
    vec2 r = vec2(c.x + c.y, c.x - c.y) * 0.7071;
    float x = max(0.0, 1.0 - abs(r.y) * 60.0) * pow(max(0.0, 1.0 - abs(r.x) * 3.2), 3.0)
            + max(0.0, 1.0 - abs(r.x) * 60.0) * pow(max(0.0, 1.0 - abs(r.y) * 3.2), 3.0);
    float a = (core + (h + v) * 0.9 + x * 0.35) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`;
const DUST_VERT = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uPR;
  uniform float uFog;
  varying float vA;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.07 + aPhase * 40.0) * 0.35;
    p.y += sin(uTime * 0.05 + aPhase * 17.0) * 0.25;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = -mv.z;
    vA = (0.25 + 0.75 * fract(aPhase * 7.3)) * exp(-pow(uFog * d, 2.0)) * smoothstep(0.4, 2.0, d);
    gl_PointSize = uPR * (1.0 + fract(aPhase * 13.1) * 1.6) * (9.0 / d);
  }
`;
const DUST_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vA * 0.55;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vec3(a), a);
  }
`;

/* ---------------------------------------------------------------- sign
   Illuminated letters in the anime-city manner: every letter is its own light. The word is
   rasterised once in the site's display face (a face channel and a blurred halo channel), and
   the shader works out which letter each pixel belongs to from the measured letter edges, so
   every letter strikes on, hums, stutters and occasionally drops out on its own timeline. */

const MAX_LETTERS = 16;
const SIGN_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uReveal;
  uniform float uEdges[${MAX_LETTERS + 1}];
  uniform float uCount;
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
  float letterAt(float x) {
    float idx = 0.0;
    for (int i = 1; i < ${MAX_LETTERS + 1}; i++) {
      if (float(i) > uCount) break;
      if (x >= uEdges[i]) idx = float(i);
    }
    return min(idx, uCount - 1.0);
  }
  float light(float i, float t) {
    float seed = i * 7.13 + 3.0;
    // Boot: letters strike on in order, each with a short stutter.
    float onAt = i / max(uCount, 1.0) * 0.9;
    float since = (uReveal - onAt) * 6.0;
    if (since <= 0.0) return 0.0;
    float strike = since < 1.0 ? step(0.4, hash(floor(t * 30.0) + seed)) : 1.0;
    // Life: mostly steady; now and then a burst of fast flicker; rarely, out for a beat.
    float slot = floor(t * 1.15 + hash(seed) * 10.0);
    float r = hash(slot * 1.7 + seed);
    float fast = step(0.42, hash(floor(t * 24.0) + seed * 11.0));
    float level = r < 0.07 ? 0.12 + 0.88 * fast : r > 0.988 ? 0.06 : 1.0;
    float hum = 0.95 + 0.05 * sin(t * 47.0 + seed);
    return strike * level * hum;
  }
  void main() {
    vec4 tex = texture2D(uMap, vUv);
    float i = letterAt(vUv.x);
    float l = light(i, uTime);
    // Unlit, the letters still read faintly as glass tubes on the rail.
    vec3 face = vec3(0.98, 0.99, 1.0) * tex.r * 1.35;
    vec3 tube = vec3(1.0) * tex.b * 1.8;
    vec3 halo = vec3(0.45, 0.68, 1.0) * tex.g * 2.6;
    vec3 dark = vec3(0.3, 0.38, 0.5) * tex.r * 0.18;
    vec3 rgb = (face + tube + halo) * l + dark;
    gl_FragColor = vec4(rgb, max(rgb.r, max(rgb.g, rgb.b)));
  }
`;
const SIGN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** The sign's layout: cheap text measuring, needed up front to size the sign. */
function signMetrics(text: string) {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif";
  const px = 150;
  const pad = px * 0.4;
  const font = `600 ${px}px ${family}`;
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = font;
  const width = Math.ceil(m.measureText(text).width) + pad * 2;
  const height = Math.ceil(px * 1.5);
  // Letter edges, from the advance of each prefix, normalised to the texture width.
  const edges = [0];
  for (let i = 1; i < text.length; i++) edges.push((pad + m.measureText(text.slice(0, i)).width) / width);
  edges.push(1);
  return { px, pad, font, width, height, edges, count: text.length, aspect: width / height };
}

/** The sign's glyphs and glow: the heavy part (three canvases and a large blur), built in idle time. */
function signTexture(text: string) {
  const { px, pad, font, width, height } = signMetrics(text);
  const layer = (paint: (g: CanvasRenderingContext2D) => void, blur = 0) => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const g = c.getContext("2d")!;
    if (blur) g.filter = `blur(${blur}px)`;
    g.font = font;
    g.textBaseline = "middle";
    paint(g);
    return c;
  };
  const glyph = (g: CanvasRenderingContext2D, style: string) => {
    g.fillStyle = style;
    g.fillText(text, pad, height / 2);
  };
  const face = layer((g) => glyph(g, "#fff"));
  const halo = layer((g) => glyph(g, "#fff"), px * 0.22);
  const tube = layer((g) => {
    g.strokeStyle = "#fff";
    g.lineWidth = px * 0.035;
    g.lineJoin = "round";
    g.strokeText(text, pad, height / 2);
  });
  // Pack: face in red, halo in green, the hot tube edge in blue.
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const o = out.getContext("2d")!;
  o.fillStyle = "#000";
  o.fillRect(0, 0, width, height);
  o.globalCompositeOperation = "lighter";
  const tint = (src: HTMLCanvasElement, color: string) => {
    const t = document.createElement("canvas");
    t.width = width;
    t.height = height;
    const g = t.getContext("2d")!;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, width, height);
    o.drawImage(t, 0, 0);
  };
  tint(face, "rgb(200,0,0)");
  tint(halo, "rgb(0,255,0)");
  tint(tube, "rgb(0,0,255)");
  const tex = new CanvasTexture(out);
  tex.anisotropy = 4;
  return tex;
}

/* ---------------------------------------------------------------- backdrop
   Real photographs behind the climb, one per section, kept in the background where they
   belong: greyscale sources mapped onto the site's own navy-to-steel palette, softened, held
   at low strength under a vignette, drifting slowly and dissolving into the next as the
   figure climbs between sections. Drawn as one full-screen quad before anything else. */

const BACKDROP_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;
const BACKDROP_FRAG = /* glsl */ `
  uniform sampler2D uA;
  uniform sampler2D uB;
  uniform float uMix;
  uniform float uAspect;
  uniform float uTime;
  uniform float uDrift;
  uniform float uStrength;
  uniform vec3 uBg;
  uniform vec3 uLow;
  uniform vec3 uHigh;
  varying vec2 vUv;
  vec2 cover(vec2 uv, float zoom, vec2 shift) {
    float img = 16.0 / 9.0;
    vec2 sc = uAspect > img ? vec2(1.0, img / uAspect) : vec2(uAspect / img, 1.0);
    return (uv - 0.5) * sc / zoom + 0.5 + shift;
  }
  void main() {
    // A slow push-in and a parallax drift with the climb; the incoming image arrives a little
    // larger, so the dissolve reads as a move rather than a cut.
    float z = 1.12 + 0.025 * sin(uTime * 0.045);
    vec2 a = cover(vUv, z, vec2(0.0, uDrift * 0.06));
    vec2 b = cover(vUv, z + 0.06 * (1.0 - uMix), vec2(0.0, (uDrift - 1.0) * 0.06));
    float lum = mix(texture2D(uA, a).r, texture2D(uB, b).r, smoothstep(0.0, 1.0, uMix));
    vec3 tone = mix(uLow, uHigh, smoothstep(0.12, 0.95, lum));
    vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
    float vignette = 1.0 - smoothstep(0.25, 0.95, length(q) / max(uAspect, 1.0) * 1.35);
    gl_FragColor = vec4(mix(uBg, tone, uStrength * (0.35 + 0.65 * vignette)), 1.0);
    #include <colorspace_fragment>
  }
`;
/** The shine that runs up the stair: how often, how long, and from where to where (metres). */
const SHINE_EVERY = 12;
const SHINE_FOR = 6;
const SHINE_FROM = -2.5;
const SHINE_TO = 11.5;

const BACKDROP_STRENGTH = 0.3;
const BACKDROPS = ["home", "studio", "tiehere", "services", "process", "contact"];

/* ---------------------------------------------------------------- scene */

export type ModelUrls = { body: string; motion: string };

export type SceneHooks = { onProgress?: (p: number) => void; onReady?: () => void };

export function createScene(canvas: HTMLCanvasElement, tier: Tier, models: ModelUrls, hooks: SceneHooks = {}): SceneHandle {
  const renderer = new WebGLRenderer({
    canvas,
    // MSAA everywhere: the ink outline and the glass lines are all edges. On phones' tiled
    // GPUs it costs next to nothing.
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.setClearColor(BG, 1);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  // Sharp on modern screens; the adaptive step-down below still protects slow devices.
  const maxDpr = tier === "high" ? 2 : 1.6;
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);

  const scene = new Scene();
  scene.fog = new FogExp2(BG, FOG);

  const blank = new Texture();
  const backdropMat = new ShaderMaterial({
    vertexShader: BACKDROP_VERT,
    fragmentShader: BACKDROP_FRAG,
    uniforms: {
      uA: { value: blank },
      uB: { value: blank },
      uMix: { value: 0 },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uDrift: { value: 0 },
      uStrength: { value: 0 },
      uBg: { value: new Color(BG) },
      uLow: { value: new Color(0x0d1b2a) },
      uHigh: { value: new Color(0x415a77) },
    },
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const backdrop = new Mesh(new PlaneGeometry(2, 2), backdropMat);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1000;
  scene.add(backdrop);
  const backdropTex: (Texture | null)[] = BACKDROPS.map(() => null);
  let backdropLoaded = 0;
  const camera = new PerspectiveCamera(34, 1, 0.1, 80);

  scene.add(new HemisphereLight(0x778da9, 0x0d1b2a, 0.4));
  scene.add(new AmbientLight(0xffffff, 0.08));
  const key = new DirectionalLight(0xffffff, 1.0);
  key.position.set(4, 8, 6);
  scene.add(key);
  const rim = new PointLight(0x9fb3cc, 7, 7, 1.6);
  scene.add(rim);
  const spill = new PointLight(0xe0e1dd, 1.2, 5, 2);
  scene.add(spill);

  /* treads, landings and their light */
  const list: Box[] = boxes();
  const unit = new BoxGeometry(1, 1, 1);
  const glass = new ShaderMaterial({
    vertexShader: GLASS_VERT,
    fragmentShader: GLASS_FRAG,
    uniforms: {
      uColor: { value: GLASS.clone() },
      uSide: { value: new Color(0x415a77) },
      uLight: { value: new Vector3() },
      uShine: { value: -100 },
      uFog: { value: FOG },
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
  const treads = new InstancedMesh(unit, glass, list.length);
  // Additive and depth-free: as solid geometry these strips fought the glass edges they sit
  // on for depth, and shimmered as the camera moved.
  const noseMat = new MeshBasicMaterial({
    color: NOSE,
    toneMapped: false,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const noses = new InstancedMesh(unit, noseMat, list.length * 2);
  const glowTex = radial();
  const underMat = new MeshBasicMaterial({
    map: glowTex,
    transparent: true,
    opacity: 0.14,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  const plane = new PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  const under = new InstancedMesh(plane, underMat, list.length);

  const m = new Matrix4();
  const q = new Quaternion();
  const glintPos: number[] = [];
  const glintPhase: number[] = [];
  const glintSize: number[] = [];
  let rng = 7;
  const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);

  list.forEach((b, i) => {
    m.compose(new Vector3(b.cx, b.cy, b.cz), q, new Vector3(b.sx, b.sy, b.sz));
    treads.setMatrixAt(i, m);
    const nx = b.cx + (b.nose * b.sx) / 2;
    const top = b.cy + b.sy / 2;
    m.compose(new Vector3(nx, top, b.cz), q, new Vector3(0.009, 0.009, b.sz));
    noses.setMatrixAt(i * 2, m);
    m.compose(new Vector3(nx, b.cy - b.sy / 2, b.cz), q, new Vector3(0.006, 0.006, b.sz));
    noses.setMatrixAt(i * 2 + 1, m);
    m.compose(new Vector3(b.cx, b.cy - b.sy / 2 - 0.02, b.cz), q, new Vector3(b.sx * 1.4, 1, b.sz * 1.15));
    under.setMatrixAt(i, m);
    if (rand() < (b.tread ? 0.38 : 1)) {
      const side = rand() < 0.5 ? -1 : 1;
      glintPos.push(nx, top + 0.005, b.cz + (side * b.sz) / 2);
      glintPhase.push(rand());
      // Mostly pin-points, with the occasional full starburst like light caught on a cut edge.
      glintSize.push(rand() < 0.16 || !b.tread ? 15 + rand() * 9 : 3 + rand() * 3);
    }
  });
  treads.instanceMatrix.needsUpdate = true;
  noses.instanceMatrix.needsUpdate = true;
  under.instanceMatrix.needsUpdate = true;
  treads.renderOrder = 2;
  noses.renderOrder = 3;
  scene.add(under, treads, noses);

  /* survey crosshairs over each station */
  const marks: number[] = [];
  STATIONS.forEach(([u0]) => {
    const p = pose(u0).pos;
    const cx = p.x;
    const cy = p.y + 2.35;
    const cz = p.z - 0.2;
    const s = 0.12;
    marks.push(cx - s, cy, cz, cx + s, cy, cz, cx, cy - s, cz, cx, cy + s, cz);
    marks.push(cx, cy - 0.32, cz, cx, cy - 2.3, cz);
  });
  const markGeo = new BufferGeometry();
  markGeo.setAttribute("position", new BufferAttribute(new Float32Array(marks), 3));
  const markMat = new LineBasicMaterial({ color: 0x778da9, transparent: true, opacity: 0.3, depthWrite: false });
  scene.add(new LineSegments(markGeo, markMat));

  /* the summit portal: a frame of light the figure walks into */
  const portalAt = summitPortal();
  const portal = new Group();
  portal.position.set(portalAt.x, portalAt.y, portalAt.z);
  const pw = 1.05;
  const ph = 2.3;
  const frameGeo = new BufferGeometry();
  frameGeo.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([-pw / 2, 0, 0, -pw / 2, ph, 0, -pw / 2, ph, 0, pw / 2, ph, 0, pw / 2, ph, 0, pw / 2, 0, 0]),
      3,
    ),
  );
  portal.add(new LineSegments(frameGeo, new LineBasicMaterial({ color: 0xedf2f4, toneMapped: false })));
  const doorTex = canvasTexture(128, (g, s) => {
    const l = g.createLinearGradient(0, s, 0, 0);
    l.addColorStop(0, "rgba(237,242,244,0.95)");
    l.addColorStop(0.55, "rgba(224,225,221,0.38)");
    l.addColorStop(1, "rgba(119,141,169,0.06)");
    g.fillStyle = l;
    g.fillRect(0, 0, s, s);
  });
  const door = new Mesh(
    new PlaneGeometry(pw, ph),
    new MeshBasicMaterial({ map: doorTex, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  door.position.y = ph / 2;
  portal.add(door);
  const doorHalo = new Sprite(
    new SpriteMaterial({ map: glowTex, color: 0xe0e1dd, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }),
  );
  doorHalo.scale.set(5, 5, 1);
  doorHalo.position.set(0, ph * 0.45, -0.05);
  portal.add(doorHalo);
  scene.add(portal);

  /* "AshiruLabs" in lit letters over the door, dark until the climber reaches the summit */
  const word = signMetrics("AshiruLabs");
  const signW = 2.3;
  const signH = signW / word.aspect;
  const edges = new Array(MAX_LETTERS + 1).fill(1);
  word.edges.forEach((e, i) => (edges[i] = e));
  const ledMat = new ShaderMaterial({
    vertexShader: SIGN_VERT,
    fragmentShader: SIGN_FRAG,
    uniforms: {
      uMap: { value: blank },
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uEdges: { value: edges },
      uCount: { value: word.count },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const sign = new Group();
  sign.position.set(0, ph + 0.12 + signH * 0.42, 0.04);
  sign.add(new Mesh(new PlaneGeometry(signW, signH), ledMat));
  // The rail the letters are mounted on, with two short stand-offs down to the door frame.
  const railY = -signH * 0.3;
  const railGeo = new BufferGeometry();
  railGeo.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([
        -signW * 0.42, railY, -0.02, signW * 0.42, railY, -0.02,
        -pw * 0.35, railY, -0.02, -pw * 0.35, -(0.12 + signH * 0.42), -0.02,
        pw * 0.35, railY, -0.02, pw * 0.35, -(0.12 + signH * 0.42), -0.02,
      ]),
      3,
    ),
  );
  sign.add(new LineSegments(railGeo, new LineBasicMaterial({ color: 0x415a77, toneMapped: false })));
  portal.add(sign);
  // The summit is the last thing anyone reaches: paint its letters when the page is idle.
  let signTex: Texture | null = null;
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  const paintSign = () => {
    if (disposed) return;
    signTex = signTexture("AshiruLabs");
    ledMat.uniforms.uMap.value = signTex;
    renderer.initTexture(signTex);
  };
  if (idle) idle(paintSign, { timeout: 4000 });
  else setTimeout(paintSign, 1500);
  // The sign boots up the first time the door comes into view, then stays lit.
  let reveal = 0;
  let signOn = false;
  const signAt = new Vector3();
  const signNdc = new Vector3();

  const portalLight = new PointLight(0xedf2f4, 7, 6, 2);
  portalLight.position.set(portalAt.x, portalAt.y + 1.2, portalAt.z + 0.4);
  scene.add(portalLight);

  /* glints on the tread corners */
  const glintGeo = new BufferGeometry();
  glintGeo.setAttribute("position", new BufferAttribute(new Float32Array(glintPos), 3));
  glintGeo.setAttribute("aPhase", new BufferAttribute(new Float32Array(glintPhase), 1));
  glintGeo.setAttribute("aSize", new BufferAttribute(new Float32Array(glintSize), 1));
  const glintMat = new ShaderMaterial({
    vertexShader: GLINT_VERT,
    fragmentShader: GLINT_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uPR: { value: dpr },
      uFog: { value: FOG },
      uColor: { value: GLINT.clone() },
      uShine: { value: -100 },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  scene.add(new Points(glintGeo, glintMat));

  /* dust in the light */
  const dustCount = tier === "high" ? 900 : 380;
  const dp = new Float32Array(dustCount * 3);
  const dph = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dp[i * 3] = -7 + rand() * 14;
    dp[i * 3 + 1] = -3 + rand() * 17;
    dp[i * 3 + 2] = -12 + rand() * 15;
    dph[i] = rand();
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute("position", new BufferAttribute(dp, 3));
  dustGeo.setAttribute("aPhase", new BufferAttribute(dph, 1));
  const dustMat = new ShaderMaterial({
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    uniforms: { uTime: { value: 0 }, uPR: { value: dpr }, uFog: { value: FOG * 0.8 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  scene.add(new Points(dustGeo, dustMat));

  /* the figure, and the light it carries */
  const figure = new Group();
  scene.add(figure);
  let climber: Climber | null = null;
  let disposed = false;
  loadClimber(models.body, models.motion, surfaceAt, hooks.onProgress)
    .then((c) => {
      if (disposed) return c.dispose();
      climber = c;
      figure.add(c.object);
      warm().finally(() => hooks.onReady?.());
    })
    .catch(() => hooks.onReady?.());
  const halo = new Sprite(
    new SpriteMaterial({ map: glowTex, color: 0x778da9, opacity: 0.14, blending: AdditiveBlending, depthWrite: false }),
  );
  halo.scale.set(3.2, 3.2, 1);
  scene.add(halo);

  /* ---------------------------------------------------------------- state */

  let aspect = 1;
  let yaw = Math.PI / 2;
  let gait = 0;
  let amp = 0;
  let facing = 1;
  let reverseFor = 0;
  let yawRate = 0;
  const camPos = new Vector3();
  const camLook = new Vector3();
  const wantPos = new Vector3();
  const wantLook = new Vector3();
  let first = true;
  const accentCol = new Color();
  const tieMid = (STATIONS[TIEHERE_STATION][0] + STATIONS[TIEHERE_STATION][1]) / 2;
  let slowFrames = 0;
  let steps = 0;
  let sampled = 0;

  let lastW = 0;
  let lastH = 0;
  function resize(w: number, h: number) {
    // Resizing reallocates the drawing buffer and blanks it for a frame: only when needed.
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    aspect = w / Math.max(h, 1);
    backdropMat.uniforms.uAspect.value = aspect;
    camera.fov = aspect < 0.8 ? 46 : aspect < 1.2 ? 40 : 34;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  /* where she looks: the cursor, projected onto a plane at her head and pulled a little toward
     the camera so the look reads as eye contact; with no cursor, the viewer */
  const gaze = new Vector3();
  const ray = new Vector3();
  const camFwd = new Vector3();
  const headAt = new Vector3();
  function gazeAt(pointer: FrameInput["pointer"], at: { x: number; y: number; z: number }) {
    if (!pointer) return gaze.copy(camera.position);
    headAt.set(at.x, at.y + 1.5, at.z);
    ray.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
    camera.getWorldDirection(camFwd);
    const denom = ray.dot(camFwd);
    if (Math.abs(denom) < 1e-4) return gaze.copy(camera.position);
    const t = headAt.sub(camera.position).dot(camFwd) / denom;
    return gaze.copy(camera.position).addScaledVector(ray, t).lerp(camera.position, 0.35);
  }

  /* Compile every shader in the background and draw one hidden frame, so nothing compiles or
     uploads on the first visible frame (that used to hitch exactly as the site opened). */
  function warm() {
    const done = () => {
      if (!disposed) renderer.render(scene, camera);
    };
    return renderer.compileAsync(scene, camera).then(done, done);
  }
  warm();

  function loadBackdrops() {
    const bitmap = typeof createImageBitmap !== "undefined";
    const loader = bitmap ? new ImageBitmapLoader().setOptions({ imageOrientation: "flipY" }) : new TextureLoader();
    BACKDROPS.forEach((name, i) => {
      const onLoad = (data: ImageBitmap | Texture) => {
        if (disposed) return;
        const tex = data instanceof Texture ? data : new Texture(data);
        if (!(data instanceof Texture)) tex.flipY = false;
        tex.colorSpace = NoColorSpace;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        renderer.initTexture(tex);
        backdropTex[i] = tex;
        backdropLoaded++;
      };
      (loader as ImageBitmapLoader).load(`/bg/${name}.jpg`, onLoad as (d: ImageBitmap) => void, undefined, () => {});
    });
  }
  loadBackdrops();

  function frame(f: FrameInput) {
    const p = pose(f.u);
    const speed = Math.abs(f.velocity);

    /* gait: phase always runs forward, the figure turns to face where it is going */
    if (!f.still) {
      // While slowing, the legs keep cycling at the pace the stride is fading at, so the last
      // step is finished rather than frozen mid-air as the walk hands over to idle.
      gait += Math.max(speed, amp * 0.9) * f.dt * Math.PI;
      // Stride eases in over the first steps and out over the last, as a walker's does.
      const target = Math.min(speed * 1.1, 1);
      amp += (target - amp) * (1 - Math.exp(-f.dt * (target > amp ? 2.8 : 2.2)));
      // Turn round only once the new direction has held for a moment, so small back-and-forth
      // scrolls never make her flicker between facings.
      const dir = f.velocity > 0.25 ? 1 : f.velocity < -0.25 ? -1 : 0;
      if (dir && dir !== facing) {
        reverseFor += f.dt;
        if (reverseFor > 0.18) {
          facing = dir;
          reverseFor = 0;
        }
      } else reverseFor = 0;
    } else {
      amp = 0;
    }
    const want = Math.atan2(p.tx * facing, p.tz * facing);
    let d = want - yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // Eased, and capped at a human turning rate: a half-turn takes about a second.
    const dyaw = f.still ? d : MathUtils.clamp(d * (1 - Math.exp(-f.dt * 4.5)), -3.4 * f.dt, 3.4 * f.dt);
    yaw += dyaw;
    yawRate = f.dt > 0 ? dyaw / f.dt : 0;

    figure.position.set(p.pos.x, p.pos.y, p.pos.z);
    figure.rotation.y = yaw;
    rim.position.set(p.pos.x - 0.5, p.pos.y + 2.1, p.pos.z - 1.3);
    spill.position.set(p.pos.x + 0.3, p.pos.y + 0.35, p.pos.z + 0.9);
    halo.position.set(p.pos.x, p.pos.y + 1.25, p.pos.z - 0.7);

    /* TieHere's station takes on its colours, quietly */
    const accent = Math.max(0, 1 - Math.abs(f.u - tieMid) / 7);
    accentCol.copy(NOSE).lerp(TIEHERE_BLUE, accent * 0.85);
    noseMat.color.copy(accentCol);
    (glass.uniforms.uColor.value as Color).copy(GLASS).lerp(TIEHERE_BLUE, accent * 0.55);
    (glass.uniforms.uLight.value as Vector3).set(p.pos.x, p.pos.y + 0.6, p.pos.z);
    (glintMat.uniforms.uColor.value as Color).copy(GLINT).lerp(TIEHERE_GREEN, accent * 0.7);
    rim.color.copy(RIM).lerp(TIEHERE_BLUE, accent * 0.5);

    /* camera: a dolly that frames the figure to one side of the copy, small against the stair,
       and leaning a little towards the steps still to come */
    const portrait = aspect < 0.8;
    const dist = (portrait ? 12 : aspect < 1.2 ? 12 : 10.5) * (1 + 0.45 * (1 - f.intro));
    const hh = dist * Math.tan((camera.fov * Math.PI) / 360);
    const hw = hh * aspect;
    const side = portrait ? 0 : f.side;
    const sway = f.still ? 0 : 1;
    const ahead = pose(f.u + 5).pos;
    const lead = 0.3;
    const lx = p.pos.x + (ahead.x - p.pos.x) * lead;
    const ly = p.pos.y + (ahead.y - p.pos.y) * lead;
    const lz = p.pos.z + (ahead.z - p.pos.z) * lead;
    const centred = 1 - Math.min(1, Math.abs(side));
    wantLook.set(
      lx - side * 0.36 * hw,
      ly + 0.9 + (portrait ? -0.12 * hh : 0.02 * hh + centred * 0.74 * hh),
      lz,
    );
    wantPos.set(
      wantLook.x + 1.6 + Math.sin(f.time * 0.21) * 0.22 * sway,
      wantLook.y + 1.9 + 2.6 * (1 - f.intro) + Math.cos(f.time * 0.17) * 0.1 * sway,
      wantLook.z + dist,
    );
    if (first || f.still) {
      camPos.copy(wantPos);
      camLook.copy(wantLook);
      first = false;
    } else {
      const k = 1 - Math.exp(-f.dt * 3.2);
      camPos.lerp(wantPos, k);
      camLook.lerp(wantLook, k * 1.15);
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    if (climber) {
      const look = Math.atan2(camPos.x - p.pos.x, camPos.z - p.pos.z) - yaw;
      climber.update({
        dt: f.dt,
        phase: gait,
        speed,
        amp,
        climb: p.climb,
        up: facing,
        look: Math.atan2(Math.sin(look), Math.cos(look)),
        turn: yawRate,
        gaze: gazeAt(f.pointer, p.pos),
        station: STATIONS.findIndex(([a, b]) => f.u >= a - 0.25 && f.u <= b + 0.25),
        still: f.still,
      });
    }

    glintMat.uniforms.uTime.value = f.time;
    // One sweep up the whole stair every SHINE_EVERY seconds, eased in and out.
    const sc = (f.time % SHINE_EVERY) / SHINE_FOR;
    const shineY = f.still || sc >= 1 ? -100 : SHINE_FROM + (SHINE_TO - SHINE_FROM) * (sc * sc * (3 - 2 * sc));
    glass.uniforms.uShine.value = shineY;
    glintMat.uniforms.uShine.value = shineY;
    if (!signOn && f.intro >= 1) {
      sign.getWorldPosition(signAt);
      signNdc.copy(signAt).project(camera);
      const fogged = Math.exp(-((FOG * signAt.distanceTo(camera.position)) ** 2));
      signOn = signNdc.z < 1 && Math.abs(signNdc.x) < 1.05 && Math.abs(signNdc.y) < 1.05 && fogged > 0.25;
    }
    if (signOn || f.still) reveal = Math.min(1, reveal + (f.still ? 1 : f.dt / 1.5));
    ledMat.uniforms.uReveal.value = reveal;
    ledMat.uniforms.uTime.value = f.time;
    dustMat.uniforms.uTime.value = f.time;

    /* backdrop: which section's photograph, and how far into the dissolve to the next */
    let bp = 0;
    for (let i = 0; i < STATIONS.length; i++) {
      const [a0, a1] = STATIONS[i];
      const next = STATIONS[i + 1];
      if (f.u <= a1) {
        bp = i;
        break;
      }
      if (next && f.u < next[0]) {
        const t = (f.u - a1) / (next[0] - a1);
        bp = i + t * t * (3 - 2 * t);
        break;
      }
      bp = i;
    }
    const bi = Math.min(Math.floor(bp), BACKDROPS.length - 1);
    const bu = backdropMat.uniforms;
    bu.uA.value = backdropTex[bi] ?? blank;
    bu.uB.value = backdropTex[Math.min(bi + 1, BACKDROPS.length - 1)] ?? blank;
    bu.uMix.value = bp - bi;
    bu.uDrift.value = bp - bi;
    bu.uTime.value = f.time;
    if (backdropLoaded === BACKDROPS.length) bu.uStrength.value = Math.min(BACKDROP_STRENGTH, bu.uStrength.value + f.dt * 0.25);

    /* adaptive resolution, decided before drawing so a resize never shows a blank frame;
       at most two steps, and never while the opening is still settling */
    if (f.intro >= 1 && !f.still && dpr > 1 && steps < 2) {
      sampled++;
      if (f.dt > 0.026) slowFrames++;
      if (sampled >= 120) {
        if (slowFrames > 70) {
          steps++;
          dpr = Math.max(1, dpr - 0.3);
          renderer.setPixelRatio(dpr);
          glintMat.uniforms.uPR.value = dpr;
          dustMat.uniforms.uPR.value = dpr;
          renderer.setSize(lastW, lastH, false);
        }
        sampled = 0;
        slowFrames = 0;
      }
    }

    renderer.render(scene, camera);
  }

  function dispose() {
    disposed = true;
    climber?.dispose();
    scene.traverse((o) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    glowTex.dispose();
    doorTex.dispose();
    signTex?.dispose();
    backdropTex.forEach((t) => t?.dispose());
    blank.dispose();
    renderer.dispose();
  }

  return { frame, resize, dispose };
}
