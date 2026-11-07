/**
 * The Major Arcana deck.
 *
 * To add a finished card:
 *   1. Export it from Procreate at 827 × 1417 px and drop it in `public/cards/<slug>.jpg`.
 *   2. Set `image: 'cards/<slug>.jpg'` on its entry below.
 *   3. Rewrite `description`, `upright` and `reversed`.
 *
 * `description` doubles as the artwork's text alternative for screen readers: describe what's drawn.
 * Keep scorelines valid for CS2 Premier: 13-x in regulation, 16-12 to 16-14 after MR3 overtime.
 *
 * Cards with `image: null` render a generated "work in progress" placeholder.
 * Every text marked TODO is placeholder copy, meant to be replaced.
 */

export interface Arcanum {
  number: number;
  roman: string;
  slug: string;
  /** Title printed on the card, matching the artwork lettering. */
  title: string;
  /** Path relative to /public, or null while the drawing is in progress. */
  image: string | null;
  /** What's in the drawing. Null hides the section. */
  description: string | null;
  /** What the card says about your next match, upright. */
  upright: string;
  /** What it says when drawn reversed. */
  reversed: string;
  keywords: string[];
}

export const ARCANA: Arcanum[] = [
  {
    number: 0, roman: '0', slug: 'the-fool', title: 'The Fool',
    image: 'cards/the-fool.jpg',
    description: 'A CT stares straight into a flashbang on Dust2’s A site, one step from the edge. A chicken watches. It saw this coming.',
    upright: 'You go in with no plan and all the enthusiasm. It might work… or you get flashed on the first peek. Trust your gut.',
    reversed: 'You will eat your own flash. When someone calls “flash out”, look at the wall.',
    keywords: ['beginnings', 'impulse', 'flash'],
  },
  {
    number: 1, roman: 'I', slug: 'the-magician', title: 'The Magician', image: null, description: null,
    upright: 'TODO · You have every grenade and perfect timing. Whatever you set up, works.',
    reversed: 'TODO · You buy every grenade and throw none of them.',
    keywords: ['utility', 'skill'],
  },
  {
    number: 2, roman: 'II', slug: 'the-high-priestess', title: 'The High Priestess', image: null, description: null,
    upright: 'TODO · Listen for footsteps. You know where they are before they peek.',
    reversed: 'TODO · You play with the sound off. Literally.',
    keywords: ['intuition', 'info'],
  },
  {
    number: 3, roman: 'III', slug: 'the-empress', title: 'The Empress', image: null, description: null,
    upright: 'TODO · Money to spare. Full buy all match with cash left to drop.',
    reversed: 'TODO · You overspend and the team ends up on eco.',
    keywords: ['economy', 'abundance'],
  },
  {
    number: 4, roman: 'IV', slug: 'the-emperor', title: 'The Emperor', image: null, description: null,
    upright: 'TODO · A clear IGL and a strat everybody actually follows.',
    reversed: 'TODO · Five IGLs, zero calls.',
    keywords: ['leadership', 'structure'],
  },
  {
    number: 5, roman: 'V', slug: 'the-hierophant', title: 'The Hierophant', image: null, description: null,
    upright: 'TODO · Play the default. The meta exists for a reason.',
    reversed: 'TODO · The textbook strat won’t work today. Improvise.',
    keywords: ['tradition', 'meta'],
  },
  {
    number: 6, roman: 'VI', slug: 'the-lovers', title: 'The Lovers', image: null, description: null,
    upright: 'TODO · Your duo is in sync. Every frag gets traded.',
    reversed: 'TODO · You’ll be left alone on the peek. Nobody trades you.',
    keywords: ['duo', 'choice'],
  },
  {
    number: 7, roman: 'VII', slug: 'the-chariot', title: 'The Chariot', image: null, description: null,
    upright: 'TODO · Rush B, don’t stop. Momentum is on your side.',
    reversed: 'TODO · Rush B straight into a molotov.',
    keywords: ['speed', 'willpower'],
  },
  {
    number: 8, roman: 'VIII', slug: 'strength', title: 'Strength', image: null, description: null,
    upright: 'TODO · Patience wins the round. Don’t shoot the chicken.',
    reversed: 'TODO · Tilt. You shoot the chicken and they hear you.',
    keywords: ['calm', 'control'],
  },
  {
    number: 9, roman: 'IX', slug: 'the-hermit', title: 'The Hermit', image: null, description: null,
    upright: 'TODO · A lonely lurk will decide the round.',
    reversed: 'TODO · You lurked so long the round ended without you.',
    keywords: ['lurk', 'solitude'],
  },
  {
    number: 10, roman: 'X', slug: 'wheel-of-fortune', title: 'Wheel of Fortune',
    image: 'cards/wheel-of-fortune.jpg',
    description: 'A wheel between A and B with a soldier at its center, ringed by guns, grenades and golden cherubs. Crates drift through the clouds: nobody knows what’s inside.',
    upright: 'The spray gods favor you. One Deagle tap on an eco can flip the whole match.',
    reversed: 'The wheel turns against you: you die to a wallbang nobody can explain.',
    keywords: ['luck', 'cycles', 'cases'],
  },
  {
    number: 11, roman: 'XI', slug: 'justice', title: 'Justice', image: null, description: null,
    upright: 'TODO · VAC Live catches the spinbotter mid-round and cancels the match. Justice served.',
    reversed: 'TODO · There’s a cheater on the other team and the match plays out anyway.',
    keywords: ['balance', 'vac'],
  },
  {
    number: 12, roman: 'XII', slug: 'the-hanged-man', title: 'The Hanged Man', image: null, description: null,
    upright: 'TODO · Save your gun. A save round now is a won round later.',
    reversed: 'TODO · You hold an angle nobody is ever coming through.',
    keywords: ['pause', 'save'],
  },
  {
    number: 13, roman: 'XIII', slug: 'death', title: 'Death', image: null, description: null,
    upright: 'TODO · You lose the pistol round, but the match is just starting. Everything changes.',
    reversed: 'TODO · You refuse to rotate. You die anyway.',
    keywords: ['change', 'respawn'],
  },
  {
    number: 14, roman: 'XIV', slug: 'temperance', title: 'Temperance', image: null, description: null,
    upright: 'TODO · Measured shots. Tap, don’t spam.',
    reversed: 'TODO · Full spray into the wall. Recoil wins.',
    keywords: ['patience', 'control'],
  },
  {
    number: 15, roman: 'XV', slug: 'the-devil', title: 'The Devil', image: null, description: null,
    upright: 'TODO · The AWP tempts you. Buy it if you can handle it.',
    reversed: 'TODO · You break free from tilt. Finally.',
    keywords: ['temptation', 'AWP'],
  },
  {
    number: 16, roman: 'XVI', slug: 'the-tower', title: 'The Tower', image: null, description: null,
    upright: 'TODO · The site falls. The bomb goes off and everything collapses.',
    reversed: 'TODO · Defused with 0.1 seconds left. A narrow escape.',
    keywords: ['chaos', 'explosion'],
  },
  {
    number: 17, roman: 'XVII', slug: 'the-star', title: 'The Star', image: null, description: null,
    upright: 'TODO · They’re on match point at 12-3. The comeback is still on.',
    reversed: 'TODO · The team gave up in chat. You didn’t.',
    keywords: ['hope', 'comeback'],
  },
  {
    number: 18, roman: 'XVIII', slug: 'the-moon', title: 'The Moon', image: null, description: null,
    upright: 'TODO · Nothing is what it seems: fakes, smokes and false footsteps.',
    reversed: 'TODO · An HE tears through the smoke. You see the play.',
    keywords: ['illusion', 'smoke'],
  },
  {
    number: 19, roman: 'XIX', slug: 'the-sun', title: 'The Sun', image: null, description: null,
    upright: 'TODO · Ace. Total clarity. It’s your day.',
    reversed: 'TODO · Dust2’s sun blinds you and you miss the AWPer.',
    keywords: ['victory', 'ace'],
  },
  {
    number: 20, roman: 'XX', slug: 'judgement', title: 'Judgement', image: null, description: null,
    upright: 'TODO · Watch the demo. The answer is in there.',
    reversed: 'TODO · Votekick. Someone won’t finish this match.',
    keywords: ['review', 'demo'],
  },
  {
    number: 21, roman: 'XXI', slug: 'the-world', title: 'The World', image: null, description: null,
    upright: 'TODO · Full circle. The Major trophy awaits.',
    reversed: 'TODO · So close. You lose 12-13 in the final.',
    keywords: ['completion', 'major'],
  },
];

/** Text alternative for a card's artwork: what is drawn, or that it isn't drawn yet. */
export function altText(card: Arcanum) {
  return card.description ?? `${card.title}: drawing in progress.`;
}

/** The three positions of the spread, mapped to a match. */
export const SPREAD: { label: string; meaning: string }[] = [
  { label: 'Pistol round', meaning: 'How you start' },
  { label: 'Mid round', meaning: 'What you’ll face' },
  { label: 'Clutch', meaning: 'How it ends' },
];
