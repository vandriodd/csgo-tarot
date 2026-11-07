import * as THREE from 'three';
import gsap from 'gsap';
import { ARCANA, SPREAD, type Arcanum } from '../data/arcana';
import { COPY } from '../copy';
import * as sfx from '../audio';
import { frontTexture } from '../textures';
import { Card3D, CARD_H } from './Card3D';
import { TABLE_Y, type World } from './World';
import { isShortcut, shortcutsOn } from '../prefs';
import { announce } from '../ui/announce';

const DECK_POS = new THREE.Vector3(0, TABLE_Y, -0.3);
const SLOTS = [-0.3, 0, 0.3].map((x) => new THREE.Vector3(x, TABLE_Y, 0.1));
const STACK_GAP = 0.0022;
const REVERSE_CHANCE = 0.35;

interface Drawn {
  card: Card3D;
  arcanum: Arcanum;
  reversed: boolean;
  revealed: boolean;
}

type State = 'idle' | 'busy' | 'dealt' | 'done';

const VERDICT_LINES: Record<'win' | 'loss' | 'ot', string[]> = {
  win: ['The cards back you. Don’t let them down.', 'You win. Buy a defuse kit anyway.'],
  loss: ['Tomorrow is another match. Today… long warmup.', 'The cards don’t lie, but they can be wrong. Play it anyway.'],
  ot: ['The Wheel spun: this goes to overtime.'],
};

export class Reading {
  private readonly deck: Card3D[] = [];
  private drawn: Drawn[] = [];
  private state: State = 'idle';
  private hovered: Card3D | null = null;
  private visible = false;
  private readonly burst = new THREE.PointLight('#ffcf6b', 0, 1.2, 2);

  private readonly ui = document.getElementById('reading-ui')!;
  private readonly dealBtn = document.getElementById('deal-btn') as HTMLButtonElement;
  private readonly leaveBtn = document.getElementById('leave-btn') as HTMLButtonElement;
  private readonly hint = document.getElementById('reading-hint')!;
  private readonly panel = document.getElementById('reading-panel')!;
  private readonly labels: HTMLElement[];

  constructor(
    private readonly world: World,
    private readonly onOpenCard: (card: Arcanum) => void,
    private readonly onLeave: () => void,
  ) {
    for (let i = 0; i < ARCANA.length; i++) {
      const c = new Card3D();
      c.root.position.set(DECK_POS.x, TABLE_Y + 0.002 + i * STACK_GAP, DECK_POS.z);
      c.pivot.rotation.z = (Math.random() - 0.5) * 0.04;
      world.scene.add(c.root);
      this.deck.push(c);
    }
    world.scene.add(this.burst);

    const labelHost = document.getElementById('slot-labels')!;
    this.labels = SPREAD.map((_, i) => {
      const el = document.createElement('div');
      el.className = 'slot-label';
      el.dataset.slot = String(i);
      labelHost.append(el);
      return el;
    });

    this.dealBtn.addEventListener('click', () => void this.deal());
    this.leaveBtn.addEventListener('click', () => this.requestLeave());
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    world.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    world.onUpdate(() => this.updateLabels());
    this.render();
  }

