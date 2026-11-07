import gsap from 'gsap';
import { ARCANA, altText, type Arcanum } from '../data/arcana';
import { COPY } from '../copy';
import * as sfx from '../audio';
import { frontUrl } from '../textures';
import { reduceMotion } from '../prefs';

export class Gallery {
  private readonly root = document.getElementById('gallery')!;
  private readonly grid = this.root.querySelector<HTMLElement>('.gallery-grid')!;
  private built = false;

  constructor(private readonly onOpen: (card: Arcanum, list: Arcanum[]) => void) {}

  show() {
    if (!this.built) this.build();
    this.root.hidden = false;
    this.root.scrollTop = 0;
    gsap.fromTo(this.root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 });
    gsap.fromTo(
      this.grid.querySelectorAll('.g-card'),
      { autoAlpha: 0, y: 40, rotateX: -25 },
      { autoAlpha: 1, y: 0, rotateX: 0, duration: 0.6, stagger: 0.035, ease: 'power3.out', delay: 0.1 },
    );
  }

  hide() {
    this.root.hidden = true;
  }

  private build() {
    this.built = true;
    this.grid.innerHTML = '';
    for (const card of ARCANA) {
      const el = document.createElement('button');
      el.className = 'g-card';
      el.dataset.slug = card.slug;
      if (!card.image) el.classList.add('is-wip');
      el.innerHTML = `
        <div class="g-card-inner">
          <img src="${frontUrl(card)}" alt="" loading="lazy" decoding="async" width="827" height="1417" />
          <span class="sr-only" id="alt-${card.slug}">${altText(card)}</span>
          <span class="g-glare"></span>
        </div>
        <span class="g-meta"><span class="g-num">${card.roman}</span><span class="g-name"></span></span>
        ${card.image ? '' : '<span class="g-badge"></span>'}`;
      el.addEventListener('click', () => {
        sfx.click();
        this.onOpen(card, ARCANA);
      });
      if (!reduceMotion) this.bindTilt(el);
      this.grid.append(el);
    }
    this.renderLabels();
  }

  private bindTilt(el: HTMLElement) {
    const inner = el.querySelector<HTMLElement>('.g-card-inner')!;
    const glare = el.querySelector<HTMLElement>('.g-glare')!;
    const rx = gsap.quickTo(inner, 'rotationX', { duration: 0.4, ease: 'power3.out' });
    const ry = gsap.quickTo(inner, 'rotationY', { duration: 0.4, ease: 'power3.out' });
    gsap.set(inner, { transformPerspective: 700 });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      ry((x - 0.5) * 22);
      rx(-(y - 0.5) * 22);
      glare.style.setProperty('--gx', `${x * 100}%`);
      glare.style.setProperty('--gy', `${y * 100}%`);
    });
    el.addEventListener('pointerenter', () => sfx.swish(0.08, 0.05));
    el.addEventListener('pointerleave', () => {
      rx(0);
      ry(0);
    });
  }

  private renderLabels() {
    this.root.querySelectorAll<HTMLElement>('.g-card').forEach((el) => {
      const card = ARCANA.find((c) => c.slug === el.dataset.slug)!;
      el.querySelector('.g-name')!.textContent = card.title;
      // Short name for the button; the drawing's description is read after it.
      el.setAttribute('aria-label', `${card.roman} · ${card.title}${card.image ? '' : ` (${COPY.gallery.wip})`}`);
      el.setAttribute('aria-describedby', `alt-${card.slug}`);
      const badge = el.querySelector('.g-badge');
      if (badge) badge.textContent = COPY.gallery.wip;
    });
  }
}
