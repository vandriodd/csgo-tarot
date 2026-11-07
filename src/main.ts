import '@fontsource/im-fell-english-sc';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './style.css';

import gsap from 'gsap';
import { ARCANA, type Arcanum } from './data/arcana';
import { COPY } from './copy';
import * as sfx from './audio';
import { isShortcut, setShortcuts, shortcutsOn } from './prefs';
import { frontTexture, loadFonts } from './textures';
import { World } from './scene/World';
import { Reading } from './scene/Reading';
import { Dialogue } from './ui/Dialogue';
import { Gallery } from './ui/Gallery';
import { Inspector } from './ui/Inspector';
import { TitleMenu } from './ui/TitleMenu';

/** title: main menu · intro / talk: scripted dialogue · reading / gallery: the two tabs. */
type Mode = 'loading' | 'title' | 'intro' | 'talk' | 'reading' | 'gallery';
type Tab = 'reading' | 'gallery';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;


// Browsers only allow audio after a user gesture; the first click or key unlocks it.
const unlockAudio = () => {
  sfx.unlock();
  sfx.startAmbience();
};
addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('keydown', unlockAudio, { once: true });

syncSoundButton();
setShortcuts(shortcutsOn());

let mode: Mode = 'loading';

async function boot() {
  const title = new TitleMenu({
    onPlay: () => {
      showTabs(true);
      void runIntro();
    },
    onBrowse: () => {
      showTabs(true);
      go('gallery');
    },
  });

  title.setProgress(0.15);
  await loadFonts();
  title.setProgress(0.4);
  const world = new World($<HTMLCanvasElement>('#scene'));
  // Handy for poking the scene from the console while developing.
  if (import.meta.env.DEV) Object.assign(window, { world });
  title.setProgress(0.65);
  await Promise.all(ARCANA.filter((a) => a.image).map(frontTexture)).catch(() => undefined);
  title.setProgress(1);

  const inspector = new Inspector();
  const openCard = (card: Arcanum, list?: Arcanum[]) => {
    world.setActive(false);
    inspector.open(card, list, () => world.setActive(mode !== 'gallery'));
  };
  const reading = new Reading(world, (card) => openCard(card), () => void leaveTable());
  const gallery = new Gallery((card, list) => openCard(card, list));
  const dialogue = new Dialogue();

  addEventListener('resize', () => reading.applyFocus());

  // Easter egg: poke the chicken. The cursor turns into a hand over it.
  world.renderer.domElement.addEventListener('click', (e) => {
    if (world.pick(e, [world.chicken])) world.pokeChicken();
  });
  world.renderer.domElement.addEventListener('pointermove', (e) => {
    world.renderer.domElement.style.cursor = world.pick(e, [world.chicken]) ? 'pointer' : '';
  });

  /* ------------------------------------------------------- scripted scenes */

  // Each scripted sequence (intro, conversation, walking out) takes a ticket.
  // Navigating anywhere bumps the counter, so stale sequences stop at their next await.
  let ticket = 0;
  const skipBtn = $<HTMLButtonElement>('#skip-intro');
  const steps = gsap.timeline({ paused: true, repeat: 7 }).call(() => sfx.step(), [], 0.42);

  function cancelScenes() {
    ticket++;
    skipBtn.hidden = true;
    steps.pause();
    void dialogue.hide();
  }

  /* ----------------------------------------------------------- navigation */

  const tabs = $('.tabs');
  const canvas = world.renderer.domElement;

  function showTabs(show: boolean) {
    tabs.hidden = !show;
    if (show) gsap.fromTo(tabs, { autoAlpha: 0, y: -10 }, { autoAlpha: 1, y: 0, duration: 0.6 });
  }

  function selectTab(tab: Tab | null) {
    tabs.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    history.replaceState(null, '', tab ? `#${tab}` : location.pathname);
  }

  function go(next: Tab) {
    cancelScenes();
    if (mode === next) return;
    mode = next;
    selectTab(next);
    if (next === 'gallery') {
      reading.hide();
      world.moveTo('gallery', 1);
      canvas.classList.add('is-dimmed');
      gallery.show();
      // Freeze the 3D scene behind the gallery once the camera settles.
      gsap.delayedCall(1, () => mode === 'gallery' && world.setActive(false));
    } else {
      gallery.hide();
      world.setActive(true);
      canvas.classList.remove('is-dimmed');
      reading.show();
    }
  }

  tabs.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.click();
      go(b.dataset.tab as Tab);
    }),
  );
  addEventListener('keydown', (e) => {
    if (mode === 'loading' || mode === 'title' || document.body.dataset.modal) return;
    if (isShortcut(e, 'q')) go('reading');
    if (isShortcut(e, 'e')) go('gallery');
  });

  skipBtn.addEventListener('click', () => {
    sfx.click();
    go('reading');
  });

  // The logo walks you back out to the main menu.
  $('.brand').addEventListener('click', (e) => {
    e.preventDefault();
    if (mode === 'loading' || mode === 'title') return;
    sfx.click();
    void backToMenu();
  });

  /* ----------------------------------------------------------------- intro */

  async function runIntro() {
    const id = ++ticket;
    const alive = () => id === ticket;
    mode = 'intro';
    selectTab(null);
    skipBtn.hidden = false;
    steps.restart();
    const walk = world.moveTo('doorway', 3.4, 'power1.inOut');
    await gsap.delayedCall(1.4, () => undefined).then();
    if (!alive()) return;
    dialogue.show();
    await Promise.all([dialogue.say('narrator', COPY.intro.enter), walk.then()]);
    if (!alive()) return;
    world.moveTo('seated', 2.4);
    await dialogue.say('seer', COPY.intro.greet);
    if (!alive()) return;
    await dialogue.say('seer', COPY.intro.tease);
    if (!alive()) return;
    const choice = await dialogue.ask('seer', COPY.intro.ask, [
      { label: COPY.intro.yes, value: 'reading' },
      { label: COPY.intro.no, value: 'gallery' },
    ]);
    if (!alive()) return;
    await dialogue.say('seer', choice === 'reading' ? COPY.intro.yesReply : COPY.intro.noReply);
    if (!alive()) return;
    go(choice as Tab);
  }

  /* ----------------------------------------------------------- leave table */

  async function leaveTable() {
    const id = ++ticket;
    const alive = () => id === ticket;
    mode = 'talk';
    selectTab(null);
    const gather = reading.leave();
    world.moveTo('seated', 1.6);
    await gather;
    if (!alive()) return;
    dialogue.show();
    const choice = await dialogue.ask('seer', COPY.leave.ask, [
      { label: COPY.leave.again, value: 'again' },
      { label: COPY.leave.deck, value: 'deck' },
      { label: COPY.leave.out, value: 'out' },
    ]);
    if (!alive()) return;
    if (choice === 'again') return go('reading');
    if (choice === 'deck') {
      await dialogue.say('seer', COPY.leave.deckReply);
      if (alive()) go('gallery');
      return;
    }
    await dialogue.say('seer', COPY.leave.outReply);
    if (alive()) void walkOut();
  }

  /** Stand up, turn, walk out down the tunnel and look back: that view is the main menu. */
  async function walkOut() {
    cancelScenes();
    const id = ticket;
    mode = 'title';
    selectTab(null);
    showTabs(false);
    await world.walkOut().then();
    if (id === ticket) title.showMenu();
  }

  async function backToMenu() {
    cancelScenes();
    gallery.hide();
    world.setActive(true);
    canvas.classList.remove('is-dimmed');
    mode = 'talk';
    await reading.leave();
    void walkOut();
  }

  /* ------------------------------------------------------------- start */

  const deepLink = location.hash.slice(1);
  if (deepLink === 'gallery' || deepLink === 'reading') {
    title.hide();
    world.jumpTo('seated');
    showTabs(true);
    go(deepLink);
  } else {
    mode = 'title';
    title.showMenu(true);
  }
}

/* ------------------------------------------------------------- HUD toggles */

function syncSoundButton() {
  $('#sound-toggle').setAttribute('aria-pressed', String(!sfx.isMuted()));
}

$('#shortcuts-toggle').setAttribute('aria-pressed', String(shortcutsOn()));
$('#shortcuts-toggle').addEventListener('click', () => {
  setShortcuts(!shortcutsOn());
  sfx.click();
  $('#shortcuts-toggle').setAttribute('aria-pressed', String(shortcutsOn()));
});

$('#sound-toggle').addEventListener('click', () => {
  sfx.setMuted(!sfx.isMuted());
  sfx.click();
  syncSoundButton();
});

void boot();
