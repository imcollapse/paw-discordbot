// Developed by Cosmin
// paw · icon lookup. icon('verified') gives the custom emoji from services/emojiMap when one is set,
// otherwise the plain-text fallback from services/emojiMap.js (empty for decorative icons).

const emojis = require('./emojiMap');

const icon = (key) => emojis[key] ?? '';
/** Same, with a trailing space, for use in front of text. Empty when there is nothing to show. */
const pre = (key) => { const v = icon(key); return v ? `${v} ` : ''; };
/** Only a real custom emoji (for buttons and select options), otherwise undefined. */
const custom = (key) => emojis.customOf(key);

/**
 * Lines as a small tree: every line but the last gets the branch emoji, the last one the closing branch.
 * tree(['a', 'b']) -> "<branch> a\n<end> b". Single lines are returned untouched.
 */
const tree = (lines) => {
    const list = lines.filter(Boolean);
    if (list.length < 2) return list.join('\n');
    const mid = icon('branch_mid'), end = icon('branch_end');
    return list.map((l, i) => `${i === list.length - 1 ? end : mid} ${l}`).join('\n');
};

module.exports = { icon, pre, custom, tree };
