// Developed by Cosmin
// paw — presence: ONE custom activity, set once, never rotated.
// Edit `STATUS.text` in src/settings/index.js (or the ACTIVITY_TEXT env var). The only token is {prefix}.
// The mobile icon is not touched here: it comes from services/gateway.js and stays exactly as it was.

const { ActivityType } = require('discord.js');
const config = require('../settings');

const FALLBACK = '{prefix}help ♡ paw';

const fill = (template) => String(template || FALLBACK).replace(/\{prefix\}/g, config.PREFIX).slice(0, 128);

function startPresence(client) {
  const cfg = config.STATUS || {};
  const apply = () => {
    try {
      client.user.setPresence({
        status: cfg.status || 'online',
        // a custom status is shown as plain text: no "Playing" / "Streaming" prefix
        activities: [{ type: ActivityType.Custom, name: 'Custom Status', state: fill(cfg.text) }],
      });
    } catch (_) { /* gateway not ready, the next ready event sets it again */ }
  };
  apply();
  return null; // nothing to clear: there is no timer
}

module.exports = { startPresence, fill };
