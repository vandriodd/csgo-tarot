import gsap from 'gsap';
import * as sfx from '../audio';

/**
 * Title screen over the 3D tunnel: a loading bar, then the main menu.
 * The play button goes straight in; no queue (CS players wait enough already).
 */
export class TitleMenu {
  private readonly root = document.getElementById('title')!;
  private readonly loading = this.root.querySelector<HTMLElement>('.title-loading')!;
  private readonly bar = this.root.querySelector<HTMLElement>('.progress span')!;
  private readonly menu = this.root.querySelector<HTMLElement>('.title-menu')!;
  private readonly playBtn = document.getElementById('play-btn') as HTMLButtonElement;
  private readonly browseBtn = document.getElementById('browse-deck') as HTMLButtonElement;
  private leaving = false;

  constructor(private readonly handlers: { onPlay: () => void; onBrowse: () => void }) {
    this.playBtn.addEventListener('click', () => this.leave(this.handlers.onPlay));
    this.browseBtn.addEventListener('click', () => this.leave(this.handlers.onBrowse));
  }

  setProgress(p: number) {
    gsap.to(this.bar, { scaleX: p, duration: 0.4, ease: 'power2.out', overwrite: true });
  }

  /** Fade the opaque backdrop away to reveal the tunnel, and show the menu. */
  showMenu(first = false) {
    this.leaving = false;
    this.root.hidden = false;
    this.root.classList.add('is-ready');
    this.loading.hidden = true;
    this.menu.hidden = false;
    gsap.fromTo(this.root, { autoAlpha: 0 }, { autoAlpha: 1, duration: first ? 0.01 : 1 });
    gsap.fromTo(
      this.menu.children,
      { autoAlpha: 0, x: -24 },
      {
        autoAlpha: 1,
        x: 0,
        duration: 0.9,
        stagger: 0.08,
        ease: 'power3.out',
        delay: first ? 0.6 : 0.3,
        // Focus once visible (autoAlpha starts hidden, which can't take focus).
        onComplete: () => this.playBtn.focus({ preventScroll: true }),
      },
    );
  }

  hide() {
    gsap.to(this.root, {
      autoAlpha: 0,
      duration: 0.8,
      onComplete: () => {
        this.root.hidden = true;
      },
    });
  }

  private leave(next: () => void) {
    if (this.leaving) return;
    this.leaving = true;
    sfx.click();
    this.hide();
    next();
  }
}
