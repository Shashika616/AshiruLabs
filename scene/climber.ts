/**
 * The climber: a rigged, skinned character driven by motion-captured clips.
 *
 * The body is Mixamo's Michelle and the motion is Mixamo's idle / walk / run
 * (both from the three.js examples), shipped as two files: the textured
 * character with no clips, and a motion-only skeleton. Both rigs share Mixamo's bone names, so clips bind by
 * name; only the hips need correcting, because the body was exported Z-up.
 *
 * Mocap walks on flat ground, so stairs are layered on top procedurally: the
 * walk is played by distance rather than by time (one tread per half cycle,
 * so feet never skate), and during each leg's swing extra hip and knee
 * flexion lifts the foot over the next tread while the spine leans into the
 * climb. Which bone axis bends which way is measured from the rig at load,
 * not assumed, so the layer stays correct if the model is ever swapped.
 */
import {
  AnimationClip,
  AnimationMixer,
  CanvasTexture,
  Group,
  MathUtils,
  Matrix4,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
  Mesh,
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  DataTexture,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  PlaneGeometry,
  SkinnedMesh,
  Vector3,
  type AnimationAction,
  type Material,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export type ClimberInput = {
  dt: number;
  /** Gait phase in radians: one tread per π. */
  phase: number;
  /** Path units per second, unsigned. */
  speed: number;
  /** 0 standing → 1 fully in stride. */
  amp: number;
  /** 1 on a flight of stairs, 0 on a landing. */
  climb: number;
  /** 1 heading up the stair, -1 heading down. */
  up: number;
  /** Direction to the camera, as an angle in the figure's own frame. */
  look: number;
  /** World point to look at when standing: the cursor, or the camera when there is none. */
  gaze: Vector3;
  /** The landing the figure is standing on (one per page section), or -1 between them. */
  station: number;
  /** Yaw rate in radians per second, for leaning into turns. */
  turn: number;
  still: boolean;
};

export type Climber = {
  object: Object3D;
  update(input: ClimberInput): void;
  dispose(): void;
};

const N = 64;
const SAMPLE = new Vector3();

function curveAt(curve: Float32Array, t: number) {
  const x = (((t % 1) + 1) % 1) * N;
  const i = Math.floor(x);
  const f = x - i;
  return curve[i % N] * (1 - f) + curve[(i + 1) % N] * f;
}

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(6,12,20,0.75)");
  r.addColorStop(0.62, "rgba(6,12,20,0.7)");
  r.addColorStop(0.7, "rgba(6,12,20,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** Height of the walkable surface under a world point, ignoring anything above `yMax`. */
export type Surface = (x: number, z: number, yMax: number) => number | null;

export async function loadClimber(
  bodyUrl: string,
  motionUrl: string,
  surface: Surface,
  onProgress?: (p: number) => void,
): Promise<Climber> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // Real download progress across both files; sizes are estimates until the server says.
  const loaded = [0, 0];
  const total = [500_000, 300_000];
  const track = (i: number) => (e: ProgressEvent) => {
    loaded[i] = e.loaded;
    if (e.lengthComputable) total[i] = e.total;
    onProgress?.(Math.min(1, (loaded[0] + loaded[1]) / (total[0] + total[1])));
  };
  const [gltf, motion] = await Promise.all([
    loader.loadAsync(bodyUrl, track(0)),
    loader.loadAsync(motionUrl, track(1)),
  ]);
  const model = gltf.scene;

  // Anime cel shading: the character's own colours (recoloured at build time to the site's
  // palette and a fair skin tone) lit in three hard bands, the shadow band cooled by the sky
  // light, with a crisp rim of light and a fine ink outline drawn as a back-faced shell pushed
  // out along the skinned normals.
  const gradient = new DataTexture(new Uint8Array([188, 230, 255]), 3, 1, RedFormat);
  gradient.minFilter = gradient.magFilter = NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  let skin: MeshToonMaterial["map"] = null;
  model.traverse((o) => {
    const mat = (o as Mesh).material as MeshToonMaterial | undefined;
    if (mat?.map && !skin) skin = mat.map;
  });
  // Tone mapping would grey the cel colours; the lights are balanced for it to be off.
  const body = new MeshToonMaterial({
    color: 0xffffff,
    map: skin,
    gradientMap: gradient,
    toneMapped: false,
    transparent: true,
    opacity: 0,
  });
  // Lift the character's exposure above the scene's so her colours sit forward of the navy.
  body.color.setScalar(1.32);
  body.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      float rimF = smoothstep(0.6, 0.64, 1.0 - abs(dot(normal, normalize(vViewPosition))));
      totalEmissiveRadiance += vec3(0.28, 0.32, 0.38) * rimF;`,
    );
  };
  const ink = new MeshBasicMaterial({ color: 0x0d1b2a, side: BackSide, toneMapped: false, transparent: true, opacity: 0 });
  const meshes: SkinnedMesh[] = [];
  model.traverse((o) => {
    const m = o as SkinnedMesh;
    if (m.isSkinnedMesh) meshes.push(m);
  });
  model.updateMatrixWorld(true);
  for (const m of meshes) {
    m.frustumCulled = false;
    (m.material as Material).dispose();
    m.material = body;
    const outline = m.clone() as SkinnedMesh;
    outline.material = ink;
    outline.frustumCulled = false;
    outline.renderOrder = -1;
    m.parent!.add(outline);
    // About 7 mm of line in world space, whatever the rig's units are.
    const width = 0.007 / m.getWorldScale(SAMPLE).x;
    ink.onBeforeCompile = (shader) => {
      shader.uniforms.uOutline = { value: width };
      shader.vertexShader = `uniform float uOutline;\n${shader.vertexShader}`.replace(
        "#include <skinning_vertex>",
        `#include <skinning_vertex>
        transformed += normalize(objectNormal) * uOutline;`,
      );
    };
  }

  const bone = (n: string) => model.getObjectByName(`mixamorig${n}`)!;
  const hips = bone("Hips");
  const spine = bone("Spine1");
  const head = bone("Head");
  const neck = bone("Neck");
  const chest = bone("Spine2");
  const arm = [bone("LeftArm"), bone("RightArm")];
  const fore = [bone("LeftForeArm"), bone("RightForeArm")];
  const hand = [bone("LeftHand"), bone("RightHand")];
  const headTop = model.getObjectByName("mixamorigHeadTop_End") ?? head;
  // A touch of anime proportion: a slightly larger head.
  head.scale.setScalar(1.06);
  const thigh = [bone("LeftUpLeg"), bone("RightUpLeg")];
  const knee = [bone("LeftLeg"), bone("RightLeg")];
  const foot = [bone("LeftFoot"), bone("RightFoot")];
  const toe = [bone("LeftToeBase"), bone("RightToeBase")];

  const clip = (n: string) => motion.animations.find((a) => a.name === n) as AnimationClip;

  /* retarget: each bone's motion, measured against its own rest in world space, carried onto
     this body's rest. The two rigs share names but not bone orientations, so copying local
     rotations straight across twists every joint; this bakes clean clips once, at load. */
  model.updateMatrixWorld(true);
  motion.scene.updateMatrixWorld(true);
  let skinned: SkinnedMesh | undefined;
  model.traverse((o) => {
    if (!skinned && (o as SkinnedMesh).isSkinnedMesh) skinned = o as SkinnedMesh;
  });
  const m4 = new Matrix4();
  const scratchP = new Vector3();
  const scratchS = new Vector3();
  const restTgt = new Map<Object3D, Quaternion>();
  let hipsBindW = hips.getWorldPosition(new Vector3());
  skinned!.skeleton.bones.forEach((b, i) => {
    const q = new Quaternion();
    m4.copy(skinned!.skeleton.boneInverses[i]).invert().decompose(scratchP, q, scratchS);
    restTgt.set(b, q);
    if (b === hips) hipsBindW = scratchP.clone();
  });
  const ordered: Object3D[] = [];
  model.traverse((o) => {
    if (restTgt.has(o)) ordered.push(o);
  });
  const srcOf = new Map<Object3D, Object3D>();
  const restSrcInv = new Map<Object3D, Quaternion>();
  for (const b of ordered) {
    const src = motion.scene.getObjectByName(b.name);
    if (!src) continue;
    srcOf.set(b, src);
    restSrcInv.set(b, src.getWorldQuaternion(new Quaternion()).invert());
  }
  const staticParent = new Map<Object3D, Quaternion>();
  for (const b of ordered) if (!restTgt.has(b.parent!)) staticParent.set(b, b.parent!.getWorldQuaternion(new Quaternion()));
  const srcHips = srcOf.get(hips)!;
  const srcHipsRest = srcHips.getWorldPosition(new Vector3());
  const ratio = hipsBindW.y / srcHipsRest.y;

  const bake = (c: AnimationClip) => {
    const mx = new AnimationMixer(motion.scene);
    mx.clipAction(c).play();
    const frames = Math.max(2, Math.round(c.duration * 30) + 1);
    const times = new Float32Array(frames);
    const qv = new Map(ordered.map((b) => [b, new Float32Array(frames * 4)] as const));
    const pv = new Float32Array(frames * 3);
    const world = new Map<Object3D, Quaternion>();
    const d = new Quaternion();
    const local = new Quaternion();
    const hp = new Vector3();
    for (let f = 0; f < frames; f++) {
      const t = (f / (frames - 1)) * c.duration;
      times[f] = t;
      mx.setTime(t);
      motion.scene.updateMatrixWorld(true);
      for (const b of ordered) {
        const parentW = world.get(b.parent!) ?? staticParent.get(b)!;
        const src = srcOf.get(b);
        const w = src
          ? src.getWorldQuaternion(d).multiply(restSrcInv.get(b)!).clone().multiply(restTgt.get(b)!)
          : parentW.clone().multiply(restTgt.get(b.parent!)!.clone().invert().multiply(restTgt.get(b)!));
        world.set(b, w);
        local.copy(parentW).invert().multiply(w);
        const arr = qv.get(b)!;
        const o = f * 4;
        // Keep consecutive keys in one hemisphere so interpolation never takes the long way round.
        if (f > 0 && arr[o - 4] * local.x + arr[o - 3] * local.y + arr[o - 2] * local.z + arr[o - 1] * local.w < 0) {
          local.set(-local.x, -local.y, -local.z, -local.w);
        }
        arr[o] = local.x;
        arr[o + 1] = local.y;
        arr[o + 2] = local.z;
        arr[o + 3] = local.w;
      }
      // In-place locomotion: the hips keep the clip's rise and fall, scaled to this body, and no drift.
      srcHips.getWorldPosition(hp);
      hp.set(hipsBindW.x, hp.y * ratio, hipsBindW.z);
      hips.parent!.worldToLocal(hp);
      pv.set([hp.x, hp.y, hp.z], f * 3);
    }
    mx.stopAllAction();
    mx.uncacheRoot(motion.scene);
    const tracks = [
      ...ordered.map((b) => new QuaternionKeyframeTrack(`${b.name}.quaternion`, times, qv.get(b)!)),
      new VectorKeyframeTrack(`${hips.name}.position`, times, pv),
    ];
    return new AnimationClip(c.name, c.duration, tracks);
  };
  const walkClip = bake(clip("walk"));
  const runClip = bake(clip("run"));
  const idleClip = bake(clip("idle"));

  /* turn a joint by a rotation given in world space, whatever the rig's local axes are */
  const qa = new Quaternion();
  const qb = new Quaternion();
  const qr = new Quaternion();
  const turnWorld = (b: Object3D, r: Quaternion) => {
    b.parent!.getWorldQuaternion(qa);
    b.getWorldQuaternion(qb);
    b.quaternion.copy(qa.invert().multiply(r).multiply(qb));
  };
  const bend = (b: Object3D, axis: Vector3, angle: number) => turnWorld(b, qr.setFromAxisAngle(axis, angle));
  const UP = new Vector3(0, 1, 0);
  const lateral = new Vector3();

  const pos = (o: Object3D) => {
    model.updateMatrixWorld(true);
    return o.getWorldPosition(SAMPLE).clone();
  };

  /* calibrate against the rest pose: which way is forward, and which way each joint bends */
  const fwd = Math.sign(pos(toe[0]).z - pos(foot[0]).z) || 1;
  const X = new Vector3(1, 0, 0);
  const signOf = (b: Object3D, probe: Object3D, want: 1 | -1) => {
    const q = b.quaternion.clone();
    const before = pos(probe).z;
    bend(b, X, 0.25);
    const after = pos(probe).z;
    b.quaternion.copy(q);
    return Math.sign((after - before) * fwd) === want ? 1 : -1;
  };
  const hipSign = signOf(thigh[0], knee[0], 1); // knee comes forward
  const kneeSign = signOf(knee[0], foot[0], -1); // foot tucks back
  const leanSign = signOf(spine, head, 1); // head comes forward

  /* the same calibration for the arms and head, so gestures bend the right way on any rig */
  const FWD = new Vector3(0, 0, fwd);
  const signBy = (b: Object3D, axis: Vector3, probe: Object3D, read: (p: Vector3) => number) => {
    const q = b.quaternion.clone();
    const before = read(pos(probe));
    bend(b, axis, 0.3);
    const after = read(pos(probe));
    b.quaternion.copy(q);
    return after > before ? 1 : -1;
  };
  const abduct = [0, 1].map((s) => signBy(arm[s], FWD, hand[s], (p) => p.y)); // arm lifts out to the side
  const raise = [0, 1].map((s) => signBy(arm[s], X, hand[s], (p) => p.z * fwd)); // arm swings forward
  const elbow = [0, 1].map((s) => signBy(fore[s], X, hand[s], (p) => p.z * fwd)); // forearm folds forward
  const nod = signBy(head, X, headTop, (p) => p.z * fwd); // head tips down

  /* measure each foot's swing through a clip: positive while it travels forward */
  const swing = (c: AnimationClip) => {
    const mixer = new AnimationMixer(model);
    mixer.clipAction(c).play();
    const z = [new Float32Array(N), new Float32Array(N)];
    for (let i = 0; i < N; i++) {
      mixer.setTime((i / N) * c.duration);
      z[0][i] = pos(foot[0]).z * fwd;
      z[1][i] = pos(foot[1]).z * fwd;
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    return z.map((zz) => {
      const out = new Float32Array(N);
      let max = 1e-6;
      for (let i = 0; i < N; i++) {
        out[i] = Math.max(0, zz[(i + 1) % N] - zz[(i + N - 1) % N]);
        max = Math.max(max, out[i]);
      }
      for (let i = 0; i < N; i++) out[i] = Math.sin((out[i] / max) * (Math.PI / 2)) ** 2;
      return out;
    });
  };
  const walkSwing = swing(walkClip);
  const runSwing = swing(runClip);
  // Align the run to the walk so cross-fading between them never swaps feet mid-stride.
  let runShift = 0;
  let best = -1;
  for (let k = 0; k < N; k++) {
    let s = 0;
    for (let i = 0; i < N; i++) s += walkSwing[0][i] * runSwing[0][(i + k) % N];
    if (s > best) {
      best = s;
      runShift = k / N;
    }
  }

  /* the live mixer: idle runs on its own clock, walk and run are scrubbed by distance */
  const mixer = new AnimationMixer(model);
  const play = (c: AnimationClip, scale: number): AnimationAction => {
    const a = mixer.clipAction(c);
    a.enabled = true;
    a.setEffectiveTimeScale(scale);
    a.setEffectiveWeight(0);
    a.play();
    return a;
  };
  const idle = play(idleClip, 1);
  const walk = play(walkClip, 0);
  const run = play(runClip, 0);
  idle.setEffectiveWeight(1);

  // Stand on the tread: this rig's origin is not at its soles, so measure where the toes rest
  // in the idle pose and lift the body by exactly that much.
  mixer.update(0);
  model.updateMatrixWorld(true);
  const toeEnd = [model.getObjectByName("mixamorigLeftToe_End") ?? toe[0], model.getObjectByName("mixamorigRightToe_End") ?? toe[1]];
  const sole = Math.min(...toeEnd.map((t) => t.getWorldPosition(SAMPLE).y));
  const restY = -sole + 0.012;
  model.position.y = restY;

  const object = new Group();
  object.add(model);
  if (fwd < 0) model.rotation.y = Math.PI;

  const shadowTex = shadowTexture();
  const shadow = new Mesh(
    new PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0 }),
  );
  shadow.position.y = 0.004;
  object.add(shadow);

  let fade = 0;
  let bank = 0;

  /* gestures: one per landing, and small fidgets while she waits.
     Each is keyed like hand animation: anticipation into an overshoot, a hold, an eased
     settle, and children (forearm, hand, head) trailing their parents by a few frames so the
     motion overlaps instead of moving as one stiff piece. */
  const fwdAxis = new Vector3();
  const easeOut = (x: number) => 1 - (1 - x) ** 3;
  const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  const back = (x: number) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2;
  /** Envelope: rise over `a` (with overshoot if `pop`), hold, ease out over `b`; delayed by `d`. */
  const env = (t: number, dur: number, a: number, b: number, d = 0, pop = false) => {
    const x = t - d;
    if (x <= 0 || x >= dur) return 0;
    const rise = MathUtils.clamp(x / a, 0, 1);
    const fall = MathUtils.clamp((dur - x) / b, 0, 1);
    return (pop ? back(rise) : easeOut(rise)) * easeInOut(fall);
  };
  const band = (t: number, a: number, b: number, fade: number) =>
    MathUtils.smoothstep(t, a, a + fade) * (1 - MathUtils.smoothstep(t, b - fade, b));
  /** run(t, k) poses the body for time t at strength k and may return a hop, in metres. */
  type Gesture = { dur: number; face?: number; head?: boolean; run: (t: number, k: number) => number | void };
  const R = 1;
  const L = 0;
  const gestures: Record<string, Gesture> = {
    // Base: lifts her chin to the climb ahead.
    lookUp: {
      dur: 2.1,
      head: true,
      run: (t, k) => {
        const h = env(t, 2.1, 0.45, 0.55, 0, true) * k;
        bend(spine, lateral, -leanSign * 0.05 * h);
        bend(neck, lateral, -nod * 0.16 * h);
        bend(head, lateral, -nod * 0.32 * env(t, 2.1, 0.45, 0.55, 0.06, true) * k);
      },
    },
    // Studio: checks the time before getting to work.
    watch: {
      dur: 2.3,
      head: true,
      run: (t, k) => {
        const a = env(t, 2.3, 0.32, 0.45, 0, true) * k;
        bend(arm[L], lateral, raise[L] * 0.5 * a);
        bend(arm[L], fwdAxis, abduct[L] * 0.22 * a);
        bend(fore[L], lateral, elbow[L] * 1.75 * env(t, 2.3, 0.32, 0.45, 0.06, true) * k);
        bend(head, lateral, nod * 0.38 * env(t, 2.3, 0.4, 0.4, 0.16) * k);
      },
    },
    // TieHere: turns to the viewer and waves; the product is about saying hello.
    wave: {
      dur: 2.6,
      face: 1,
      run: (t, k) => {
        const a = env(t, 2.6, 0.3, 0.45, 0, true) * k;
        const fo = env(t, 2.6, 0.3, 0.5, 0.07, true) * k;
        const osc = band(t, 0.25, 2.15, 0.25);
        bend(spine, fwdAxis, abduct[R] * 0.05 * a);
        bend(arm[R], fwdAxis, abduct[R] * 1.5 * a);
        bend(arm[R], lateral, raise[R] * 0.22 * a);
        bend(fore[R], fwdAxis, abduct[R] * (1.12 + 0.26 * Math.sin((t - 0.25) * 8) * osc) * fo);
        bend(hand[R], fwdAxis, abduct[R] * 0.26 * Math.sin((t - 0.36) * 8) * osc * fo);
        bend(head, fwdAxis, -abduct[R] * 0.13 * a);
      },
    },
    // Services: two quick nods, as in "yes, we can build that".
    nod: {
      dur: 1.5,
      face: 0.5,
      head: true,
      run: (t, k) => {
        const e = env(t, 1.5, 0.12, 0.3) * k;
        const beat = t < 1.1 ? Math.abs(Math.sin((t * Math.PI) / 0.55)) ** 1.4 : 0;
        bend(neck, lateral, nod * 0.06 * beat * e);
        bend(head, lateral, nod * (0.04 + 0.18 * beat) * e);
      },
    },
    // Process: leans in and points up the stair to the summit.
    point: {
      dur: 2.5,
      head: true,
      run: (t, k) => {
        const a = env(t, 2.5, 0.38, 0.5, 0, true) * k;
        bend(spine, lateral, leanSign * 0.06 * a);
        bend(arm[R], lateral, raise[R] * 2.15 * a);
        bend(arm[R], fwdAxis, abduct[R] * 0.15 * a);
        bend(fore[R], lateral, elbow[R] * 0.1 * env(t, 2.5, 0.38, 0.5, 0.06) * k);
        bend(head, lateral, -nod * 0.4 * env(t, 2.5, 0.5, 0.5, 0.1) * k);
      },
    },
    // Summit only: anticipation crouch with the arms swung back, a jump into a V, a squash on
    // landing, two happy bounces with fist pumps, then the arms settle and the head tilts.
    celebrate: {
      dur: 3,
      face: 1,
      run: (t, k) => {
        const crouch = t < 0.24 ? easeOut(t / 0.24) : t < 0.32 ? 1 - (t - 0.24) / 0.08 : 0;
        const up = env(t, 3, 0.36, 1.0, 0.2, true) * k;
        const pumps = band(t, 0.78, 1.7, 0.12);
        const pump = Math.max(0, Math.sin(((t - 0.78) * Math.PI) / 0.23)) * pumps;
        for (const s of [L, R]) {
          bend(arm[s], lateral, -raise[s] * 0.5 * crouch * k);
          bend(arm[s], fwdAxis, abduct[s] * 2.3 * up);
          bend(arm[s], lateral, raise[s] * 0.32 * up);
          const lag = env(t, 3, 0.36, 1.0, 0.27, true) * k;
          bend(fore[s], fwdAxis, abduct[s] * (0.22 + 0.42 * pump) * lag);
        }
        bend(spine, lateral, (leanSign * 0.12 * crouch - leanSign * 0.08 * up) * k);
        bend(head, lateral, (nod * 0.12 * crouch - nod * 0.2 * up) * k);
        bend(head, fwdAxis, abduct[R] * 0.12 * band(t, 1.6, 2.9, 0.35) * k);
        if (t > 0.42 && !burst.fired) {
          burst.fired = true;
          burst.t = 0;
        }
        let hop = 0;
        if (t < 0.24) hop = -0.045 * easeOut(t / 0.24);
        else if (t < 0.66) {
          const x = (t - 0.24) / 0.42;
          hop = -0.045 * (1 - x) + 0.13 * Math.sin(x * Math.PI);
        } else if (t < 0.82) hop = -0.035 * Math.sin(((t - 0.66) / 0.16) * Math.PI);
        else if (t < 1.62) hop = 0.026 * Math.abs(Math.sin(((t - 0.82) / 0.8) * 2 * Math.PI));
        return hop * k;
      },
    },
    // Fidgets.
    lookAround: {
      dur: 2.8,
      head: true,
      run: (t, k) => {
        const e = env(t, 2.8, 0.3, 0.45) * k;
        const yaw = Math.sin(t * 2.25) * 0.6 * e;
        bend(neck, UP, yaw * 0.4);
        bend(head, UP, yaw * 0.6);
      },
    },
    headphones: {
      dur: 1.9,
      run: (t, k) => {
        const a = env(t, 1.9, 0.3, 0.45, 0, true) * k;
        bend(arm[R], fwdAxis, abduct[R] * 1.05 * a);
        bend(fore[R], fwdAxis, abduct[R] * 2.2 * env(t, 1.9, 0.3, 0.45, 0.06, true) * k);
        bend(head, fwdAxis, -abduct[R] * 0.1 * a);
      },
    },
    // A weight shift: the body sways one way, the head answers the other way a beat later.
    sway: {
      dur: 2.6,
      run: (t, k) => {
        const e = env(t, 2.6, 0.4, 0.6) * k;
        bend(spine, fwdAxis, 0.07 * Math.sin(t * 2.4) * e);
        bend(head, fwdAxis, -0.1 * Math.sin(t * 2.4 - 0.5) * e);
      },
    },
  };
  const AT_STATION = ["lookUp", "watch", "wave", "nod", "point", "celebrate"];
  const FIDGETS = ["lookAround", "headphones", "sway", "watch"];
  let active: { name: string; t: number } | null = null;
  let stillFor = 0;
  let played = -2;
  let nextFidget = 2;
  let lastFidget = "";
  let facing = 0;

  /* a burst of anime star sparkles at the top of the summit jump */
  const BURST = 26;
  const bDir = new Float32Array(BURST * 3);
  const bPhase = new Float32Array(BURST);
  for (let i = 0; i < BURST; i++) {
    const a = (i / BURST) * Math.PI * 2 + Math.random() * 0.3;
    const up = 0.35 + Math.random() * 0.9;
    const r = 0.7 + Math.random() * 0.6;
    bDir.set([Math.cos(a) * r, up, Math.sin(a) * r * 0.6], i * 3);
    bPhase[i] = Math.random();
  }
  const bGeo = new BufferGeometry();
  bGeo.setAttribute("position", new BufferAttribute(new Float32Array(BURST * 3), 3));
  bGeo.setAttribute("aDir", new BufferAttribute(bDir, 3));
  bGeo.setAttribute("aPhase", new BufferAttribute(bPhase, 1));
  const bMat = new ShaderMaterial({
    uniforms: { uT: { value: -1 }, uPR: { value: Math.min(window.devicePixelRatio || 1, 1.75) } },
    vertexShader: /* glsl */ `
      attribute vec3 aDir;
      attribute float aPhase;
      uniform float uT;
      uniform float uPR;
      varying float vA;
      varying float vTint;
      void main() {
        float t = clamp(uT, 0.0, 1.0);
        float e = 1.0 - pow(1.0 - t, 3.0);
        vec3 p = vec3(0.0, 1.35, 0.0) + aDir * e * 1.1 - vec3(0.0, 0.35 * t * t, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.6 + 0.4 * sin(uT * 40.0 + aPhase * 30.0);
        vA = (uT < 0.0 ? 0.0 : 1.0) * (1.0 - smoothstep(0.55, 1.0, t)) * tw;
        vTint = aPhase;
        gl_PointSize = uPR * (14.0 + 10.0 * aPhase) * (1.0 - 0.5 * t) * (6.0 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying float vTint;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float h = max(0.0, 1.0 - abs(c.y) * 14.0) * pow(max(0.0, 1.0 - abs(c.x) * 2.0), 2.0);
        float v = max(0.0, 1.0 - abs(c.x) * 14.0) * pow(max(0.0, 1.0 - abs(c.y) * 2.0), 2.0);
        float a = (exp(-dot(c, c) * 90.0) + h + v) * vA;
        if (a < 0.01) discard;
        vec3 col = mix(vec3(0.93, 0.95, 0.96), vec3(0.6, 0.7, 0.84), vTint);
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const sparkles = new Points(bGeo, bMat);
  sparkles.frustumCulled = false;
  object.add(sparkles);
  const burst = { fired: false, t: -1 };

  /* gaze: the head, neck and chest share a look at the cursor; past a point, the body turns */
  const gazeLocal = new Vector3();
  const headPos = new Vector3();
  const modelQ = new Quaternion();
  let gazeYaw = 0;
  let gazePitch = 0;
  let lean = 0;
  let lift = 0;

  const base = new Vector3();
  const ahead = new Vector3();
  const footDy = [0, 0];
  const swingW = [0, 0];
  let pelvis = 0;
  const ik = { h: new Vector3(), k: new Vector3(), a: new Vector3(), t: new Vector3(), u: new Vector3(), v: new Vector3(), n: new Vector3() };
  const footQ = new Quaternion();
  const swingQ = new Quaternion();

  /** Two-bone IK: move leg s's ankle up (or down) by `need`, keeping the knee in its own plane and the foot's attitude. */
  function reach(s: number, need: number) {
    const { h, k, a, t, u, v, n } = ik;
    thigh[s].getWorldPosition(h);
    knee[s].getWorldPosition(k);
    foot[s].getWorldPosition(a);
    foot[s].getWorldQuaternion(footQ);
    t.copy(a).y += need;
    const la = h.distanceTo(k);
    const lb = k.distanceTo(a);
    const lc = MathUtils.clamp(h.distanceTo(t), Math.abs(la - lb) + 1e-3, la + lb - 1e-3);
    u.subVectors(h, k);
    v.subVectors(a, k);
    const now = u.angleTo(v);
    const goal = Math.acos(MathUtils.clamp((la * la + lb * lb - lc * lc) / (2 * la * lb), -1, 1));
    n.crossVectors(u, v);
    if (n.lengthSq() < 1e-8) n.copy(lateral);
    n.normalize();
    // Open or close the knee to the length the hip-to-target distance needs...
    turnWorld(knee[s], swingQ.setFromAxisAngle(n, goal - now));
    // ...then swing the whole leg from the hip so the ankle lands on the target.
    foot[s].getWorldPosition(a);
    turnWorld(thigh[s], swingQ.setFromUnitVectors(u.subVectors(a, h).normalize(), v.subVectors(t, h).normalize()));
    // The foot keeps the attitude the walk gave it, so the sole stays flat on the glass.
    foot[s].parent!.getWorldQuaternion(qa);
    foot[s].quaternion.copy(qa.invert().multiply(footQ));
  }

  function update(f: ClimberInput) {
    if (fade < 1) {
      fade = Math.min(1, fade + f.dt / 0.9);
      body.opacity = ink.opacity = fade;
      (shadow.material as MeshBasicMaterial).opacity = 0.6 * fade;
      if (fade === 1) body.transparent = ink.transparent = false;
      body.needsUpdate = ink.needsUpdate = true;
    }

    const cycle = f.phase / (2 * Math.PI);
    const norm = ((cycle % 1) + 1) % 1;
    // Ease the blend so idle → walk → jog cross-fade without a linear seam.
    const moving = f.still ? 0 : MathUtils.smoothstep(f.amp, 0, 1);
    const runW = moving * MathUtils.smoothstep(f.speed, 1.95, 2.5);
    idle.setEffectiveWeight(1 - moving);
    walk.setEffectiveWeight(moving - runW);
    run.setEffectiveWeight(runW);
    walk.time = norm * walkClip.duration;
    run.time = ((norm + runShift) % 1) * runClip.duration;
    mixer.update(f.still ? 0 : f.dt);

    /* the stair layer, applied on top of whatever the mixer just posed */
    lateral.set(1, 0, 0).applyQuaternion(model.getWorldQuaternion(qr));
    const c = f.climb * moving;
    lift += (c - lift) * (1 - Math.exp(-f.dt * 8));
    const upward = f.up > 0;
    for (let s = 0; s < 2; s++) {
      const w = curveAt(walkSwing[s], norm) * (1 - runW) + curveAt(runSwing[s], (norm + runShift) % 1) * runW;
      swingW[s] = w;
      bend(thigh[s], lateral, hipSign * w * lift * (upward ? 0.18 : 0.1));
      bend(knee[s], lateral, kneeSign * w * lift * (upward ? 0.26 : 0.16));
    }
    const wantLean = lift * (upward ? 0.13 : -0.05) + runW * 0.04;
    lean += (wantLean - lean) * (1 - Math.exp(-f.dt * 5));
    bend(spine, lateral, leanSign * lean);

    /* plant the feet: find the glass under each foot, ride the hips a third of the way from the
       lower tread to the higher, then fold the upper leg and stretch the lower one to meet them */
    object.parent?.getWorldPosition(base);
    ahead.set(0, 0, fwd).applyQuaternion(model.getWorldQuaternion(qr));
    ahead.y = 0;
    ahead.normalize();
    for (let s = 0; s < 2; s++) {
      foot[s].getWorldPosition(ik.a);
      // A swinging foot aims for the tread it is about to land on, not the one it is passing
      // over, so it rises early in one smooth arc; a little extra lift clears the nosing.
      const w = swingW[s] * moving;
      const reachAhead = w * 0.16;
      const top = surface(ik.a.x + ahead.x * reachAhead, ik.a.z + ahead.z * reachAhead, base.y + 0.42);
      const want = (top === null ? 0 : top - base.y) + Math.sin(Math.min(1, w) * Math.PI * 0.5) * 0.045 * lift;
      // Planted feet lock fast; swinging feet travel softly.
      const rate = f.still ? 60 : w > 0.08 ? 11 : 24;
      footDy[s] += (want - footDy[s]) * (1 - Math.exp(-f.dt * rate));
    }
    const lo = Math.min(footDy[0], footDy[1]);
    const wantPelvis = lo + (Math.max(footDy[0], footDy[1]) - lo) * 0.32;
    pelvis += (wantPelvis - pelvis) * (1 - Math.exp(-f.dt * (f.still ? 60 : 10)));
    model.position.y = restY + pelvis;
    const under = surface(base.x, base.z, base.y + 0.3);
    shadow.position.y = (under === null ? 0 : under - base.y) + 0.004;
    for (let s = 0; s < 2; s++) {
      const need = footDy[s] - pelvis;
      if (Math.abs(need) > 0.002) reach(s, need);
    }

    /* lean into the turns across each landing, as a walker does */
    const wantBank = MathUtils.clamp(-f.turn * 0.05, -0.11, 0.11) * moving;
    bank += (wantBank - bank) * (1 - Math.exp(-f.dt * 6));
    object.rotation.z = bank;

    /* gestures: the landing's own the moment she arrives; small fidgets soon after she stops */
    fwdAxis.set(0, 0, fwd).applyQuaternion(model.getWorldQuaternion(qr));
    let wantFace = 0;
    let headUse = 0;
    if (!f.still) {
      if (f.station < 0) played = -2;
      if (moving < 0.06) stillFor += f.dt;
      else stillFor = 0;
      if (!active) {
        if (f.station >= 0 && f.station !== played && moving < 0.5) {
          active = { name: AT_STATION[f.station] ?? "lookAround", t: 0 };
          played = f.station;
          nextFidget = stillFor + 3.5 + Math.random() * 2;
        } else if (moving < 0.06 && stillFor > nextFidget) {
          const pool = FIDGETS.filter((n) => n !== lastFidget);
          lastFidget = pool[Math.floor(Math.random() * pool.length)];
          active = { name: lastFidget, t: 0 };
          nextFidget = stillFor + 4 + Math.random() * 2.5;
        }
      }
      if (active) {
        const gesture = gestures[active.name];
        // Gestures are keyed a little brisk; play them at a calmer, more human tempo.
        active.t += f.dt * 0.8;
        // Upper-body gestures carry over the last steps of a walk; turning to the viewer waits for a stop.
        const k = 1 - 0.75 * moving;
        const hop = gesture.run(active.t, k);
        if (hop) {
          model.position.y += hop;
          // Dipping into a crouch bends the knees rather than sinking the feet into the glass.
          if (hop < 0) for (let s = 0; s < 2; s++) reach(s, -hop);
        }
        const presence = band(active.t, 0, gesture.dur, 0.4);
        wantFace = MathUtils.clamp(f.look, -2.9, 2.9) * (gesture.face ?? 0) * presence * (1 - moving);
        headUse = gesture.head ? presence : 0;
        if (active.t >= gesture.dur) active = null;
      }
    }

    if (burst.t >= 0) {
      burst.t += f.dt / 1.1;
      bMat.uniforms.uT.value = burst.t;
      if (burst.t > 1) burst.t = -1;
    } else bMat.uniforms.uT.value = -1;
    if (f.station < 0) burst.fired = false;

    /* gaze: the cursor when there is one, the viewer otherwise */
    const gazeW = (1 - moving) * (1 - headUse) * (f.still ? 0 : 1);
    head.getWorldPosition(headPos);
    gazeLocal.subVectors(f.gaze, headPos).applyQuaternion(model.getWorldQuaternion(modelQ).invert());
    const yawTo = Math.atan2(gazeLocal.x * fwd, gazeLocal.z * fwd);
    const pitchTo = Math.atan2(gazeLocal.y, Math.hypot(gazeLocal.x, gazeLocal.z));
    const wantYaw = MathUtils.clamp(yawTo, -1.15, 1.15) * gazeW;
    const wantPitch = MathUtils.clamp(pitchTo, -0.5, 0.42) * gazeW;
    const g = 1 - Math.exp(-f.dt * 4.2);
    gazeYaw += (wantYaw - gazeYaw) * g;
    gazePitch += (wantPitch - gazePitch) * g;
    bend(chest, UP, gazeYaw * 0.2);
    bend(neck, UP, gazeYaw * 0.3);
    bend(neck, lateral, -nod * gazePitch * 0.35);
    bend(head, UP, gazeYaw * 0.5);
    bend(head, lateral, -nod * gazePitch * 0.65);
    // Look far enough to one side and she turns her whole body to follow.
    if (!wantFace && gazeW > 0) {
      const over = Math.sign(yawTo) * Math.max(0, Math.abs(yawTo) - 0.8);
      wantFace = MathUtils.clamp(facing + over * 0.9, -1.6, 1.6) * gazeW;
    }
    facing += (wantFace - facing) * (1 - Math.exp(-f.dt * 2.2));
    object.rotation.y = facing;
  }

  function dispose() {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    model.traverse((o) => (o as Mesh).geometry?.dispose());
    body.dispose();
    bGeo.dispose();
    bMat.dispose();
    ink.dispose();
    gradient.dispose();
    shadowTex.dispose();
    shadow.geometry.dispose();
    (shadow.material as Material).dispose();
  }

  return { object, update, dispose };
}
