// Developed by Cosmin
// paw · economy numbers and catalogues. Everything that balances the economy lives here, change it in one place.

const MIN = 60000, HOUR = 3600000, DAY = 86400000;

/** Cooldowns in ms. Premium users wait 25% less. */
const COOLDOWN = {
    daily: DAY, weekly: 7 * DAY, work: HOUR, beg: 10 * MIN, crime: 2 * HOUR, rob: 3 * HOUR,
    fish: 15 * MIN, mine: 20 * MIN, gamble: 8000, coinflip: 8000, slots: 8000, blackjack: 8000, roulette: 8000, dice: 8000,
};
const PREMIUM_CD = 0.75;

const REWARD = {
    daily: 40, dailyStep: 5, dailyMaxStreak: 10,   // 40 + 5 per day of streak, up to 10 days (90)
    weekly: 250,
    beg: [4, 18],
    crime: { win: [55, 150], fine: [40, 100], chance: 0.55 },
    rob: { chance: 0.4, take: [0.1, 0.3], cap: 400, minVictim: 100, minRobber: 50, fine: [50, 150] },
    drop: [20, 60],
};

const BANK = { interest: 0.004, premiumInterest: 0.006, premiumCap: 3000, maxDays: 30 };
const GAMBLE = { chance: 0.45, jackpotChance: 0.01, jackpot: 3, flip: 0.48, minBet: 10 };
const SHOP_LIMIT = 25;
/** Stocks: you buy at the ask and sell at the bid (half a spread each side of the price), and bought shares are locked for a while. */
const HALF_SPREAD = 0.006;
const STOCK_LOCK = HOUR;
const STOCK_TICK = 5 * MIN;

/** Everyone starts as a cashier. Moving up takes shifts (every work command is a shift). */
const JOBS = [
    { id: 'cashier',   name: 'Cashier',     min: 14,  max: 30,  shifts: 0 },
    { id: 'barista',   name: 'Barista',     min: 20,  max: 42,  shifts: 10 },
    { id: 'courier',   name: 'Courier',     min: 28,  max: 56,  shifts: 25 },
    { id: 'cook',      name: 'Line cook',   min: 38,  max: 74,  shifts: 50 },
    { id: 'mechanic',  name: 'Mechanic',    min: 52,  max: 96,  shifts: 90 },
    { id: 'teacher',   name: 'Teacher',     min: 68,  max: 120, shifts: 150 },
    { id: 'developer', name: 'Developer',   min: 90,  max: 160, shifts: 250 },
    { id: 'doctor',    name: 'Doctor',      min: 120, max: 220, shifts: 400 },
];
const job = (id) => JOBS.find((j) => j.id === id) ?? JOBS[0];

/** The bot's own shop. Every server has it. Sell value is half the price. */
const SHOP = [
    { id: 'rod',       name: 'Fishing rod',    price: 250,  kind: 'tool',    desc: 'Lets you use `fish`. Can snap now and then.' },
    { id: 'pickaxe',   name: 'Pickaxe',        price: 400,  kind: 'tool',    desc: 'Lets you use `mine`. Can break now and then.' },
    { id: 'laptop',    name: 'Laptop',         price: 900,  kind: 'tool',    desc: '+15% pay on every `work` shift while you own it.' },
    { id: 'padlock',   name: 'Padlock',        price: 300,  kind: 'use',     desc: 'Use it to stop robberies on your wallet for 12 hours.' },
    { id: 'energy',    name: 'Energy drink',   price: 90,   kind: 'use',     desc: 'Use it to skip the wait on `work`.' },
    { id: 'clover',    name: 'Lucky clover',   price: 450,  kind: 'use',     desc: 'Use it for +15% odds on `crime` and `rob` for 6 hours.' },
    { id: 'banknote',  name: 'Bank note',      price: 1200, kind: 'use',     desc: 'Use it to raise your bank limit by 2,500.' },
];
const SELL_RATE = 0.5;

