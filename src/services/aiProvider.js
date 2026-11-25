// Developed by Cosmin
// paw · AI providers. Each job has its own provider (all with free tiers). Set the keys you have in .env:
// chat + vision   NavyAI → Groq → OpenRouter → Gemini → Cerebras   (first one with a key; the next ones are the backups)
// fast jobs       Groq → Cerebras → Gemini → OpenRouter    (automod / antinuke judging)
// speech          Sarvam (bulbul)
// images          Cloudflare FLUX.1 schnell / SDXL → Pollinations
// background      remove.bg

const config = require('../settings');

const A = () => config.AI || {};
const CF = () => config.CLOUDFLARE || {};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// chat

function chatProviders({ vision = false, fast = false } = {}) {
  const a = A();
  const all = {
    navy: a.NAVY_KEY && { id: 'navy', label: 'NavyAI', host: 'api.navy', base: String(a.NAVY_URL).replace(/\/+$/, ''), key: a.NAVY_KEY, model: a.NAVY_MODEL, vision: a.NAVY_VISION || a.NAVY_MODEL, url: `${String(a.NAVY_URL).replace(/\/+$/, '')}/chat/completions` },
    gemini: a.GEMINI_KEY && { id: 'gemini', label: 'Gemini', host: 'ai.google.dev', base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: a.GEMINI_KEY, model: a.GEMINI_MODEL, vision: a.GEMINI_MODEL, url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
    groq: a.GROQ_KEY && { id: 'groq', label: 'Groq', host: 'groq.com', base: 'https://api.groq.com/openai/v1', key: a.GROQ_KEY, model: a.GROQ_MODEL, vision: a.GROQ_VISION, url: 'https://api.groq.com/openai/v1/chat/completions' },
    cerebras: a.CEREBRAS_KEY && { id: 'cerebras', label: 'Cerebras', host: 'cerebras.ai', base: 'https://api.cerebras.ai/v1', key: a.CEREBRAS_KEY, model: a.CEREBRAS_MODEL, vision: null, url: 'https://api.cerebras.ai/v1/chat/completions' },
    openrouter: config.OPENROUTER?.API_KEY && { id: 'openrouter', label: 'OpenRouter', host: 'openrouter.ai', base: 'https://openrouter.ai/api/v1', key: config.OPENROUTER.API_KEY, model: a.OPENROUTER_MODEL, vision: a.OPENROUTER_VISION, url: 'https://openrouter.ai/api/v1/chat/completions' },
    pollinations: a.POLLINATIONS_KEY && { id: 'pollinations', label: 'Pollinations', host: 'pollinations.ai', key: a.POLLINATIONS_KEY, model: 'openai', vision: 'openai', url: 'https://text.pollinations.ai/openai' },
  };
  const order = fast ? ['groq', 'navy', 'cerebras', 'openrouter', 'gemini', 'pollinations'] : ['navy', 'groq', 'openrouter', 'gemini', 'cerebras', 'pollinations'];
  return order.map(k => all[k]).filter(Boolean).filter(p => !vision || p.vision);
}

const hasChat = () => chatProviders().length > 0;

async function post(url, init, { timeout = 60000 } = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  return res;
}

// Models come and go, so the bot asks each provider what it offers (cached) and only tries models that exist.
// Your own *_MODEL setting is tried first, then these, then whatever the provider lists that looks right.
const PREFER = {
  navy:       { chat: ['gpt-4.1', 'gpt-4o', 'gpt-5-mini', 'gpt-4o-mini', 'gemini-2.5-flash', 'llama-3.3-70b'], vision: ['gpt-4.1', 'gpt-4o', 'gpt-5-mini', 'gemini-2.5-flash'] },
  groq:       { chat: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'], vision: ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'] },
  cerebras:   { chat: ['gpt-oss-120b', 'llama-3.3-70b', 'qwen-3-32b', 'llama3.1-8b'], vision: [] },
  gemini:     { chat: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'], vision: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest'] },
  openrouter: { chat: ['openai/gpt-oss-120b:free', 'meta-llama/llama-3.3-70b-instruct:free', 'google/gemma-3-27b-it:free'], vision: ['google/gemma-3-27b-it:free', 'meta-llama/llama-4-maverick:free'] },
  pollinations: { chat: ['openai'], vision: ['openai'] },
};
const NOT_CHAT = /embed|whisper|tts|speech|audio|guard|moderat|image|imagen|veo|dall|rerank|transcri|orpheus|playai|safeguard/i;
const LOOKS_GOOD = /gpt-5|gpt-4|gpt-oss|llama-?[34]|gemini|qwen|gemma|mistral|deepseek|claude/i;
const LOOKS_VISION = /vision|vl\b|-vl|llama-4|scout|maverick|gemma-3|gemini|gpt-4o|gpt-4\.1|gpt-5|pixtral|claude/i;

