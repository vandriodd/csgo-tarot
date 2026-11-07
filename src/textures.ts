import * as THREE from 'three';
import type { Arcanum } from './data/arcana';

/** Source art size from Procreate. */
export const CARD_PX = { w: 827, h: 1417 } as const;

export const PALETTE = {
  parchment: '#e6d6b3',
  parchmentDark: '#cdb88d',
  ink: '#1c1915',
  mustard: '#e9b43c',
  teal: '#79abaa',
  rust: '#d0652f',
  navy: '#26344a',
  blood: '#b3352a',
  olive: '#7d8a55',
};

const DISPLAY_FONT = '"IM Fell English SC", Georgia, serif';

export async function loadFonts() {
  await Promise.all([
    document.fonts.load(`400 120px ${DISPLAY_FONT}`),
    document.fonts.load('600 40px "Barlow Condensed"'),
  ]).catch(() => undefined);
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

/** Deterministic PRNG so placeholders look the same on every load. */
function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed = 1) {
  const r = rng(seed);
  for (let i = 0; i < amount; i++) {
    const x = r() * w;
    const y = r() * h;
    const dark = r() > 0.5;
    ctx.fillStyle = dark ? `rgba(60,40,20,${r() * 0.12})` : `rgba(255,250,235,${r() * 0.15})`;
    ctx.fillRect(x, y, 1 + r() * 2.5, 1 + r() * 2.5);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Outer parchment + inner ink frame, matching the hand-drawn cards. Returns the art box. */
function cardFrame(ctx: CanvasRenderingContext2D, seed: number) {
  const { w, h } = CARD_PX;
  ctx.fillStyle = PALETTE.parchment;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, 9000, seed);
  return { x: 40, y: 40, w: w - 80, h: h - 80 };
}

function toTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ---------------------------------------------------------------- card back */

let backCanvas: HTMLCanvasElement | null = null;

export function cardBackCanvas() {
  if (backCanvas) return backCanvas;
  const [c, ctx] = makeCanvas(CARD_PX.w, CARD_PX.h);
  const box = cardFrame(ctx, 7);
  const cx = CARD_PX.w / 2;
  const cy = CARD_PX.h / 2;

  roundRect(ctx, box.x, box.y, box.w, box.h, 26);
  ctx.fillStyle = PALETTE.navy;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = PALETTE.ink;
  ctx.stroke();

  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, 26);
  ctx.clip();

  // Sun rays
  ctx.strokeStyle = 'rgba(233,180,60,0.22)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r0 = i % 2 ? 190 : 150;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * 900, cy + Math.sin(a) * 900);
    ctx.stroke();
  }
  grain(ctx, CARD_PX.w, CARD_PX.h, 4000, 11);
  ctx.restore();

  // Double gold inner border
  ctx.strokeStyle = PALETTE.mustard;
  ctx.lineWidth = 4;
  roundRect(ctx, box.x + 26, box.y + 26, box.w - 52, box.h - 52, 14);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  roundRect(ctx, box.x + 40, box.y + 40, box.w - 80, box.h - 80, 8);
  ctx.stroke();

  // Crosshair emblem
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, 130, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 8;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40);
    ctx.lineTo(cx + Math.cos(a) * 170, cy + Math.sin(a) * 170);
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.mustard;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();

  // Corner stars
  const star = (x: number, y: number, r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.42 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  const m = 120;
  star(m, m, 26);
  star(CARD_PX.w - m, m, 26);
  star(m, CARD_PX.h - m, 26);
  star(CARD_PX.w - m, CARD_PX.h - m, 26);

  // Title top and bottom (bottom rotated so the back looks the same reversed)
  ctx.font = `64px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = 'ARCANA';
  ctx.fillText(label, cx, 250);
  ctx.save();
  ctx.translate(cx, CARD_PX.h - 250);
  ctx.rotate(Math.PI);
  ctx.fillText(label, 0, 0);
  ctx.restore();

  backCanvas = c;
  return c;
}

/* ---------------------------------------------------------- WIP placeholder */

const PLACEHOLDER_TINTS = [PALETTE.mustard, PALETTE.teal, PALETTE.rust, '#5f7aa6', PALETTE.olive, '#c79a5a'];

export function placeholderCanvas(card: Arcanum) {
  const [c, ctx] = makeCanvas(CARD_PX.w, CARD_PX.h);
  const box = cardFrame(ctx, card.number + 3);
  const titleH = 150;
  const art = { x: box.x, y: box.y, w: box.w, h: box.h - titleH - 24 };
  const tint = PLACEHOLDER_TINTS[card.number % PLACEHOLDER_TINTS.length];

  // Art panel
  roundRect(ctx, art.x, art.y, art.w, art.h, 26);
  ctx.fillStyle = tint;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Hatching, like ink shading
  ctx.strokeStyle = 'rgba(28,25,21,0.13)';
  ctx.lineWidth = 2;
  for (let i = -art.h; i < art.w + art.h; i += 18) {
    ctx.beginPath();
    ctx.moveTo(art.x + i, art.y);
    ctx.lineTo(art.x + i - art.h, art.y + art.h);
    ctx.stroke();
  }
  grain(ctx, CARD_PX.w, CARD_PX.h, 5000, card.number + 20);
  ctx.restore();
  ctx.lineWidth = 7;
  ctx.strokeStyle = PALETTE.ink;
  roundRect(ctx, art.x, art.y, art.w, art.h, 26);
  ctx.stroke();

  const cx = CARD_PX.w / 2;
  const cy = art.y + art.h / 2 + 30;

  // Roman numeral
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `92px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.roman, cx, art.y + 90);

  // Pencil-sketch crosshair in the middle
  ctx.strokeStyle = 'rgba(28,25,21,0.55)';
  ctx.setLineDash([14, 10]);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 190, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.moveTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
    ctx.lineTo(cx + Math.cos(a) * 250, cy + Math.sin(a) * 250);
  }
  ctx.stroke();

  // Rubber stamp
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.22);
  ctx.strokeStyle = PALETTE.blood;
  ctx.fillStyle = PALETTE.blood;
  ctx.globalAlpha = 0.88;
  ctx.lineWidth = 9;
  roundRect(ctx, -300, -88, 600, 176, 14);
  ctx.stroke();
  ctx.lineWidth = 3;
  roundRect(ctx, -284, -72, 568, 144, 8);
  ctx.stroke();
  ctx.font = '700 86px "Barlow Condensed", sans-serif';
  ctx.fillText('WIP', 0, -14);
  ctx.font = '600 34px "Barlow Condensed", sans-serif';
  ctx.fillText('WORK IN PROGRESS', 0, 46);
  // Worn stamp: punch holes in the ink
  ctx.globalCompositeOperation = 'destination-out';
  const r = rng(card.number + 99);
  for (let i = 0; i < 260; i++) {
    ctx.globalAlpha = r() * 0.8;
    ctx.fillRect(-300 + r() * 600, -90 + r() * 180, 2 + r() * 5, 2 + r() * 5);
  }
  ctx.restore();

  // Title box
  const ty = art.y + art.h + 24;
  roundRect(ctx, box.x, ty, box.w, titleH, 10);
  ctx.fillStyle = PALETTE.parchmentDark;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = PALETTE.ink;
  ctx.stroke();
  ctx.fillStyle = PALETTE.ink;
  const title = card.title.toUpperCase();
  let size = 96;
  ctx.font = `${size}px ${DISPLAY_FONT}`;
  while (ctx.measureText(title).width > box.w - 70 && size > 40) {
    size -= 4;
    ctx.font = `${size}px ${DISPLAY_FONT}`;
  }
  ctx.fillText(title, cx, ty + titleH / 2 + 6);

  return c;
}

