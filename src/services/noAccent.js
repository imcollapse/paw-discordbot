// Developed by Cosmin
// paw · container accents. Components V2 containers stay clean (no stripe) except for:
// · events: success, warning and error, in soft pastel colours
// · a few containers on purpose in white (like "added to queue")
// · music, which paints the stripe from the cover art with container.paint(color)
// Older code that still calls setAccentColor(0x2B2D31) or any other colour simply gets no stripe.
// Loaded first thing in bootstrap.js, so it covers every container, including future ones.

const { ContainerBuilder } = require('discord.js');

const PASTEL = Object.freeze({ success: 0xBAFFE5, warning: 0xFFDAA1, error: 0xFFA7A7, white: 0xFFFFFF });

// colours older code used for events, mapped onto the pastel set
const LEGACY = new Map([
  [0x57F287, PASTEL.success], [0xFEE75C, PASTEL.warning], [0xED4245, PASTEL.error],
  [PASTEL.success, PASTEL.success], [PASTEL.warning, PASTEL.warning], [PASTEL.error, PASTEL.error], [PASTEL.white, PASTEL.white],
]);

ContainerBuilder.prototype.setAccentColor = function setAccentColor(color) {
  const n = typeof color === 'number' ? color : null;
  const out = n === null ? undefined : LEGACY.get(n);
  if (out === undefined) { if (this.data) delete this.data.accent_color; return this; }
  if (this.data) this.data.accent_color = out;
  return this;
};

/** Sets any colour as the stripe (music cover art). Normal code should use setAccentColor. */
ContainerBuilder.prototype.paint = function paint(color) {
  if (this.data && typeof color === 'number') this.data.accent_color = color;
  return this;
};

module.exports = { PASTEL };
