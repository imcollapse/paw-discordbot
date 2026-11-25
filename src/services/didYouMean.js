// Developed by Cosmin
// paw — "No command named x was found. Did you mean ,y?" for unknown prefix commands.

const MessageFlags_V2 = 1 << 15;
const last = new Map();   // userId -> time, so a spammed typo gets one answer

const distance = (a, b) => {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
};

/** The closest command name, or null when nothing is close enough. */
function closest(client, word) {
  let best = null; let bestScore = Infinity;
  for (const name of client.prefixCommands.keys()) {
    if (name.includes(' ') || name.length < 2) continue;
    let d = distance(word, name);
    if (name.startsWith(word) || word.startsWith(name)) d = Math.min(d, 1);
    if (d < bestScore) { bestScore = d; best = name; }
  }
  const limit = Math.max(1, Math.floor(word.length / 3));
  return bestScore <= limit ? best : null;
}

async function reply(message, word, prefix) {
  const now = Date.now();
  if (now - (last.get(message.author.id) || 0) < 4000) return;
  last.set(message.author.id, now);
  if (last.size > 500) for (const [k, t] of last) if (now - t > 60000) last.delete(k);

  const ui = require('./ui');
  const near = closest(message.client, word);
  const body = `<@${message.author.id}>: No command named \`${word}\` was found.${near ? ` Did you mean \`${prefix}${near}\`?` : ''}`;
  await message.reply({
    components: [ui.box('warning').addTextDisplayComponents(ui.text(body))],
    flags: MessageFlags_V2,
    allowedMentions: { parse: [], repliedUser: false },
  }).catch(() => {});
}

module.exports = { reply, closest };
