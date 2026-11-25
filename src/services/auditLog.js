// Developed by Cosmin
// paw · audit log lookups.
// Discord writes an audit entry a moment AFTER the gateway event arrives, so one immediate fetch usually
// finds nothing. This retries a few times before giving up.

const { PermissionFlagsBits } = require('discord.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const warned = new Set();

/**
 * Newest matching audit entry, or null.
 * opts: targetId, window (ms an entry may be old), tries, delay (ms between tries), match(entry)
 */
async function findEntry(guild, type, { targetId = null, window = 10_000, tries = 4, delay = 600, match = null } = {}) {
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
        if (!warned.has(guild.id)) {
            warned.add(guild.id);
            console.warn(`[security] ${guild.name} (${guild.id}): the bot lacks View Audit Log, so it cannot tell who did an action.`);
        }
        return null;
    }
    for (let i = 0; i < tries; i++) {
        try {
            const logs = await guild.fetchAuditLogs({ type, limit: 8 });
            const now = Date.now();
            const hit = logs.entries.find((e) =>
                now - e.createdTimestamp < window &&
                (!targetId || e.target?.id === targetId) &&
                (!match || match(e)));
            if (hit) return hit;
        } catch (e) {
            if (i === tries - 1) console.warn(`[security] audit log read failed in ${guild.id}: ${e.message}`);
        }
        if (i < tries - 1) await wait(delay);
    }
    return null;
}

module.exports = { findEntry };
