import * as THREE from 'three';
import gsap from 'gsap';
import { ARCANA } from '../data/arcana';
import * as sfx from '../audio';
import { reduceMotion } from '../prefs';
import {
  clothTexture,
  crateTexture,
  floorTexture,
  frontTexture,
  glowSprite,
  plasterTexture,
} from '../textures';

export const TABLE_Y = 0.76;

export interface CameraPose {
  pos: THREE.Vector3Tuple;
  look: THREE.Vector3Tuple;
}

/** Named camera framings. Reading framing is adjusted for portrait screens in `poseFor`. */
export const POSES = {
  outside: { pos: [0, 1.62, 7.2], look: [0, 1.35, 0] },
  doorway: { pos: [0, 1.6, 3.4], look: [0, 1.2, -0.5] },
  seated: { pos: [0, 1.32, 1.35], look: [0, 1.08, -0.7] },
  reading: { pos: [0, 1.95, 0.78], look: [0, TABLE_Y, -0.02] },
  gallery: { pos: [-0.9, 1.5, 1.6], look: [0.4, 1.2, -1.5] },
} satisfies Record<string, CameraPose>;

export type PoseName = keyof typeof POSES;

const ROOM = { w: 6, d: 6, h: 3.2 };

/** Yaw/pitch (Euler 'YXZ') that points a camera along `dir`. */
function aim(dir: THREE.Vector3) {
  const d = dir.clone().normalize();
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) };
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 40);
  readonly table = new THREE.Group();

  private readonly look = new THREE.Vector3(...POSES.outside.look);
  private readonly basePos = new THREE.Vector3(...POSES.outside.pos);
  private readonly parallax = new THREE.Vector2();
  private readonly parallaxTarget = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly timer = new THREE.Timer();
  private readonly updaters: ((dt: number, t: number) => void)[] = [];
  private currentPose: PoseName = 'outside';
  /** Screen-space shift of the rendered scene (px), to keep it clear of side panels. */
  private readonly focus = { x: 0, y: 0 };
  private active = true;

  /**
   * First-person head rig for walking sequences. Uses yaw/pitch/roll instead of a look target,
   * so the head can turn all the way around. `bob` scales the walking sway, `par` blends mouse parallax.
   */
  private readonly head = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, bob: 0, par: 0 };
  private headMode = false;
  private walkTl: gsap.core.Timeline | null = null;
  private lastStep = 0;

  seer!: { group: THREE.Group; eyes: THREE.Mesh[]; hands: THREE.Group[] };
  chicken!: THREE.Group;
  private lamp!: THREE.Group;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene.background = new THREE.Color('#0f0a07');
    this.scene.fog = new THREE.Fog('#0f0a07', 5, 13);

    this.buildRoom();
    this.buildLights();
    this.buildTable();
    this.buildSeer();
    this.buildProps();
    this.buildDust();

    this.camera.position.copy(this.basePos);
    this.camera.lookAt(this.look);

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.parallaxTarget.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    });
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /* ------------------------------------------------------------ public API */

  onUpdate(fn: (dt: number, t: number) => void) {
    this.updaters.push(fn);
  }

  /** Stop rendering while a full-screen overlay hides the scene. */
  setActive(active: boolean) {
    this.active = active;
    if (active) this.timer.reset();
  }

  poseFor(name: PoseName): CameraPose {
    const pose = POSES[name];
    const aspect = this.camera.aspect;
    if (name === 'reading') {
      // Back away along a diagonal until the spread (≈1.05 m wide) fits horizontally,
      // lowering the angle as needed so the camera stays under the lamp and ceiling.
      const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * aspect);
      const dist = Math.min(Math.max(1.43, 0.525 / Math.tan(hfov / 2)), 2.4);
      const elev = Math.min(THREE.MathUtils.degToRad(56), Math.asin(Math.min(1, 1.45 / dist)));
      const [lx, ly, lz] = pose.look;
      return {
        pos: [lx, ly + Math.sin(elev) * dist, lz + Math.cos(elev) * dist],
        look: [lx, ly, lz + (aspect < 1 ? 0.06 : 0)],
      };
    }
    if (name === 'seated' && aspect < 1) {
      return { pos: [0, 1.36, 1.9], look: pose.look };
    }
    return pose;
  }

  /** Tween the camera to a named pose. */
  moveTo(name: PoseName, duration = 1.6, ease = 'power2.inOut') {
    this.exitHead();
    this.currentPose = name;
    const pose = this.poseFor(name);
    const tl = gsap.timeline();
    if (reduceMotion) {
      // No camera travel: fade out, cut to the new framing, fade back in.
      const canvas = this.renderer.domElement;
      tl.to(canvas, { opacity: 0, duration: 0.25 })
        .call(() => {
          this.basePos.set(...pose.pos);
          this.look.set(...pose.look);
        })
        .to(canvas, { opacity: 1, duration: 0.35 });
      return tl;
    }
    tl.to(this.basePos, { x: pose.pos[0], y: pose.pos[1], z: pose.pos[2], duration, ease }, 0);
    tl.to(this.look, { x: pose.look[0], y: pose.look[1], z: pose.look[2], duration, ease }, 0);
    return tl;
  }

  /** Shift the scene on screen by (x, y) px, e.g. to make room for a panel. */
  setFocus(x: number, y: number) {
    gsap.to(this.focus, { x, y, duration: 0.8, ease: 'power2.inOut', overwrite: true });
  }

  jumpTo(name: PoseName) {
    this.exitHead();
    this.currentPose = name;
    const pose = this.poseFor(name);
    this.basePos.set(...pose.pos);
    this.look.set(...pose.look);
  }

  /**
   * Leave the room on foot and end on the title framing (the `outside` pose):
   * stand up still facing the seer, turn the head toward the door, walk out with a head bob,
   * stop in the tunnel and take one last look back.
   */
  walkOut() {
    if (reduceMotion) return this.moveTo('outside');
    this.walkTl?.kill();
    // Start the rig from exactly where the camera is now, so nothing jumps.
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const from = this.camera.position.clone();
    const startAim = aim(dir);
    Object.assign(this.head, { x: from.x, y: from.y, z: from.z, ...startAim, roll: 0, bob: 0, par: 0 });
    this.headMode = true;
    this.setFocus(0, 0);

    const seerFace = new THREE.Vector3(0, 1.36, -0.95);
    const stand = new THREE.Vector3(0.04, 1.66, 1.55);
    const standAim = aim(seerFace.clone().sub(stand));
    const out = POSES.outside;
    const outAim = aim(new THREE.Vector3(...out.look).sub(new THREE.Vector3(...out.pos)));
    const h = this.head;

    const tl = gsap.timeline({
      onComplete: () => {
        this.headMode = false;
        this.walkTl = null;
        this.jumpTo('outside');
      },
    });
    this.walkTl = tl;

    // 1. Stand up, eyes still on the seer.
    tl.to(h, { x: stand.x, y: stand.y, z: stand.z, duration: 1.2, ease: 'power2.inOut' }, 0);
    tl.to(h, { yaw: standAim.yaw, pitch: standAim.pitch, duration: 1.2, ease: 'power2.inOut' }, 0);
    tl.to(h, { roll: 0.025, duration: 0.6, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0.3);
    // A small nod goodbye.
    tl.to(h, { pitch: standAim.pitch - 0.07, duration: 0.3, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 1.5);

    // 2. Turn toward the door. The head stops briefly on the passage the "B →" points to,
    //    then the body follows round while stepping around the table edge.
    tl.addLabel('turn', 2.35);
    tl.to(h, { yaw: -Math.PI / 2 + 0.12, pitch: -0.05, duration: 0.85, ease: 'power2.inOut' }, 'turn');
    tl.to(h, { yaw: -Math.PI, pitch: -0.03, duration: 0.85, ease: 'power2.inOut' }, 'turn+=1.25');
    tl.to(h, { x: 0.22, z: 1.8, duration: 2, ease: 'sine.inOut' }, 'turn');
    tl.to(h, { roll: -0.035, duration: 1, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 'turn');

    // 3. Walk out through the door and down the tunnel.
    tl.addLabel('walk', 'turn+=1.75');
    tl.to(h, { bob: 1, duration: 0.5 }, 'walk');
    tl.to(h, { x: 0, y: 1.64, z: 6.75, duration: 3.4, ease: 'power1.inOut' }, 'walk');
    tl.to(h, { yaw: -Math.PI + 0.07, duration: 1.7, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 'walk');

    // 4. Slow down, glance back over the shoulder, then turn around: that's the title view.
    tl.addLabel('stop', 'walk+=3');
    tl.to(h, { bob: 0, duration: 0.6 }, 'stop');
    // The glance goes far enough to catch the lit doorway at the edge of view, holds, then commits.
    tl.to(h, { yaw: -Math.PI - 2.35, pitch: -0.03, roll: 0.02, duration: 1.3, ease: 'power2.inOut' }, 'stop+=0.4');
    tl.to(h, { yaw: -2 * Math.PI + outAim.yaw, pitch: outAim.pitch, roll: 0, duration: 1.4, ease: 'power2.inOut' }, '>+0.6');
    tl.to(h, { x: out.pos[0], y: out.pos[1], z: out.pos[2], duration: 1.4, ease: 'power2.inOut' }, '<');
    tl.to(h, { par: 1, duration: 1 }, '<0.4');
    return tl;
  }

  private exitHead() {
    if (!this.headMode) return;
    this.walkTl?.kill();
    this.walkTl = null;
    this.headMode = false;
  }

  /** Raycast from a pointer event against the given objects. */
  pick(e: { clientX: number; clientY: number }, objects: THREE.Object3D[]) {
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(objects, true)[0] ?? null;
  }

  /** Screen position (px) of a world point, for DOM labels. */
  project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, visible: p.z < 1 };
  }

  /** Make the seer reach toward a point on the table, then rest again. */
  seerReach(x: number, z: number) {
    const hand = x < 0 ? this.seer.hands[0] : this.seer.hands[1];
    const home = hand.userData.home as THREE.Vector3;
    return gsap
      .timeline()
      .to(hand.position, { x, z, y: TABLE_Y + 0.05, duration: 0.35, ease: 'power2.out' })
      .to(hand.position, { x: home.x, y: home.y, z: home.z, duration: 0.5, ease: 'power2.inOut' }, '+=0.15');
  }

  /* ------------------------------------------------------------- internals */

  private resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 62 : 50;
    this.camera.updateProjectionMatrix();
    if (!gsap.isTweening(this.basePos)) this.jumpTo(this.currentPose);
  }

  private tick() {
    if (!this.active) return;
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const t = this.timer.getElapsed();
    this.parallax.lerp(this.parallaxTarget, 1 - Math.pow(0.002, dt));
    const sway = reduceMotion ? 0 : this.currentPose === 'reading' ? 0.04 : 0.12;
    if (this.headMode) {
      this.updateHead(t, sway);
    } else {
      this.camera.position.set(
        this.basePos.x + this.parallax.x * sway,
        this.basePos.y - this.parallax.y * sway * 0.5,
        this.basePos.z,
      );
      this.camera.lookAt(this.look);
    }
    if (this.focus.x || this.focus.y) {
      this.camera.setViewOffset(innerWidth, innerHeight, -this.focus.x, -this.focus.y, innerWidth, innerHeight);
    } else if (this.camera.view) {
      this.camera.clearViewOffset();
    }
    for (const fn of this.updaters) fn(dt, t);
    this.renderer.render(this.scene, this.camera);
  }

  /** Apply the head rig: walking bob (one bump per step), sway, and footsteps in sync. */
  private updateHead(t: number, sway: number) {
    const h = this.head;
    const STEP = 0.42;
    const phase = (t / STEP) * Math.PI;
    const bobY = (Math.abs(Math.sin(phase)) - 0.6) * 0.045 * h.bob;
    const bobX = Math.sin(phase) * 0.018 * h.bob;
    this.camera.position.set(
      h.x + bobX + this.parallax.x * sway * h.par,
      h.y + bobY - this.parallax.y * sway * 0.5 * h.par,
      h.z,
    );
    this.camera.rotation.set(h.pitch + bobY * 0.4, h.yaw, h.roll + bobX * 0.6, 'YXZ');
    const step = Math.floor(t / STEP);
    if (step !== this.lastStep) {
      this.lastStep = step;
      if (h.bob > 0.35) sfx.step();
    }
  }

  private buildRoom() {
    const { w, d, h } = ROOM;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d + 6),
      new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 3;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 1 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = h;
    this.scene.add(ceiling);

    // Ceiling beams
    const beamMat = new THREE.MeshStandardMaterial({ color: '#3b2817', roughness: 0.9 });
    for (let i = -2; i <= 2; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.18), beamMat);
      beam.position.set(0, h - 0.08, i * 1.2);
      this.scene.add(beam);
    }

    const wall = (mark: 'A' | 'B' | undefined, width: number) => {
      const tex = plasterTexture(mark);
      tex.repeat.set(width / 6, 1);
      return new THREE.Mesh(
        new THREE.PlaneGeometry(width, h),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
      );
    };

    const back = wall(undefined, w);
    back.position.set(0, h / 2, -d / 2);
    this.scene.add(back);
    back.receiveShadow = true;
    this.buildPassages();

    // Front wall with a doorway
    const doorW = 1.2;
    const doorH = 2.3;
    const side = (w - doorW) / 2;
    const frontMat = new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.95, side: THREE.DoubleSide });
    const thick = 0.3;
    const fl = new THREE.Mesh(new THREE.BoxGeometry(side, h, thick), frontMat);
    fl.position.set(-(doorW / 2 + side / 2), h / 2, d / 2);
    const fr = fl.clone();
    fr.position.x *= -1;
    const top = new THREE.Mesh(new THREE.BoxGeometry(doorW, h - doorH, thick), frontMat);
    top.position.set(0, doorH + (h - doorH) / 2, d / 2);
    this.scene.add(fl, fr, top);

    // Wooden door frame
    const frameMat = new THREE.MeshStandardMaterial({ color: '#4a3220', roughness: 0.8 });
    const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH, thick + 0.06), frameMat);
    jambL.position.set(-doorW / 2, doorH / 2, d / 2);
    const jambR = jambL.clone();
    jambR.position.x *= -1;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.2, 0.12, thick + 0.06), frameMat);
    lintel.position.set(0, doorH, d / 2);
    this.scene.add(jambL, jambR, lintel);

    // Dark tunnel leading to the door (where the intro starts)
    const tunnelMat = new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 1, side: THREE.DoubleSide });
    const tunnelLen = 6;
    // Right side wall; the left one has the turn toward A (see buildPassages).
    const tw = new THREE.Mesh(new THREE.PlaneGeometry(tunnelLen, 2.7), tunnelMat);
    tw.rotation.y = -Math.PI / 2;
    tw.position.set(1.0, 1.35, d / 2 + tunnelLen / 2);
    tw.receiveShadow = true;
    this.scene.add(tw);
    const tunnelTop = new THREE.Mesh(new THREE.PlaneGeometry(2, tunnelLen), beamMat);
    tunnelTop.rotation.x = Math.PI / 2;
    tunnelTop.position.set(0, 2.7, d / 2 + tunnelLen / 2);
    this.scene.add(tunnelTop);

    // Dead end of the tunnel, seen while walking out: spray-painted "A →" and a weak bulb.
    const endTex = plasterTexture('A');
    endTex.repeat.set(0.6, 1);
    endTex.offset.x = 0.08;
    const end = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2.7),
      new THREE.MeshStandardMaterial({ map: endTex, roughness: 1 }),
    );
    end.rotation.y = Math.PI;
    end.position.set(0, 1.35, d / 2 + tunnelLen);
    end.receiveShadow = true;
    const endLight = new THREE.PointLight('#ffb36b', 1.6, 3.2, 1.5);
    endLight.position.set(0.5, 2.3, d / 2 + tunnelLen - 0.6);
    this.scene.add(end, endLight);
  }

  /**
   * The spray-painted arrows lead somewhere: "B →" on the right wall, "A →" on the left wall,
   * and "A →" at the end of the entry tunnel, which turns right toward A.
   */
  private buildPassages() {
    const { w, d, h } = ROOM;
    this.wallWithPassage({
      tex: plasterTexture('B'),
      origin: new THREE.Vector3(w / 2, 0, -d / 2),
      out: new THREE.Vector3(1, 0, 0),
      length: d,
      height: h,
      gap: { u0: 3.55, u1: 4.75, h: 2.3 },
      depth: 6,
      light: '#8fa6c8',
    });
    this.wallWithPassage({
      tex: plasterTexture('A'),
      origin: new THREE.Vector3(-w / 2, 0, d / 2),
      out: new THREE.Vector3(-1, 0, 0),
      length: d,
      height: h,
      gap: { u0: 3.35, u1: 4.55, h: 2.3 },
      depth: 6,
      light: '#8fa6c8',
    });
    // Left side of the entry tunnel (seen as "right" while walking out), right before its end wall.
    this.wallWithPassage({
      tex: plasterTexture(),
      origin: new THREE.Vector3(-1, 0, d / 2 + 6),
      out: new THREE.Vector3(-1, 0, 0),
      length: 6,
      height: 2.7,
      gap: { u0: 0.15, u1: 1.35, h: 2.3 },
      depth: 5,
      light: '#ffb36b',
      doubleSided: true,
    });
  }

  /**
   * A plaster wall with a framed opening and a short dark passage behind it.
   *
   * The wall is described in its own (u, y) coordinates: `origin` is u = 0 at floor level, `out` is the
   * horizontal direction from the viewer through the wall, and u runs along the wall so that
   * (u, up, -out) is a right-handed frame. `tex` covers the whole wall; each piece reuses a slice of it,
   * so painted marks stay continuous around the opening.
   */
  private wallWithPassage(o: {
    tex: THREE.Texture;
    origin: THREE.Vector3;
    out: THREE.Vector3;
    length: number;
    height: number;
    gap: { u0: number; u1: number; h: number };
    depth: number;
    light: THREE.ColorRepresentation;
    doubleSided?: boolean;
  }) {
    const up = new THREE.Vector3(0, 1, 0);
    const out = o.out.clone().normalize();
    const facing = out.clone().negate();
    const uDir = new THREE.Vector3().crossVectors(up, facing);
    const at = (u: number, y: number, depth = 0) =>
      o.origin.clone().addScaledVector(uDir, u).addScaledVector(up, y).addScaledVector(out, depth);
    // Orient a plane / box so its local X, Y, Z map to the given world axes.
    const orient = (obj: THREE.Object3D, x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) => {
      obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    };
    const side = o.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    const { u0, u1, h: gh } = o.gap;

    const piece = (a: number, b: number, y0: number, y1: number) => {
      const t = o.tex.clone();
      t.needsUpdate = true;
      t.repeat.set((b - a) / o.length, (y1 - y0) / o.height);
      t.offset.set(a / o.length, y0 / o.height);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(b - a, y1 - y0),
        new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side }),
      );
      orient(m, uDir, up, facing);
      m.position.copy(at((a + b) / 2, (y0 + y1) / 2));
      m.receiveShadow = true;
      this.scene.add(m);
    };
    piece(0, u0, 0, o.height);
    piece(u1, o.length, 0, o.height);
    piece(u0, u1, gh, o.height);

    // Wooden frame, matching the main door.
    const frameMat = new THREE.MeshStandardMaterial({ color: '#4a3220', roughness: 0.8 });
    for (const u of [u0, u1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.1, gh, 0.3), frameMat);
      orient(jamb, uDir, up, facing);
      jamb.position.copy(at(u, gh / 2, 0.1));
      jamb.castShadow = true;
      this.scene.add(jamb);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0 + 0.2, 0.12, 0.3), frameMat);
    orient(lintel, uDir, up, facing);
    lintel.position.copy(at((u0 + u1) / 2, gh, 0.1));
    this.scene.add(lintel);

    // The passage: floor, side walls, low ceiling and a far wall, fading into the dark.
    const width = u1 - u0;
    const uc = (u0 + u1) / 2;
    const mid = (y: number) => at(uc, y, o.depth / 2);

    const ftex = floorTexture();
    ftex.repeat.set(o.depth / 1.5, width / 1.5);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(o.depth, width),
      new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.95 }),
    );
    orient(floor, out, new THREE.Vector3().crossVectors(up, out), up);
    floor.position.copy(mid(0.001));
    floor.receiveShadow = true;

    const roof = new THREE.Mesh(
      new THREE.PlaneGeometry(o.depth, width),
      new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 1 }),
    );
    const down = up.clone().negate();
    orient(roof, out, new THREE.Vector3().crossVectors(down, out), down);
    roof.position.copy(mid(gh));

    const wallTex = plasterTexture();
    wallTex.repeat.set(o.depth / 6, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 });
    for (const [u, n] of [[u0, uDir], [u1, uDir.clone().negate()]] as const) {
      const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(o.depth, gh), wallMat);
      orient(sideWall, new THREE.Vector3().crossVectors(up, n), up, n);
      sideWall.position.copy(at(u, gh / 2, o.depth / 2));
      sideWall.receiveShadow = true;
      this.scene.add(sideWall);
    }
    const far = new THREE.Mesh(new THREE.PlaneGeometry(width, gh), wallMat);
    orient(far, uDir, up, facing);
    far.position.copy(at(uc, gh / 2, o.depth));
    this.scene.add(floor, roof, far);

    // A bulb deep inside, so the passage reads as going somewhere.
    const bulb = new THREE.PointLight(o.light, 1.4, 3.2, 1.5);
    bulb.position.copy(at(uc, gh - 0.25, o.depth - 1.4));
    this.scene.add(bulb);
    const seed = Math.random() * 10;
    this.updaters.push((_dt, t) => {
      bulb.intensity = Math.sin(t * 6.3 + seed) > 0.95 ? 0.5 : 1.4;
    });
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight('#5b6a8a', '#2b1a0d', 0.55));

    // Hanging lamp over the table
    this.lamp = new THREE.Group();
    this.lamp.position.set(0, ROOM.h, -0.1);
    const cordLen = 1.05;
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, cordLen),
      new THREE.MeshBasicMaterial({ color: '#111' }),
    );
    cord.position.y = -cordLen / 2;
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.18, 32, 1, true),
      new THREE.MeshStandardMaterial({ color: '#2f3a2c', metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide }),
    );
    shade.position.y = -cordLen - 0.06;
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#fff1c9' }),
    );
    bulb.position.y = -cordLen - 0.12;
    const light = new THREE.PointLight('#ffc477', 7, 7, 1.6);
    light.position.y = -cordLen - 0.14;
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.002;
    light.shadow.radius = 4;
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowSprite(), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }),
    );
    glow.scale.setScalar(0.7);
    glow.position.y = bulb.position.y;
    this.lamp.add(cord, shade, bulb, light, glow);
    this.scene.add(this.lamp);

    // Cold bulb halfway down the tunnel
    const tunnelLight = new THREE.PointLight('#8fa6c8', 2.2, 4, 1.5);
    tunnelLight.position.set(0, 2.4, ROOM.d / 2 + 2.5);
    this.scene.add(tunnelLight);
    this.updaters.push((_dt, t) => {
      tunnelLight.intensity = Math.sin(t * 9) > 0.92 ? 0.4 : 2.2;
    });

    // Cool fill from the back so the seer's silhouette reads
    const rim = new THREE.PointLight('#5a7bb5', 3, 4, 1.5);
    rim.position.set(0, 2, -2.6);
    this.scene.add(rim);

    this.updaters.push((_dt, t) => {
      const swing = reduceMotion ? 0 : 1;
      this.lamp.rotation.z = Math.sin(t * 0.7) * 0.035 * swing;
      this.lamp.rotation.x = Math.sin(t * 0.53 + 1) * 0.025 * swing;
      // Occasional voltage flicker
      const flicker = Math.sin(t * 23) > 0.985 ? 0.55 : 1;
      light.intensity = 7 * flicker;
    });
  }

  private buildTable() {
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.04, 1.05),
      [
        ...Array(2).fill(new THREE.MeshStandardMaterial({ color: '#4e1816', roughness: 1 })),
        new THREE.MeshStandardMaterial({ map: clothTexture(), roughness: 0.95 }),
        ...Array(3).fill(new THREE.MeshStandardMaterial({ color: '#4e1816', roughness: 1 })),
      ],
    );
    top.position.y = TABLE_Y - 0.02;
    top.receiveShadow = true;
    top.castShadow = true;
    const drape = new THREE.Mesh(
      new THREE.BoxGeometry(1.62, 0.5, 1.07),
      new THREE.MeshStandardMaterial({ color: '#4a1614', roughness: 1 }),
    );
    drape.position.y = TABLE_Y - 0.29;
    drape.castShadow = true;
    drape.receiveShadow = true;
    const legMat = new THREE.MeshStandardMaterial({ color: '#2e1d10' });
    for (const [x, z] of [[-0.7, -0.45], [0.7, -0.45], [-0.7, 0.45], [0.7, 0.45]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), legMat);
      leg.position.set(x, 0.13, z);
      this.table.add(leg);
    }
    this.table.add(top, drape);
    this.scene.add(this.table);

    // Candle with a flickering flame
    const candle = new THREE.Group();
    const wax = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.034, 0.14, 16),
      new THREE.MeshStandardMaterial({ color: '#efe2c4', roughness: 0.6 }),
    );
    wax.position.y = 0.07;
    wax.castShadow = true;
    const flame = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowSprite('255,170,70'), blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flame.scale.set(0.07, 0.12, 1);
    flame.position.y = 0.17;
    const candleLight = new THREE.PointLight('#ff9a3d', 1.2, 2.2, 1.8);
    candleLight.position.y = 0.2;
    candle.add(wax, flame, candleLight);
    candle.position.set(0.62, TABLE_Y, -0.36);
    this.scene.add(candle);
    this.updaters.push((_dt, t) => {
      const f = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 31) * 0.06;
      candleLight.intensity = 1.2 * f;
      flame.scale.set(0.07 * f, 0.12 * (0.9 + f * 0.15), 1);
    });
  }

  private buildSeer() {
    const group = new THREE.Group();
    group.position.set(0, 0, -0.95);
    const robeMat = new THREE.MeshStandardMaterial({ color: '#2a2530', roughness: 0.95 });
    const hoodMat = new THREE.MeshStandardMaterial({ color: '#2a1f1a', roughness: 1, side: THREE.DoubleSide });
    const maskMat = new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.9 });

    const body = new THREE.Group();
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.46, 1.12, 24, 1, true), robeMat);
    robe.position.y = 0.56;
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), robeMat);
    shoulders.scale.set(1.2, 0.62, 0.8);
    shoulders.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), maskMat);
    head.position.set(0, 1.33, 0.02);
    // Open sphere; the gap (around phi = 0, i.e. -X) is rotated to face the viewer (+Z).
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16, Math.PI * 0.22, Math.PI * 1.56, 0, Math.PI * 0.8), hoodMat);
    hood.rotation.y = Math.PI / 2;
    hood.scale.set(1, 1.15, 1.05);
    hood.position.set(0, 1.36, -0.01);

    const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffd36b' });
    const eyes = [-0.04, 0.04].map((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), eyeMat);
      eye.scale.set(1.5, 0.7, 0.5);
      eye.position.set(x, 1.345, 0.138);
      return eye;
    });
    const eyeGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowSprite('255,200,90'), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }),
    );
    eyeGlow.scale.set(0.22, 0.08, 1);
    eyeGlow.position.set(0, 1.345, 0.14);

    body.add(robe, shoulders, head, hood, ...eyes, eyeGlow);
    for (const m of [robe, shoulders, head, hood]) m.castShadow = true;
    group.add(body);

    // Gloved hands resting on the table
    const gloveMat = new THREE.MeshStandardMaterial({ color: '#1b1a18', roughness: 0.7 });
    const sleeveMat = robeMat;
    const hands = [-0.26, 0.26].map((x) => {
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), gloveMat);
      palm.scale.set(1, 0.55, 1.3);
      hand.position.set(x, TABLE_Y + 0.025, -0.38);
      // Sleeve runs from the wrist back up to the shoulder.
      const shoulder = new THREE.Vector3(Math.sign(x) * 0.2, 1.08, -0.95).sub(hand.position);
      const len = shoulder.length();
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, len, 12), sleeveMat);
      sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shoulder.clone().normalize());
      sleeve.position.copy(shoulder.multiplyScalar(0.5));
      hand.add(palm, sleeve);
      hand.userData.home = hand.position.clone();
      palm.castShadow = sleeve.castShadow = true;
      this.scene.add(hand);
      return hand;
    });

    this.scene.add(group);
    this.seer = { group, eyes, hands };

    // Breathing and blinking
    gsap.to(body.scale, { y: 1.015, duration: 2.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.to(body.rotation, { z: 0.015, duration: 4.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    const blink = () => {
      gsap.to(eyes.map((e) => e.scale), {
        y: 0.05,
        duration: 0.07,
        yoyo: true,
        repeat: 1,
        onComplete: () => void gsap.delayedCall(2 + Math.random() * 4, blink),
      });
    };
    gsap.delayedCall(2, blink);
  }

  private buildProps() {
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 });
    const crate = (size: number, x: number, y: number, z: number, ry = 0) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
      c.position.set(x, y + size / 2, z);
      c.rotation.y = ry;
      c.castShadow = c.receiveShadow = true;
      this.scene.add(c);
      return c;
    };
    crate(0.8, -2.4, 0, -2.4, 0.1);
    crate(0.6, -2.35, 0.8, -2.35, -0.25);
    crate(0.7, -1.6, 0, -2.5, 0.4);
    crate(0.8, 2.35, 0, -2.3, -0.2);
    crate(0.55, 2.45, 0, -1.3, 0.3);
    crate(0.7, -2.4, 0, 1.9, 0.15);
    crate(0.5, 2.5, 0, 2.2, -0.4);

    this.chicken = this.buildChicken();
    this.chicken.position.set(-2.3, 1.4, -2.2);
    this.chicken.rotation.y = 0.7;
    this.scene.add(this.chicken);

    // Finished cards framed on the back wall
    const finished = ARCANA.filter((a) => a.image);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#3a2716', roughness: 0.7 });
    finished.slice(0, 4).forEach((card, i, list) => {
      const slot = list.length === 1 ? 0 : i / (list.length - 1) - 0.5;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.98, 0.04), frameMat);
      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(0.52, 0.89),
        new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      );
      art.position.z = 0.021;
      frame.add(art);
      const x = slot * 3.2 + (slot < 0 ? -0.2 : 0.2);
      frame.position.set(x, 1.75, -ROOM.d / 2 + 0.04);
      frame.rotation.z = (i % 2 ? 1 : -1) * 0.02;
      frame.castShadow = true;
      this.scene.add(frame);
      void frontTexture(card).then((tex) => {
        art.material.map = tex;
        art.material.needsUpdate = true;
      });
    });
  }

  private buildChicken() {
    const g = new THREE.Group();
    const feathers = new THREE.MeshStandardMaterial({ color: '#c46a2b', roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: '#7e3b18', roughness: 0.9 });
    const red = new THREE.MeshStandardMaterial({ color: '#c3271d', roughness: 0.6 });
    const yellow = new THREE.MeshStandardMaterial({ color: '#e7b13b', roughness: 0.6 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), feathers);
    body.scale.set(0.9, 0.85, 1.25);
    body.position.y = 0.13;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 12), dark);
    tail.position.set(0, 0.2, -0.12);
    tail.rotation.x = -0.9;
    const neck = new THREE.Group();
    neck.position.set(0, 0.2, 0.08);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), feathers);
    head.position.set(0, 0.06, 0.02);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 8), yellow);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.055, 0.075);
    const comb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), red);
    comb.scale.set(0.5, 1, 1.4);
    comb.position.set(0, 0.115, 0.02);
    const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), red);
    wattle.position.set(0, 0.025, 0.065);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#000' });
    const eyes = [-0.032, 0.032].map((x) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), eyeMat);
      e.position.set(x, 0.07, 0.05);
      return e;
    });
    neck.add(head, beak, comb, wattle, ...eyes);
    const legs = [-0.035, 0.035].map((x) => {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07), yellow);
      l.position.set(x, 0.035, 0);
      return l;
    });
    g.add(body, tail, neck, ...legs);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    g.scale.setScalar(1.6);

    const peck = () => {
      gsap
        .timeline({ onComplete: () => void gsap.delayedCall(1.5 + Math.random() * 3, peck) })
        .to(neck.rotation, { x: 0.9, duration: 0.12, ease: 'power2.in' })
        .to(neck.rotation, { x: 0, duration: 0.18 })
        .to(neck.rotation, { y: (Math.random() - 0.5) * 1.2, duration: 0.25 }, '+=0.3');
    };
    gsap.delayedCall(1, peck);
    g.userData.neck = neck;
    return g;
  }

  /** Easter egg: poke the chicken. */
  pokeChicken() {
    sfx.chicken();
    const c = this.chicken;
    gsap
      .timeline()
      .to(c.position, { y: '+=0.25', duration: 0.18, ease: 'power2.out' })
      .to(c.rotation, { y: '+=' + Math.PI * 2, duration: 0.4, ease: 'power1.inOut' }, 0)
      .to(c.position, { y: '-=0.25', duration: 0.25, ease: 'bounce.out' }, 0.2);
  }

  private buildDust() {
    const count = 260;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(Math.random()) * 1.4;
      const a = Math.random() * Math.PI * 2;
      positions.set([Math.cos(a) * r, 0.4 + Math.random() * 2.4, Math.sin(a) * r - 0.1], i * 3);
      speeds[i] = 0.02 + Math.random() * 0.05;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: glowSprite('255,230,190'),
        size: 0.025,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(dust);
    this.updaters.push((dt, t) => {
      for (let i = 0; i < count; i++) {
        let y = positions[i * 3 + 1] + speeds[i] * dt;
        if (y > 2.9) y = 0.4;
        positions[i * 3 + 1] = y;
        positions[i * 3] += Math.sin(t * 0.3 + i) * 0.0006;
      }
      geo.attributes.position.needsUpdate = true;
    });
  }
}