/** Weighted loot. `value` is what it sells for. */
const FISH = [
    { id: 'boot',   name: 'Old boot',     value: 1,   w: 8 },
    { id: 'minnow', name: 'Minnow',       value: 5,   w: 36 },
    { id: 'perch',  name: 'Perch',        value: 11,  w: 26 },
    { id: 'trout',  name: 'Trout',        value: 20,  w: 16 },
    { id: 'salmon', name: 'Salmon',       value: 38,  w: 8 },
    { id: 'eel',    name: 'Eel',          value: 70,  w: 4 },
    { id: 'koi',    name: 'Golden koi',   value: 160, w: 1 },
];
const ORE = [
    { id: 'stone',   name: 'Stone',     value: 3,   w: 36 },
    { id: 'coal',    name: 'Coal',      value: 8,   w: 26 },
    { id: 'copper',  name: 'Copper',    value: 14,  w: 16 },
    { id: 'iron',    name: 'Iron',      value: 24,  w: 11 },
    { id: 'gold',    name: 'Gold',      value: 60,  w: 6 },
    { id: 'diamond', name: 'Diamond',   value: 200, w: 1.5 },
];
const LOOT = [...FISH, ...ORE];
const BREAK = { rod: 0.06, pickaxe: 0.05 };

/**
 * Pretend shares, the same in every server. `id` is the code people type (`stocks buy moon 5`).
 * base = the price it hovers around, vol = how wildly it moves (0.06 calm, 0.30 wild).
 * The first four are the original assets, so shares people already own keep working.
 */
const ASSETS = [
    { id: 'paw',   name: 'Paw Corp',            sector: 'Conglomerate',   base: 100, vol: 0.09 },
    { id: 'moon',  name: 'Moon Mining',         sector: 'Resources',      base: 48,  vol: 0.18 },
    { id: 'leaf',  name: 'Leaf Foods',          sector: 'Agriculture',    base: 22,  vol: 0.08 },
    { id: 'gem',   name: 'Gem Labs',            sector: 'Biotech',        base: 260, vol: 0.16 },
    { id: 'bean',  name: 'Bean Brothers',       sector: 'Coffee',         base: 35,  vol: 0.10 },
    { id: 'cloud', name: 'Cloudnine Compute',   sector: 'Technology',     base: 640, vol: 0.14 },
    { id: 'byte',  name: 'Bytewise Systems',    sector: 'Software',       base: 310, vol: 0.13 },
    { id: 'chip',  name: 'Pocket Chips',        sector: 'Semiconductors', base: 455, vol: 0.19 },
    { id: 'pixl',  name: 'Pixel Forge Games',   sector: 'Gaming',         base: 88,  vol: 0.17 },
    { id: 'melo',  name: 'Melody Records',      sector: 'Music',          base: 64,  vol: 0.11 },
    { id: 'star',  name: 'Starlight Cinemas',   sector: 'Entertainment',  base: 70,  vol: 0.12 },
    { id: 'flux',  name: 'Flux Energy',         sector: 'Energy',         base: 175, vol: 0.12 },
    { id: 'solr',  name: 'Sunbeam Solar',       sector: 'Energy',         base: 92,  vol: 0.16 },
    { id: 'volt',  name: 'Voltaic Utilities',   sector: 'Utilities',      base: 77,  vol: 0.06 },
    { id: 'bolt',  name: 'Boltline Motors',     sector: 'Automotive',     base: 148, vol: 0.15 },
    { id: 'jet',   name: 'Jetstream Air',       sector: 'Aviation',       base: 120, vol: 0.14 },
    { id: 'orb',   name: 'Orbital Launch',      sector: 'Aerospace',      base: 520, vol: 0.28 },
    { id: 'port',  name: 'Harborline Freight',  sector: 'Logistics',      base: 58,  vol: 0.08 },
    { id: 'home',  name: 'Hearth & Home Realty', sector: 'Real Estate',   base: 205, vol: 0.08 },
    { id: 'bank',  name: 'Blossom Bank',        sector: 'Finance',        base: 312, vol: 0.07 },
    { id: 'coin',  name: 'Candy Coin Exchange', sector: 'Crypto',         base: 54,  vol: 0.30 },
    { id: 'pill',  name: 'Panacea Pharma',      sector: 'Healthcare',     base: 188, vol: 0.11 },
    { id: 'care',  name: 'Carewell Clinics',    sector: 'Healthcare',     base: 96,  vol: 0.07 },
    { id: 'wave',  name: 'Wavelength Telecom',  sector: 'Telecom',        base: 117, vol: 0.07 },
    { id: 'fit',   name: 'Fitfox Gyms',         sector: 'Wellness',       base: 39,  vol: 0.12 },
    { id: 'toy',   name: 'Toybox Co.',          sector: 'Retail',         base: 84,  vol: 0.10 },
    { id: 'shop',  name: 'Shopsy Marketplace',  sector: 'E-commerce',     base: 230, vol: 0.13 },
    { id: 'snak',  name: 'Snackwell',           sector: 'Food',           base: 46,  vol: 0.08 },
    { id: 'sush',  name: 'Sushi Station',       sector: 'Restaurants',    base: 52,  vol: 0.11 },
    { id: 'yarn',  name: 'Yarnball Fashion',    sector: 'Fashion',        base: 69,  vol: 0.12 },
];