/* ----------------------------------------------------- card texture access */

const frontCache = new Map<string, Promise<THREE.Texture>>();
const loader = new THREE.TextureLoader();
const placeholderUrls = new Map<string, string>();

export function assetUrl(path: string) {
  return import.meta.env.BASE_URL + path;
}

/** URL usable in an <img>: the real drawing, or a data URL of the placeholder. */
export function frontUrl(card: Arcanum) {
  if (card.image) return assetUrl(card.image);
  let url = placeholderUrls.get(card.slug);
  if (!url) {
    url = placeholderCanvas(card).toDataURL('image/jpeg', 0.85);
    placeholderUrls.set(card.slug, url);
  }
  return url;
}

export function frontTexture(card: Arcanum): Promise<THREE.Texture> {
  let p = frontCache.get(card.slug);
  if (!p) {
    p = card.image
      ? loader.loadAsync(assetUrl(card.image)).then((tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          return tex;
        })
      : Promise.resolve(toTexture(placeholderCanvas(card)));
    frontCache.set(card.slug, p);
  }
  return p;
}

let backTex: THREE.Texture | null = null;
export function backTexture() {
  return (backTex ??= toTexture(cardBackCanvas()));
}

let alphaTex: THREE.Texture | null = null;
/** Rounded-corner mask so the flat card planes don't look like sheets of paper. */
export function cardAlpha() {
  if (alphaTex) return alphaTex;
  const [c, ctx] = makeCanvas(256, 440);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 440);
  ctx.fillStyle = '#fff';
  roundRect(ctx, 1, 1, 254, 438, 14);
  ctx.fill();
  alphaTex = new THREE.CanvasTexture(c);
  return alphaTex;
}

