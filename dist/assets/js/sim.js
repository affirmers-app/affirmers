// 90-second YES/NO call. Pure logic: the clock is passed in, the deck is seeded.
// Everything here is invented profiles and toy scoring. No wallet, no money, no forecast.
export const DURATION_MS = 90000;

const PROFILES = [
  ['A street photographer', 'Posts one frame a day and answers every reply.'],
  ['An indie game developer', 'Ships a tiny update every Friday, in public.'],
  ['A language tutor', 'Teaches phrases in short clips, built for commuters.'],
  ['A home chef', 'Cooks from a one-ring stove and explains every step.'],
  ['A data journalist', 'Turns dry public records into threads people share.'],
  ['A street musician', 'Streams unplugged sets from a different corner each week.'],
  ['A bike mechanic', 'Fixes strangers’ bikes on camera, free of charge.'],
  ['A student founder', 'Builds in public between lectures and exams.'],
  ['A poetry newsletter', 'Sends one poem, three lines, every morning.'],
  ['A trail runner', 'Maps remote routes and posts honest gear notes.'],
  ['A pixel artist', 'Draws a tiny scene per request, then shares the file.'],
  ['A retired teacher', 'Explains maths homework to anyone who asks nicely.'],
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDeck(seed, size = PROFILES.length) {
  const rand = mulberry32(seed);
  const pool = PROFILES.map((p, i) => ({ id: i, name: p[0], line: p[1], momentum: rand() }));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

// A "good call" is YES on a profile whose simulated momentum is high, or NO on one whose momentum is low.
export const isGoodCall = (card, yes) => (yes ? card.momentum >= 0.5 : card.momentum < 0.5);

export function createSim({ seed = 1, now = 0, duration = DURATION_MS } = {}) {
  const deck = buildDeck(seed);
  const answers = [];
  const startedAt = now;
  let index = 0;
  let endedAt = null;

  const remaining = (t) => Math.max(0, duration - (t - startedAt));
  const finish = (t) => { if (endedAt === null) endedAt = t; };

  return {
    answer(yes, t) {
      if (endedAt !== null) return null;
      if (remaining(t) <= 0) { finish(t); return null; }
      const card = deck[index];
      const good = isGoodCall(card, yes);
      answers.push({ card, yes, good });
      index += 1;
      if (index >= deck.length) finish(t);
      return { card, good };
    },
    tick(t) {
      if (endedAt === null && remaining(t) <= 0) finish(t);
      return this.state(t);
    },
    state(t) {
      const done = endedAt !== null;
      const good = answers.filter((a) => a.good).length;
      let streak = 0, best = 0;
      for (const a of answers) { streak = a.good ? streak + 1 : 0; best = Math.max(best, streak); }
      return {
        status: done ? 'done' : 'running',
        remaining: done ? remaining(endedAt) : remaining(t),
        card: done ? null : deck[index],
        index,
        total: deck.length,
        timedOut: done && index < deck.length,
        calls: answers.length,
        backed: answers.filter((a) => a.yes).length,
        good,
        hitRate: answers.length ? Math.round((good / answers.length) * 100) : null,
        best,
        answers: answers.slice(),
      };
    },
  };
}
