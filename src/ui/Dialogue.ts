import gsap from 'gsap';
import { COPY } from '../copy';
import * as sfx from '../audio';
import { shortcutsOn } from '../prefs';
import { announce } from './announce';

export type Speaker = 'narrator' | 'seer';

export interface Choice {
  label: string;
  value: string;
}

/**
 * Bottom dialogue box with a typewriter effect, styled like a CS radio/chat line.
 * Click / Space / Enter skips the typing, then advances. Choices work like a radio menu (keys 1–9).
 */
export class Dialogue {
  private readonly root = document.getElementById('dialogue')!;
  private readonly speakerEl = this.root.querySelector<HTMLElement>('.dialogue-speaker')!;
  private readonly textEl = this.root.querySelector<HTMLElement>('.dialogue-text')!;
  private readonly choicesEl = this.root.querySelector<HTMLElement>('.dialogue-choices')!;
  private readonly continueEl = this.root.querySelector<HTMLElement>('.dialogue-continue')!;

  private tween: gsap.core.Tween | null = null;
  private advance: (() => void) | null = null;
  private currentChoices: Choice[] = [];
  private cancelled = false;

  constructor() {
    this.continueEl.addEventListener('click', () => this.next());
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.next();
    });
    window.addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      // Let Enter / Space activate a focused button (a choice) normally.
      const onButton = (e.target as HTMLElement | null)?.closest?.('button');
      if ((e.key === ' ' || e.key === 'Enter') && !onButton) {
        e.preventDefault();
        this.next();
      }
      const n = Number(e.key);
      if (shortcutsOn() && n >= 1 && n <= this.currentChoices.length) {
        this.choicesEl.querySelectorAll('button')[n - 1]?.click();
      }
    });
  }

  show() {
    this.cancelled = false;
    this.root.hidden = false;
    gsap.fromTo(this.root, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' });
  }

  hide() {
    this.cancelled = true;
    this.tween?.kill();
    this.advance = null;
    return gsap.to(this.root, {
      autoAlpha: 0,
      y: 20,
      duration: 0.35,
      onComplete: () => {
        this.root.hidden = true;
      },
    });
  }

  get isCancelled() {
    return this.cancelled;
  }

  /** Type a line and resolve when the player advances. */
  say(speaker: Speaker, text: string): Promise<void> {
    this.setLine(speaker, text, []);
    return new Promise((resolve) => {
      this.advance = resolve;
    });
  }

  /** Type a line, show choices, and resolve with the picked value. */
  ask(speaker: Speaker, text: string, choices: Choice[]): Promise<string> {
    this.setLine(speaker, text, choices);
    return new Promise((resolve) => {
      this.renderChoices(choices, resolve);
    });
  }

  private setLine(speaker: Speaker, text: string, choices: Choice[]) {
    this.currentChoices = choices;
    this.root.dataset.speaker = speaker;
    this.speakerEl.textContent = speaker === 'seer' ? COPY.seer : '';
    this.speakerEl.hidden = speaker !== 'seer';
    // The typewriter text is hidden from screen readers; they get the whole line at once.
    const options = choices.map((c, i) => `${i + 1}: ${c.label.replace(/[.!?…]+$/, '')}.`).join(' ');
    announce([speaker === 'seer' ? `${COPY.seer}: ${text}` : text, options].filter(Boolean).join(' '));
    this.choicesEl.innerHTML = '';
    this.choicesEl.hidden = true;
    this.continueEl.hidden = true;
    this.type(text, choices.length > 0);
  }

  private type(text: string, hasChoices: boolean) {
    this.tween?.kill();
    const state = { n: 0 };
    let last = 0;
    this.textEl.textContent = '';
    this.tween = gsap.to(state, {
      n: text.length,
      duration: text.length * 0.03,
      ease: 'none',
      onUpdate: () => {
        const n = Math.floor(state.n);
        if (n !== last) {
          this.textEl.textContent = text.slice(0, n);
          if (n % 2 === 0 && text[n - 1] !== ' ') sfx.blip(this.root.dataset.speaker === 'seer' ? 0.8 : 1.2);
          last = n;
        }
      },
      onComplete: () => this.finishTyping(text, hasChoices),
    });
  }

  private finishTyping(text: string, hasChoices: boolean) {
    this.tween = null;
    this.textEl.textContent = text;
    if (hasChoices) {
      this.choicesEl.hidden = false;
      // Opacity only (not autoAlpha): a visibility:hidden button can't receive focus.
      gsap.from(this.choicesEl.children, { opacity: 0, x: -12, stagger: 0.08, duration: 0.3 });
      this.choicesEl.querySelector('button')?.focus({ preventScroll: true });
    } else {
      this.continueEl.hidden = false;
      this.continueEl.focus({ preventScroll: true });
    }
  }

  private next() {
    if (this.tween) {
      this.tween.progress(1);
      return;
    }
    if (this.advance && !this.currentChoices.length) {
      const fn = this.advance;
      this.advance = null;
      sfx.click();
      fn();
    }
  }

  private renderChoices(choices: Choice[], resolve: (v: string) => void) {
    this.choicesEl.innerHTML = '';
    choices.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'radio-option';
      btn.innerHTML = `<kbd>${i + 1}</kbd><span>${c.label}</span>`;
      btn.addEventListener('click', () => {
        sfx.click();
        this.currentChoices = [];
        this.choicesEl.hidden = true;
        resolve(c.value);
      });
      this.choicesEl.append(btn);
    });
  }
}