const listed = new Map();   // provider id -> { at, ids }
const worked = new Map();   // provider id + kind -> the model that answered last

async function modelsOf(p) {
  const hit = listed.get(p.id);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.ids;
  let ids = [];
  if (p.base) {
    try {
      const res = await post(`${p.base}/models`, { headers: { Authorization: `Bearer ${p.key}` } }, { timeout: 8000 });
      if (res.ok) {
        const j = await res.json();
        ids = (j.data ?? j.models ?? []).map(m => String(m.id ?? m.name ?? '').replace(/^models\//, '')).filter(Boolean);
      }
    } catch { /* the provider does not list models, fall back to the preferred ones */ }
  }
  listed.set(p.id, { at: Date.now(), ids });
  return ids;
}

async function pickModels(p, vision) {
  const kind = vision ? 'vision' : 'chat';
  const mine = vision ? p.vision : p.model;
  const wanted = [worked.get(`${p.id}:${kind}`), mine, ...(PREFER[p.id]?.[kind] ?? [])].filter(Boolean);
  const have = await modelsOf(p);
  let out = have.length ? wanted.filter(m => have.includes(m)) : wanted;
  if (have.length && out.length < 2) {
    const extra = have.filter(m => !NOT_CHAT.test(m) && LOOKS_GOOD.test(m) && (!vision || LOOKS_VISION.test(m)) && !out.includes(m));
    if (p.id === 'openrouter') extra.sort((a, b) => Number(b.endsWith(':free')) - Number(a.endsWith(':free')));
    out = [...out, ...extra];
  }
  return [...new Set(out)].slice(0, 3);
}

/** Chat / vision. Tries each configured provider, and each provider's working models, until one answers. @returns { success, content, model, label, host, ms } */
async function chat(messages, { maxTokens = 2048, temperature = 0.7, fast = false } = {}) {
  const vision = messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'image_url'));
  const list = chatProviders({ vision, fast });
  if (!list.length) return { success: false, error: vision ? 'Image analysis is not set up on this bot yet.' : 'The AI is not set up on this bot yet.' };

  const started = Date.now();
  const kind = vision ? 'vision' : 'chat';
  const last = 'The AI is busy. Try again in a moment.';
  for (const p of list) {
    const models = await pickModels(p, vision);
    let why = models.length ? '' : 'no usable model';
    provider: for (const model of models) {
      for (let tryNo = 0; tryNo < 2; tryNo++) {
        try {
          const res = await post(p.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
            body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
          }, { timeout: 30000 });
          if (res.ok) {
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content?.trim();
            if (content) {
              worked.set(`${p.id}:${kind}`, model);
              return { success: true, content, model, label: p.label, host: p.host, ms: Date.now() - started };
            }
            why = `${model} gave an empty answer`;
            break;                                              // empty answer, next model
          }
          const body = (await res.text().catch(() => '')).slice(0, 140).replace(/\s+/g, ' ');
          if (res.status === 429 || res.status >= 500) {        // busy: one short wait, then the next model
            why = `${model} ${res.status}`;
            if (tryNo === 0) { await sleep(1200); continue; }
            break;
          }
          if ((res.status === 400 || res.status === 404) && /model/i.test(body)) {   // that model is gone: forget it
            why = `${model} is not available`;
            listed.delete(p.id);
            worked.delete(`${p.id}:${kind}`);
            break;
          }
          why = `${res.status} ${body}`;                        // bad key or request: this provider will not work
          break provider;
        } catch (e) {
          why = `${model} ${e.name === 'TimeoutError' ? 'timed out' : e.message}`;
          break;
        }
      }
    }
    if (why) console.warn(`[ai] ${p.id} skipped: ${why}`);
  }
  return { success: false, error: last };
}