const hash = (n, s) => {
    let x = (n * 374761393 + s * 668265263) | 0;
    x = (x ^ (x >>> 13)) * 1274126177 | 0;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
/** Smooth random wiggle in [-1, 1]: random points joined by curves. No sine waves, so there is no cycle to learn. */
const wiggle = (x, seed) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return (hash(i, seed) * 2 - 1) * (1 - u) + (hash(i + 1, seed) * 2 - 1) * u;
};
/** MARKET_SEED (optional) makes this bot's market its own: nobody can work the prices out from the code. */
const SALT = [...String(process.env.MARKET_SEED || 'paw')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
const seedOf = (a) => [...a.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, SALT);

/** The fair price at a moment (a decimal). Moves a little every few minutes, never follows a pattern. */
function rawPrice(asset, at = Date.now()) {
    const k = at / STOCK_TICK, seed = seedOf(asset);
    const level = 0.5 * wiggle(k / 288, seed) + 0.3 * wiggle(k / 36, seed + 1) + 0.2 * wiggle(k / 6, seed + 2) + 0.1 * wiggle(k / 1.5, seed + 3);
    return Math.max(1, asset.base * Math.exp(asset.vol * level));
}
const price = (asset, at = Date.now()) => Math.max(1, Math.round(rawPrice(asset, at)));
/** Change since the last tick (5 minutes ago), as a percentage. */
const changeTick = (asset, at = Date.now()) => { const before = rawPrice(asset, at - STOCK_TICK); return ((rawPrice(asset, at) - before) / before) * 100; };
/** What a buyer pays / a seller gets for ONE share, as decimals. Totals are rounded once, on the whole order. */
const ask = (asset, at = Date.now()) => rawPrice(asset, at) * (1 + HALF_SPREAD);
const bid = (asset, at = Date.now()) => rawPrice(asset, at) * (1 - HALF_SPREAD);
const asset = (q) => {
    const t = String(q ?? '').toLowerCase().trim();
    return t ? ASSETS.find((a) => a.id === t || a.name.toLowerCase() === t) : undefined;
};

// helpers

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p) => Math.random() < p;
function pick(list) {
    const total = list.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (const x of list) { r -= x.w; if (r <= 0) return x; }
    return list[list.length - 1];
}
const n = (v) => Number(v).toLocaleString('en-US');

/** "1k", "2.5k", "1m", "1,200", "all", "half" → a whole number. `all` is `max`. Returns null when it isn't a number. */
function amount(token, max = 0) {
    const t = String(token ?? '').toLowerCase().replace(/,/g, '').trim();
    if (!t) return null;
    if (t === 'all' || t === 'max') return Math.floor(max);
    if (t === 'half') return Math.floor(max / 2);
    const m = t.match(/^(\d+(?:\.\d+)?)([km]?)$/);
    if (!m) return null;
    const v = Math.floor(parseFloat(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1));
    return Number.isFinite(v) ? v : null;
}

module.exports = {
    MIN, HOUR, DAY, COOLDOWN, PREMIUM_CD, REWARD, BANK, GAMBLE, SHOP_LIMIT, HALF_SPREAD, STOCK_LOCK, STOCK_TICK,
    JOBS, job, SHOP, SELL_RATE, FISH, ORE, LOOT, BREAK, ASSETS, price, rawPrice, changeTick, ask, bid, asset,
    rand, chance, pick, n, amount,
};
