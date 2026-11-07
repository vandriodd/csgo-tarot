import * as THREE from 'three';
import gsap from 'gsap';
import { ARCANA, altText, type Arcanum } from '../data/arcana';
import { COPY } from '../copy';
import * as sfx from '../audio';
import { Card3D } from '../scene/Card3D';
import { isShortcut, reduceMotion } from '../prefs';

/**
 * Full-screen card viewer, like a CS weapon inspect.
 * Drag to rotate, F for the inspect flourish, double-click to flip, wheel to zoom, ← → to browse.
 */
export class Inspector {
  private readonly root = document.getElementById('inspector')!;
  private readonly stage = this.root.querySelector<HTMLElement>('.inspector-stage')!;
  private readonly canvas = this.root.querySelector<HTMLCanvasElement>('canvas')!;
  private readonly info = this.root.querySelector<HTMLElement>('.inspector-info')!;

  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.05, 10);
  private readonly card = new Card3D({ lying: false, glossy: true });
  private readonly sweep = new THREE.PointLight('#fff2d6', 2.5, 3, 1.5);
  private readonly timer = new THREE.Timer();

  private list: Arcanum[] = ARCANA;
  private index = 0;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private readonly drag = { x: 0, y: 0 };
  private zoom = 0.95;
  private busy = false;
  private onCloseCb: (() => void) | null = null;
  /** Element to give focus back to on close (the card or button that opened the inspector). */
  private returnFocus: HTMLElement | null = null;

  constructor() {
    this.camera.position.z = this.zoom;
    this.scene.add(this.card.root);
    this.card.pivot.rotation.y = 0;
    this.scene.add(new THREE.AmbientLight('#fff', 1.15));
    const key = new THREE.DirectionalLight('#fff1dc', 1.1);
    key.position.set(0.6, 0.8, 1.2);
    const rim = new THREE.DirectionalLight('#7ea3d6', 0.8);
    rim.position.set(-1, -0.3, -0.8);
    this.scene.add(key, rim, this.sweep);

    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(this.stage);

    this.root.querySelector('[data-action="close"]')!.addEventListener('click', () => this.close());
    this.root.querySelector('[data-action="prev"]')!.addEventListener('click', () => this.step(-1));
    this.root.querySelector('[data-action="next"]')!.addEventListener('click', () => this.step(1));
    this.root.querySelector('[data-action="inspect"]')!.addEventListener('click', () => this.flourish());
    this.root.querySelector('[data-action="flip"]')!.addEventListener('click', () => this.flip());
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open(card: Arcanum, list: Arcanum[] = ARCANA, onClose?: () => void) {
    this.list = list.includes(card) ? list : ARCANA;
    this.index = this.list.indexOf(card);
    this.onCloseCb = onClose ?? null;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      // Neutral keeps the drawing's hues faithful (ACES would desaturate the art).
      this.renderer.toneMapping = THREE.NeutralToneMapping;
    }
    this.root.hidden = false;
    document.body.dataset.modal = 'inspector';
    this.resize();
    void this.card.setArcanum(card);
    this.card.pivot.rotation.set(0, 0, 0);
    this.renderInfo();
    this.renderer.setAnimationLoop(() => this.tick());

    // Focus once visible: GSAP's autoAlpha starts at visibility:hidden, which can't take focus.
    const closeBtn = this.root.querySelector<HTMLElement>('[data-action="close"]')!;
    gsap.fromTo(
      this.root,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.3, onComplete: () => closeBtn.focus({ preventScroll: true }) },
    );
    gsap.fromTo(this.card.root.position, { y: -0.6 }, { y: 0, duration: 0.7, ease: 'power3.out' });
    gsap.fromTo(this.card.pivot.rotation, { y: -Math.PI * 1.5 }, { y: 0, duration: 0.9, ease: 'power3.out' });
    gsap.fromTo(this.info, { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: 0.5, delay: 0.15 });
    sfx.swish(0.35, 0.2);
  }

  close() {
    if (!this.isOpen) return;
    sfx.click();
    gsap.to(this.root, {
      autoAlpha: 0,
      duration: 0.25,
      onComplete: () => {
        this.root.hidden = true;
        delete document.body.dataset.modal;
        this.renderer?.setAnimationLoop(null);
        this.onCloseCb?.();
        this.returnFocus?.focus({ preventScroll: true });
        this.returnFocus = null;
      },
    });
  }

  private step(dir: 1 | -1) {
    if (this.busy) return;
    this.busy = true;
    this.index = (this.index + dir + this.list.length) % this.list.length;
    const next = this.list[this.index];
    sfx.swish(0.25, 0.18);
    const r = this.card.root;
    gsap
      .timeline({ onComplete: () => void (this.busy = false) })
      .to(r.position, { x: -dir * 0.6, duration: 0.25, ease: 'power2.in' })
      .to(r.rotation, { y: -dir * 0.9, duration: 0.25, ease: 'power2.in' }, 0)
      .call(() => {
        void this.card.setArcanum(next);
        this.card.pivot.rotation.y = 0;
        this.renderInfo();
        gsap.fromTo(this.info, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35 });
      })
      .set(r.position, { x: dir * 0.6 })
      .set(r.rotation, { y: dir * 0.9 })
      .to(r.position, { x: 0, duration: 0.4, ease: 'power3.out' })
      .to(r.rotation, { y: 0, duration: 0.4, ease: 'power3.out' }, '<');
  }

  /** The CS inspect animation: toss, spin, catch. */
  private flourish() {
    if (this.busy) return;
    this.busy = true;
    sfx.swish(0.5, 0.2);
    const p = this.card.pivot;
    const base = Math.round(p.rotation.y / Math.PI) * Math.PI;
    gsap
      .timeline({ onComplete: () => void (this.busy = false) })
      .to(p.position, { y: 0.06, z: 0.12, duration: 0.35, ease: 'power2.out' })
      .to(p.rotation, { y: base + Math.PI * 2, z: 0.25, duration: 0.9, ease: 'power3.inOut' }, 0)
      .to(p.rotation, { x: -0.35, duration: 0.45, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0)
      .to(p.position, { y: 0, z: 0, duration: 0.45, ease: 'back.out(2)' }, 0.55)
      .to(p.rotation, { z: 0, duration: 0.4, ease: 'back.out(2)' }, 0.6)
      .call(() => sfx.flip(), [], 0.8)
      .set(p.rotation, { y: base });
  }

  private flip() {
    if (this.busy) return;
    sfx.flip();
    const p = this.card.pivot;
    const target = Math.round(p.rotation.y / Math.PI) * Math.PI + Math.PI;
    gsap.to(p.rotation, { y: target, duration: 0.6, ease: 'power3.inOut' });
  }

  private bindInput() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
      this.stage.classList.add('is-dragging');
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.drag.y += (e.clientX - this.lastPointer.x) * 0.012;
      this.drag.x += (e.clientY - this.lastPointer.y) * 0.008;
      this.drag.x = THREE.MathUtils.clamp(this.drag.x, -0.9, 0.9);
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });
    const release = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.stage.classList.remove('is-dragging');
      // Fold the drag into the flip state, so a half-turn drag leaves the back showing.
      const p = this.card.pivot;
      const total = p.rotation.y + this.drag.y;
      const snapped = Math.round(total / Math.PI) * Math.PI;
      p.rotation.y = total;
      this.drag.y = 0;
      gsap.to(p.rotation, { y: snapped, duration: 0.8, ease: 'elastic.out(1, 0.6)' });
      gsap.to(this.drag, { x: 0, duration: 0.8, ease: 'elastic.out(1, 0.6)' });
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    this.canvas.addEventListener('dblclick', () => this.flip());
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = THREE.MathUtils.clamp(this.zoom + e.deltaY * 0.0008, 0.55, 1.5);
      },
      { passive: false },
    );
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Tab') this.trapFocus(e);
      else if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowRight') this.step(1);
      else if (e.key === 'ArrowLeft') this.step(-1);
      else if (isShortcut(e, 'f')) this.flourish();
    });
  }

  /** Keep Tab / Shift+Tab cycling inside the dialog while it's open. */
  private trapFocus(e: KeyboardEvent) {
    const items = [...this.root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter(
      (el) => el.offsetParent !== null,
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !this.root.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !this.root.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  private resize() {
    if (!this.renderer) return;
    const { width, height } = this.stage.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private tick() {
    this.timer.update();
    const t = this.timer.getElapsed();
    const r = this.card.root;
    if (!this.busy) {
      const idle = reduceMotion ? 0 : 1;
      r.rotation.y += (this.drag.y + Math.sin(t * 0.6) * 0.12 * idle - r.rotation.y) * 0.18;
      r.rotation.x += (this.drag.x + Math.sin(t * 0.8) * 0.04 * idle - r.rotation.x) * 0.18;
    }
    // Fit the card: farther back if the stage is narrow.
    const fit = this.camera.aspect < 0.62 ? 0.62 / this.camera.aspect : 1;
    this.camera.position.z += (this.zoom * fit - this.camera.position.z) * 0.15;
    // Light sweeping across the clear-coat, like foil catching the light.
    this.sweep.position.set(Math.sin(t * 0.9) * 0.5, Math.cos(t * 0.7) * 0.4, 0.45);
    this.renderer!.render(this.scene, this.camera);
  }

  private renderInfo() {
    const c = this.list[this.index];
    if (!c) return;
    const keywords = c.keywords.join(' · ');
    this.canvas.setAttribute('aria-label', `${c.title}. ${altText(c)}`);
    this.info.innerHTML = `
      <p class="eyebrow">${c.roman} · ${String(c.number).padStart(2, '0')} / ${ARCANA.length - 1}</p>
      <h2 id="inspector-title">${c.title}</h2>
      <p class="keywords">${keywords}</p>
      <section>
        <h3>${COPY.inspect.drawing}</h3>
        ${c.description ? `<p>${c.description}</p>` : `<p class="muted">${COPY.inspect.drawingWip}</p>`}
      </section>
      <section>
        <h3>${COPY.inspect.upright}</h3>
        <p>${c.upright}</p>
      </section>
      <section>
        <h3 class="rev">${COPY.inspect.reversed}</h3>
        <p>${c.reversed}</p>
      </section>`;
  }
}
