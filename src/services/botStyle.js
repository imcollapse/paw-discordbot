// Developed by Cosmin
// paw — the bot's universal name style.
// Every server shows my name in Cherry Bomb with a pink → lavender gradient (the colours of my avatar).
// Premium servers can change it with /customize. Servers that never chose one get this default, applied once:
// the style is saved in bot_customization, so it is not patched again on the next start.

const { REST, Routes } = require('discord.js');
const config = require('../settings');

const FONT_CHERRY_BOMB = 3;
const EFFECT_GRADIENT = 2;

/** Pink → lavender, taken from the avatar and the "paw" wordmark. */
const DEFAULT_STYLE = Object.freeze({ font: FONT_CHERRY_BOMB, effect: EFFECT_GRADIENT, colors: [0xF6A8CC, 0xC9B7F4] });

const fresh = () => ({ font: DEFAULT_STYLE.font, effect: DEFAULT_STYLE.effect, colors: [...DEFAULT_STYLE.colors] });

/** The request body Discord wants for a style (null clears it). */
const body = (s) => ({ display_name_font_id: s?.font ?? null, display_name_effect_id: s?.effect ?? null, display_name_colors: s?.colors ?? null });

let rest = null;
const api = (client) => (rest ||= new REST({ version: '10' }).setToken(client.token || config.BOT_TOKEN));

/** Put `style` on my profile in one server. Throws on a Discord error. */
async function patch(client, guildId, style) {
  await api(client).patch(Routes.guildMember(guildId, '@me'), { body: body(style) });
}

/** Give one server the default style when it has not chosen its own. Returns true when it was applied. */
async function ensureDefault(client, guildId) {
  const { BotCustomization } = require('../database/schemas');
  const cust = await BotCustomization.read(guildId);
  if (cust.nameStyle) return false;
  await patch(client, guildId, DEFAULT_STYLE);
  await BotCustomization.write(guildId, { nameStyle: fresh() });
  return true;
}

/** On start: walk every server slowly (about one a second) so Discord's rate limits are never hit. */
async function syncAll(client) {
  for (const guild of client.guilds.cache.values()) {
    try { await ensureDefault(client, guild.id); }
    catch (err) { console.error(`[botStyle] ${guild.id}: ${err?.rawError?.message ?? err.message}`); }
    await new Promise((r) => setTimeout(r, 1100));
  }
}

module.exports = { DEFAULT_STYLE, fresh, patch, ensureDefault, syncAll };