// speech (Sarvam)

const LANGS = {
  en: ['en-IN', 'English'], hi: ['hi-IN', 'Hindi'], bn: ['bn-IN', 'Bengali'], ta: ['ta-IN', 'Tamil'], te: ['te-IN', 'Telugu'],
  kn: ['kn-IN', 'Kannada'], ml: ['ml-IN', 'Malayalam'], mr: ['mr-IN', 'Marathi'], gu: ['gu-IN', 'Gujarati'], pa: ['pa-IN', 'Punjabi'], od: ['od-IN', 'Odia'],
};
const LANG_NAMES = Object.fromEntries(Object.entries(LANGS).map(([k, [, n]]) => [n.toLowerCase(), k]));
const SPEAKERS = ['shubh', 'aditya', 'ritu', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran', 'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit', 'roopa', 'kabir', 'aayan', 'ashutosh', 'advait', 'anand', 'tanya'];

/** Pick the language from the script the text is written in. */
function detectLang(text) {
  const ranges = [['hi', /[ऀ-ॿ]/], ['bn', /[ঀ-৿]/], ['pa', /[਀-੿]/], ['gu', /[઀-૿]/], ['od', /[଀-୿]/],
    ['ta', /[஀-௿]/], ['te', /[ఀ-౿]/], ['kn', /[ಀ-೿]/], ['ml', /[ഀ-ൿ]/]];
  for (const [k, re] of ranges) if (re.test(text)) return k;
  return 'en';
}

const hasSpeech = () => !!A().SARVAM_KEY;

/** @returns { success, buffer, speaker, lang, ms } */
async function speech(text, { speaker = 'shubh', lang } = {}) {
  if (!hasSpeech()) return { success: false, error: 'Speech is not set up on this bot yet.' };
  const started = Date.now();
  const code = lang && LANGS[lang] ? lang : detectLang(text);
  const who = SPEAKERS.includes(speaker) ? speaker : 'shubh';
  try {
    const res = await post('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-subscription-key': A().SARVAM_KEY },
      body: JSON.stringify({ text: text.slice(0, 2500), language_code: LANGS[code][0], model: 'bulbul:v3', speaker: who, output_audio_codec: 'mp3', speech_sample_rate: 24000 }),
    }, { timeout: 90000 });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[ai] sarvam ${res.status}: ${body.slice(0, 200)}`);
      return { success: false, error: res.status === 429 ? 'Too many speech requests. Try again in a moment.' : 'The speech service refused that text.' };
    }
    const data = await res.json();
    const b64 = data.audios?.[0];
    if (!b64) return { success: false, error: 'The speech service returned no audio.' };
    return { success: true, buffer: Buffer.from(b64, 'base64'), speaker: who, lang: LANGS[code][1], ms: Date.now() - started };
  } catch (e) {
    return { success: false, error: e.name === 'TimeoutError' ? 'The speech service took too long.' : e.message };
  }
}

// images

const SHAPES = { square: [1024, 1024], landscape: [1344, 768], portrait: [768, 1344] };
const IMAGE_MODELS = { flux: 'FLUX.1', sdxl: 'SDXL', pollinations: 'Pollinations' };

function imageProviders(model, shape) {
  const cf = !!(CF().API_TOKEN && CF().ACCOUNT_ID);
  const pol = !!A().POLLINATIONS_KEY;
  const have = { flux: cf, sdxl: cf, pollinations: pol };
  // auto: FLUX is the best looking, but it only makes squares; other shapes go to a provider that can size
  const auto = shape === 'square' ? ['flux', 'pollinations', 'sdxl'] : ['pollinations', 'sdxl', 'flux'];
  const order = model && have[model] ? [model, ...auto.filter(x => x !== model)] : auto;
  return order.filter(k => have[k]);
}
const hasImages = () => imageProviders(null, 'square').length > 0;

async function cloudflare(model, body) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF().ACCOUNT_ID}/ai/run/${model}`;
  const res = await post(url, { method: 'POST', headers: { Authorization: `Bearer ${CF().API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { timeout: 120000 });
  if (!res.ok) throw new Error(`cloudflare ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
  if ((res.headers.get('content-type') || '').startsWith('image/')) return Buffer.from(await res.arrayBuffer());
  const json = await res.json();
  const b64 = json.result?.image ?? json.image;
  if (!b64) throw new Error('cloudflare: no image in the answer');
  return Buffer.from(b64, 'base64');
}

/** Image generation. @returns { success, buffer, model, host, ms } */
async function image(prompt, { model, shape = 'square', seed } = {}) {
  const list = imageProviders(model, shape);
  if (!list.length) return { success: false, error: 'Image generation is not set up on this bot yet.' };
  const started = Date.now();
  const [w, h] = SHAPES[shape] || SHAPES.square;
  const sd = seed ?? Math.floor(Math.random() * 1e9);

  for (const k of list) {
    try {
      let buffer, host;
      if (k === 'flux') {
        buffer = await cloudflare('@cf/black-forest-labs/flux-1-schnell', { prompt: prompt.slice(0, 2000), steps: 6, seed: sd });
        host = 'cloudflare.com';
      } else if (k === 'sdxl') {
        buffer = await cloudflare('@cf/stabilityai/stable-diffusion-xl-base-1.0', { prompt: prompt.slice(0, 2000), width: w, height: h, num_steps: 20, guidance: 7.5, seed: sd });
        host = 'cloudflare.com';
      } else {
        const q = new URLSearchParams({ model: 'flux', width: w, height: h, nologo: 'true', private: 'true', safe: 'true', enhance: 'true', seed: String(sd) });
        const res = await post(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q}`, { headers: { Authorization: `Bearer ${A().POLLINATIONS_KEY}` } }, { timeout: 120000 });
        if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) throw new Error(`pollinations ${res.status}`);
        buffer = Buffer.from(await res.arrayBuffer());
        host = 'pollinations.ai';
      }
      return { success: true, buffer, model: IMAGE_MODELS[k], host, ms: Date.now() - started };
    } catch (e) {
      console.error(`[ai] image ${k}: ${e.message}`);
    }
  }
  return { success: false, error: 'The image service is busy or refused that prompt. Try again.' };
}

// background removal

const hasRemoveBg = () => !!A().REMOVEBG_KEY;

async function removeBackground(buffer) {
  if (!hasRemoveBg()) return { success: false, error: 'Background removal is not set up on this bot yet.' };
  try {
    const form = new FormData();
    form.append('image_file', new Blob([buffer]), 'image.png');
    form.append('size', 'auto');
    const res = await post('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': A().REMOVEBG_KEY }, body: form }, { timeout: 90000 });
    if (!res.ok) return { success: false, error: res.status === 402 || res.status === 429 ? 'The monthly background removals are used up.' : 'Could not remove the background from that image.' };
    return { success: true, buffer: Buffer.from(await res.arrayBuffer()) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  chat, hasChat, speech, hasSpeech, image, hasImages, removeBackground, hasRemoveBg,
  LANGS, LANG_NAMES, SPEAKERS, SHAPES, IMAGE_MODELS, detectLang,
};