  show() {
    this.visible = true;
    this.ui.hidden = false;
    document.getElementById('slot-labels')!.hidden = false;
    this.world.moveTo('reading', 1.8);
    this.applyFocus();
    gsap.fromTo(this.ui.children, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, stagger: 0.08, delay: 0.8 });
    this.render();
  }

  /** Gather any dealt cards back into the deck and reset, ready for a fresh reading. */
  async leave() {
    const previous = this.drawn;
    this.drawn = [];
    this.state = 'idle';
    this.hide();
    this.render();
    if (previous.length) await this.collect(previous).then();
  }

  private requestLeave() {
    if (!this.visible || this.state === 'busy') return;
    sfx.click();
    this.onLeave();
  }

  hide() {
    this.visible = false;
    this.ui.hidden = true;
    document.getElementById('slot-labels')!.hidden = true;
    this.world.setFocus(0, 0);
    this.setHover(null);
  }

  /** Shift the 3D view away from the side/bottom panel. */
  applyFocus() {
    if (!this.visible) return;
    const portrait = innerWidth < 760;
    const r = this.panel.getBoundingClientRect();
    if (this.panel.hidden) this.world.setFocus(0, 0);
    else if (portrait) this.world.setFocus(0, -Math.min(r.height, innerHeight * 0.45) / 2);
    else this.world.setFocus(-r.width / 2 - 12, 0);
  }

  /* ------------------------------------------------------------ dealing */

  private async deal() {
    if (this.state === 'busy') return;
    sfx.click();
    const previous = this.drawn;
    this.state = 'busy';
    this.drawn = [];
    this.render();

    // Pick three distinct arcana and preload their art while the deck shuffles.
    const picks = [...ARCANA].sort(() => Math.random() - 0.5).slice(0, 3);
    const preload = Promise.all(picks.map(frontTexture));

    const tl = gsap.timeline();
    if (previous.length) tl.add(this.collect(previous));
    tl.add(this.shuffle());
    tl.add(this.shuffle(), '-=0.1');
    await tl.then();
    await preload;

    // The top three cards of the stack are the ones dealt.
    const top = this.deck.slice(-3).reverse();
    this.drawn = top.map((card, i) => ({
      card,
      arcanum: picks[i],
      reversed: Math.random() < REVERSE_CHANCE,
      revealed: false,
    }));
    await Promise.all(this.drawn.map((d) => d.card.setArcanum(d.arcanum)));

    const dealTl = gsap.timeline();
    this.drawn.forEach((d, i) => {
      const slot = SLOTS[i];
      const at = i * 0.42;
      dealTl.add(this.world.seerReach(DECK_POS.x + (i - 1) * 0.08, DECK_POS.z + 0.05), at);
      dealTl.call(() => sfx.swish(0.3, 0.22), [], at + 0.25);
      dealTl.to(d.card.root.position, { x: slot.x, z: slot.z, duration: 0.6, ease: 'power3.out' }, at + 0.25);
      dealTl.to(d.card.root.position, { y: TABLE_Y + 0.12, duration: 0.25, ease: 'power2.out' }, at + 0.25);
      dealTl.to(d.card.root.position, { y: TABLE_Y + 0.002, duration: 0.35, ease: 'power2.in' }, at + 0.5);
      dealTl.to(d.card.pivot.rotation, { z: (Math.random() - 0.5) * 0.08 + (d.reversed ? Math.PI : 0), duration: 0.6 }, at + 0.25);
    });
    await dealTl.then();

    // Dealt cards keep their index in `deck`; `collect` returns them to that height later.
    this.state = 'dealt';
    this.render();
    this.applyFocus();
    announce(
      `${COPY.reading.dealt} ${shortcutsOn() ? COPY.reading.dealtKeys : COPY.reading.dealtButtons}`,
    );
  }

  /** Bring previously dealt cards back on top of the deck, face down. */
  private collect(previous: Drawn[]) {
    const tl = gsap.timeline();
    previous.forEach((d, i) => {
      const idx = this.deck.indexOf(d.card);
      tl.to(d.card.pivot.rotation, { y: Math.PI, duration: 0.4, ease: 'power2.inOut' }, i * 0.08);
      tl.to(d.card.pivot.position, { z: 0, duration: 0.3 }, i * 0.08);
      tl.to(d.card.root.position, {
        x: DECK_POS.x,
        z: DECK_POS.z,
        y: TABLE_Y + 0.002 + idx * STACK_GAP,
        duration: 0.5,
        ease: 'power2.inOut',
      }, 0.3 + i * 0.08);
    });
    tl.call(() => sfx.swish(0.4, 0.2), [], 0.3);
    return tl;
  }

  /** Split the deck in two piles, then riffle them back together in a new order. */
  private shuffle() {
    const tl = gsap.timeline();
    const piles: [Card3D[], Card3D[]] = [[], []];
    this.deck.forEach((c) => piles[Math.random() < 0.5 ? 0 : 1].push(c));

    tl.call(() => sfx.swish(0.25, 0.18));
    piles.forEach((pile, side) => {
      const dir = side ? 1 : -1;
      pile.forEach((c, j) => {
        tl.to(c.root.position, {
          x: DECK_POS.x + dir * 0.19,
          z: DECK_POS.z + 0.02,
          y: TABLE_Y + 0.002 + j * STACK_GAP,
          duration: 0.32,
          ease: 'power2.out',
        }, 0);
        tl.to(c.pivot.rotation, { z: dir * 0.12, duration: 0.32 }, 0);
      });
    });

    // Riffle: interleave from the bottom of each pile.
    const merged: Card3D[] = [];
    const [a, b] = piles;
    while (a.length || b.length) {
      const fromA = a.length && (!b.length || Math.random() < a.length / (a.length + b.length));
      merged.push((fromA ? a : b).shift()!);
    }
    merged.forEach((c, i) => {
      const at = 0.4 + i * 0.022;
      tl.to(c.root.position, { x: DECK_POS.x, z: DECK_POS.z, y: TABLE_Y + 0.002 + i * STACK_GAP, duration: 0.18, ease: 'power1.in' }, at);
      tl.to(c.pivot.rotation, { z: (Math.random() - 0.5) * 0.04, duration: 0.18 }, at);
      tl.to(c.pivot.position, { z: 0, duration: 0.18 }, at);
    });
    tl.call(() => sfx.swish(0.5, 0.12), [], 0.4);
    this.deck.splice(0, this.deck.length, ...merged);
    return tl;
  }

  /* ----------------------------------------------------------- revealing */

  private reveal(index: number) {
    const d = this.drawn[index];
    if (!d || d.revealed || this.state !== 'dealt') return;
    d.revealed = true;
    sfx.flip();
    const p = d.card.pivot;
    const slot = SLOTS[index];
    this.burst.position.set(slot.x, TABLE_Y + 0.25, slot.z);
    this.burst.color.set(d.reversed ? '#ff5a3c' : '#ffcf6b');

    gsap
      .timeline()
      .to(p.position, { z: 0.16, duration: 0.25, ease: 'power2.out' })
      .to(p.rotation, { y: 0, duration: 0.55, ease: 'power3.inOut' }, 0.08)
      .call(() => sfx.chime(d.reversed), [], 0.4)
      .to(this.burst, { intensity: 4, duration: 0.15 }, 0.4)
      .to(this.burst, { intensity: 0, duration: 0.9 }, 0.55)
      .to(p.position, { z: 0, duration: 0.35, ease: 'power2.in' }, 0.55);

    if (this.drawn.every((x) => x.revealed)) this.state = 'done';
    // Keep keyboard focus in the panel if that's where the flip came from.
    const fromPanel = this.panel.contains(document.activeElement);
    this.render();
    this.applyFocus();
    if (fromPanel) this.panel.querySelector<HTMLElement>(`[data-open="${index}"]`)?.focus();

    const spot = SPREAD[index];
    const side = d.reversed ? COPY.reading.reversed : COPY.reading.upright;
    let message = `${spot.label}, ${spot.meaning.toLowerCase()}: ${d.arcanum.title}, ${side}. ${d.reversed ? d.arcanum.reversed : d.arcanum.upright}`;
    if (this.state === 'done') {
      const f = this.forecast();
      message += ` ${COPY.reading.forecast}: ${f.win ? COPY.reading.win : COPY.reading.loss}${f.ot ? `, ${COPY.reading.overtime}` : ''}, ${f.score[0]} to ${f.score[1]}. ${COPY.reading.rating} ${f.rating > 0 ? 'plus' : 'minus'} ${Math.abs(f.rating)}. ${this.verdictLine(f)}`;
    }
    announce(message);
    const row = this.panel.querySelector<HTMLElement>(`[data-slot="${index}"]`);
    if (row) gsap.from(row, { backgroundColor: 'rgba(233,180,60,0.35)', duration: 1.2 });
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ---------------------------------------------------------------- input */

  private onPointerMove(e: PointerEvent) {
    if (!this.visible || this.state === 'busy' || !this.drawn.length) return;
    const hit = this.world.pick(e, this.drawn.flatMap((d) => d.card.meshes));
    this.setHover((hit?.object.userData.card as Card3D) ?? null);
  }

  private setHover(card: Card3D | null) {
    if (card === this.hovered) return;
    if (this.hovered && this.state !== 'busy') gsap.to(this.hovered.pivot.position, { z: 0, duration: 0.2 });
    this.hovered = card;
    document.body.style.cursor = card ? 'pointer' : '';
    if (card) gsap.to(card.pivot.position, { z: 0.025, duration: 0.2 });
  }

  private onClick(e: MouseEvent) {
    if (!this.visible || !this.drawn.length || this.state === 'busy') return;
    const hit = this.world.pick(e, this.drawn.flatMap((d) => d.card.meshes));
    if (!hit) return;
    const idx = this.drawn.findIndex((d) => d.card === hit.object.userData.card);
    const d = this.drawn[idx];
    if (d.revealed) this.onOpenCard(d.arcanum);
    else this.reveal(idx);
  }

  private onKey(e: KeyboardEvent) {
    if (!this.visible || e.target instanceof HTMLInputElement || document.body.dataset.modal) return;
    // Enter deals, unless it's activating a focused button (View card, Flip card…).
    const onControl = (e.target as HTMLElement | null)?.closest?.('button, a');
    if (e.key === 'Enter' && !onControl && this.state !== 'busy' && this.state !== 'dealt') {
      e.preventDefault();
      void this.deal();
    }
    for (const k of ['1', '2', '3']) if (isShortcut(e, k)) this.reveal(Number(k) - 1);
    if (e.key === 'Escape') this.requestLeave();
  }

  /* ------------------------------------------------------------------- UI */

  private updateLabels() {
    if (!this.visible) return;
    const show = this.state !== 'idle' && this.drawn.length > 0;
    this.labels.forEach((el, i) => {
      const p = this.world.project(SLOTS[i].clone().setZ(SLOTS[i].z + CARD_H / 2 + 0.035));
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, 0)`;
      el.style.opacity = show && p.visible ? '1' : '0';
    });
  }

  /**
   * Predicted result under CS2 Premier rules: MR12 (first to 13). A 12-12 goes to MR3 overtime,
   * six rounds where the first to 4 wins, so it ends 16-12, 16-13 or 16-14.
   * Upright cards win the match; the Wheel of Fortune forces overtime.
   * Also returns a Premier CS Rating change, like the end-of-match screen.
   */
  private forecast() {
    const upright = this.drawn.filter((d) => !d.reversed).length;
    const sum = this.drawn.reduce((acc, d) => acc + d.arcanum.number, 0);
    const win = upright >= 2;
    const ot = this.drawn.some((d) => d.arcanum.slug === 'wheel-of-fortune');
    let loser: number;
    let winner: number;
    if (ot) {
      winner = 16;
      loser = 12 + (sum % 3);
    } else {
      winner = 13;
      // 1 or 2 upright cards: a close game. 0 or 3: one team runs away with it.
      const close = upright === 2 || upright === 1;
      loser = close ? 7 + (sum % 5) : sum % 7;
    }
    const margin = winner - loser;
    const rating = (win ? 1 : -1) * (90 + margin * 14 + ((sum * 37) % 60));
    return { win, ot, rating, score: win ? [winner, loser] : [loser, winner] };
  }

  private verdictLine(f: ReturnType<Reading['forecast']>) {
    const pool = VERDICT_LINES[f.ot ? 'ot' : f.win ? 'win' : 'loss'];
    return pool[(f.score[0] + f.score[1]) % pool.length];
  }

  render() {
    this.labels.forEach((el, i) => {
      el.innerHTML = `<b>${i + 1}</b> ${SPREAD[i].label}`;
    });

    const idle = this.state === 'idle';
    this.dealBtn.hidden = this.state === 'busy' || this.state === 'dealt';
    this.leaveBtn.hidden = this.state === 'busy';
    this.dealBtn.querySelector('span')!.textContent = idle ? COPY.reading.shuffle : COPY.reading.again;
    this.hint.textContent =
      this.state === 'dealt' ? COPY.reading.hintFlip : idle ? COPY.reading.hintStart : '';
    this.hint.hidden = !this.hint.textContent;

    this.panel.hidden = this.drawn.length === 0;
    if (this.panel.hidden) return;

    const rows = SPREAD.map((slot, i) => {
      const d = this.drawn[i];
      const head = `<header><span class="slot-num">${i + 1}</span><div><strong>${slot.label}</strong><small>${slot.meaning}</small></div></header>`;
      if (!d || !d.revealed) {
        const action = d
          ? `<button class="link-btn slot-flip" data-reveal="${i}">${COPY.reading.flip}</button>`
          : '<p class="slot-unknown">…</p>';
        return `<li class="slot is-hidden" data-slot="${i}">${head}${action}</li>`;
      }
      const tag = d.reversed
        ? `<span class="tag tag-rev">${COPY.reading.reversed}</span>`
        : `<span class="tag">${COPY.reading.upright}</span>`;
      return `<li class="slot" data-slot="${i}">${head}
        <h3><span class="roman">${d.arcanum.roman}</span> ${d.arcanum.title} ${tag}</h3>
        <p>${d.reversed ? d.arcanum.reversed : d.arcanum.upright}</p>
        <button class="link-btn" data-open="${i}">${COPY.reading.view} →</button>
      </li>`;
    }).join('');

    let verdict = '';
    if (this.state === 'done') {
      const f = this.forecast();
      const line = this.verdictLine(f);
      verdict = `<div class="verdict ${f.win ? 'is-win' : 'is-loss'}">
        <span class="eyebrow">${COPY.reading.forecast}</span>
        <div class="score"><span>${f.score[0]}</span><i>:</i><span>${f.score[1]}</span></div>
        <strong>${f.win ? COPY.reading.win : COPY.reading.loss}${f.ot ? ` · ${COPY.reading.overtime}` : ''}</strong>
        <span class="rating">${COPY.reading.rating} <b>${f.rating > 0 ? '+' : '−'}${Math.abs(f.rating)}</b></span>
        <p>${line}</p>
      </div>`;
    }

    this.panel.innerHTML = `<h2 class="panel-title">${COPY.reading.verdict}</h2><ol class="slots">${rows}</ol>${verdict}`;
    this.panel.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((btn) => {
      btn.addEventListener('click', () => this.onOpenCard(this.drawn[Number(btn.dataset.open)].arcanum));
    });
    this.panel.querySelectorAll<HTMLButtonElement>('[data-reveal]').forEach((btn) => {
      btn.addEventListener('click', () => this.reveal(Number(btn.dataset.reveal)));
    });
    if (this.state === 'done') {
      this.dealBtn.hidden = false;
      this.dealBtn.querySelector('span')!.textContent = COPY.reading.again;
    }
  }
}