/* ------------------------------------------------------- room / prop textures */

export function plasterTexture(mark?: 'A' | 'B') {
  const [c, ctx] = makeCanvas(1024, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#b78f5a');
  g.addColorStop(0.75, '#a77f4c');
  g.addColorStop(0.76, '#7a5a37');
  g.addColorStop(1, '#6a4c2e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  const r = rng(mark === 'B' ? 5 : 3);
  // Stains and chipped plaster
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${r() > 0.5 ? '70,45,20' : '230,200,150'},${r() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(r() * 1024, r() * 400, 20 + r() * 120, 10 + r() * 60, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Exposed bricks
  for (let i = 0; i < 6; i++) {
    const bx = r() * 900;
    const by = 40 + r() * 280;
    for (let j = 0; j < 3; j++) {
      ctx.fillStyle = 'rgba(120,70,40,0.55)';
      ctx.fillRect(bx + (j % 2) * 26, by + j * 22, 52, 18);
    }
  }
  // Cracks
  ctx.strokeStyle = 'rgba(40,25,10,0.45)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    let x = r() * 1024;
    let y = r() * 380;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (r() - 0.5) * 40;
      y += r() * 22;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, 1024, 512, 14000, 4);
  if (mark) {
    ctx.save();
    ctx.translate(mark === 'A' ? 300 : 330, 230);
    ctx.fillStyle = 'rgba(178,48,36,0.85)';
    ctx.font = `bold 180px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mark, 0, 0);
    // Spray arrow
    ctx.strokeStyle = 'rgba(178,48,36,0.8)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(90, 10);
    ctx.lineTo(220, 10);
    ctx.moveTo(180, -30);
    ctx.lineTo(222, 10);
    ctx.lineTo(180, 50);
    ctx.stroke();
    ctx.restore();
  }
  const tex = toTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export function floorTexture() {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#4a3a2a';
  ctx.fillRect(0, 0, 512, 512);
  const r = rng(8);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const l = 30 + r() * 18;
      ctx.fillStyle = `hsl(32, 26%, ${l}%)`;
      ctx.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
    }
  }
  grain(ctx, 512, 512, 9000, 9);
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

export function crateTexture() {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#8a6a3c';
  ctx.fillRect(0, 0, 512, 512);
  const r = rng(12);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = `hsl(33, 38%, ${30 + r() * 12}%)`;
    ctx.fillRect(0, i * 64 + 2, 512, 60);
    ctx.strokeStyle = 'rgba(40,25,10,0.25)';
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      const yy = i * 64 + 6 + r() * 52;
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(170, yy + (r() - 0.5) * 8, 340, yy + (r() - 0.5) * 8, 512, yy);
      ctx.stroke();
    }
  }
  // Frame + diagonal brace
  ctx.fillStyle = '#5c4425';
  ctx.fillRect(0, 0, 512, 48);
  ctx.fillRect(0, 464, 512, 48);
  ctx.fillRect(0, 0, 48, 512);
  ctx.fillRect(464, 0, 48, 512);
  ctx.save();
  ctx.translate(256, 256);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-320, -24, 640, 48);
  ctx.restore();
  ctx.fillStyle = 'rgba(25,20,15,0.6)';
  ctx.font = '700 46px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FRAGILE', 256, 150);
  grain(ctx, 512, 512, 6000, 13);
  return toTexture(c);
}

export function clothTexture() {
  const [c, ctx] = makeCanvas(1024, 1024);
  ctx.fillStyle = '#5a1d1a';
  ctx.fillRect(0, 0, 1024, 1024);
  grain(ctx, 1024, 1024, 20000, 14);
  ctx.strokeStyle = 'rgba(233,180,60,0.6)';
  ctx.lineWidth = 6;
  ctx.strokeRect(50, 50, 924, 924);
  ctx.lineWidth = 2;
  ctx.strokeRect(70, 70, 884, 884);
  // Embroidered zodiac-ish ring
  ctx.beginPath();
  ctx.arc(512, 512, 330, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(512, 512, 300, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(233,180,60,0.55)';
  ctx.font = `40px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyphs = ['A', '✦', 'B', '✦', 'CT', '✦', 'T', '✦'];
  glyphs.forEach((gl, i) => {
    const a = (i / glyphs.length) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(512 + Math.cos(a) * 315, 512 + Math.sin(a) * 315);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(gl, 0, 0);
    ctx.restore();
  });
  return toTexture(c);
}

export function glowSprite(color = '255,210,140') {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(0.3, `rgba(${color},0.45)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
