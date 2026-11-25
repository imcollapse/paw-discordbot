// Developed by Cosmin

const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const { AntinukeConfig, AntinukeWhitelist, GuardSettings } = require('../../database/schemas');
const ui = require('../../services/ui');
const guardAI = require('../../services/guardAI');
const { findEntry } = require('../../services/auditLog');
const { findLogChannel } = require('../../services/securityKit');

const actionTracker = new Map();
const pendingPunishments = new Set();
const seenWebhooks = new Set();

const antinukeConfigCache = new Map();
const whitelistCache = new Map();
const ANTINUKE_CACHE_TTL = 120000;
const WHITELIST_CACHE_TTL = 120000;

function getCachedConfig(guildId) {
    const entry = antinukeConfigCache.get(guildId);
    if (entry && Date.now() - entry.ts < ANTINUKE_CACHE_TTL) return entry.val;
    return undefined;
}
function setCachedConfig(guildId, val) {
    antinukeConfigCache.set(guildId, { val, ts: Date.now() });
}

function getCachedWhitelist(guildId, userId) {
    const key = `${guildId}:${userId}`;
    const entry = whitelistCache.get(key);
    if (entry && Date.now() - entry.ts < WHITELIST_CACHE_TTL) return entry.val;
    return undefined;
}
function setCachedWhitelist(guildId, userId, val) {
    whitelistCache.set(`${guildId}:${userId}`, { val, ts: Date.now() });
}

function getTrackerKey(guildId, userId, action) {
    return `${guildId}-${userId}-${action}`;
}

function trackAction(guildId, userId, action) {
    const key = getTrackerKey(guildId, userId, action);
    const now = Date.now();

    if (!actionTracker.has(key)) {
        actionTracker.set(key, []);
    }

    actionTracker.get(key).push(now);
}

function getActionCount(guildId, userId, action, timeframeMs) {
    const key = getTrackerKey(guildId, userId, action);
    const now = Date.now();

    if (!actionTracker.has(key)) {
        return 0;
    }

    const actions = actionTracker.get(key).filter(time => now - time < timeframeMs);

    if (actions.length === 0) {
        actionTracker.delete(key);
    } else {
        actionTracker.set(key, actions);
    }

    return actions.length;
}

function cleanupOldActions() {
    const now = Date.now();
    const maxAge = 3600000;

    for (const [key, times] of actionTracker.entries()) {
        const recentTimes = times.filter(time => now - time < maxAge);
        if (recentTimes.length === 0) {
            actionTracker.delete(key);
        } else if (recentTimes.length !== times.length) {
            actionTracker.set(key, recentTimes);
        }
    }

    for (const [key, entry] of antinukeConfigCache.entries()) {
        if (now - entry.ts >= ANTINUKE_CACHE_TTL * 5) antinukeConfigCache.delete(key);
    }
    for (const [key, entry] of whitelistCache.entries()) {
        if (now - entry.ts >= WHITELIST_CACHE_TTL * 5) whitelistCache.delete(key);
    }
}

async function getConfig(guildId) {
    let config = getCachedConfig(guildId);
    if (config === undefined) {
        config = await AntinukeConfig.findOne({ where: { guildId } });
        setCachedConfig(guildId, config);
    }
    return config;
}

async function isWhitelisted(guildId, userId, eventType = null) {
    let entry = getCachedWhitelist(guildId, userId);
    if (entry === undefined) {
        entry = await AntinukeWhitelist.findOne({ where: { guildId, userId } });
        setCachedWhitelist(guildId, userId, entry);
    }
    if (!entry) return false;

    const events = entry.events;
    if (!events || events.length === 0) return true;

    if (eventType && events.includes(eventType)) return true;

    return !eventType;
}

async function getAuditLogExecutor(guild, auditType, targetId = null, timeWindow = 10000) {
    const entry = await findEntry(guild, auditType, { targetId, window: timeWindow });
    return entry?.executor ?? null;
}

async function executePunishment(guild, user, config, reason, opts) {
    let outcome = config.punishment;
    let note = null;
    try {
        const member = await guild.members.fetch(user.id).catch(() => null);
        const botMember = guild.members.me;

        if (member?.id === guild.ownerId) { outcome = 'none'; note = 'Server owner, cannot be punished.'; }
        else if (!member) { outcome = 'none'; note = 'Member already left the server.'; }
        else if (!botMember || member.roles.highest.position >= botMember.roles.highest.position) {
            outcome = 'none'; note = 'Their top role is above mine. Move my role higher so I can act.';
        } else {
            switch (config.punishment) {
                case 'stripall': {
                    const rolesToRemove = member.roles.cache
                        .filter(r => r.id !== guild.id && !r.managed && r.position < botMember.roles.highest.position);
                    if (rolesToRemove.size > 0) await member.roles.remove(rolesToRemove, `Antinuke: ${reason}`);
                    break;
                }
                case 'kick':
                    await member.kick(`Antinuke: ${reason}`);
                    break;
                case 'ban':
                    await guild.members.ban(user.id, { reason: `Antinuke: ${reason}` });
                    break;
            }
        }
    } catch (e) {
        outcome = 'none';
        note = `Action failed: ${e.message}`;
        console.warn(`[antinuke] punishment failed in ${guild.id}:`, e.message);
    }
    await sendLog(guild, config, user, reason, outcome, { ...opts, note });
}

const PUNISH_LABEL = { stripall: 'Roles stripped', kick: 'Kicked', ban: 'Banned', none: 'No action taken' };

function logEmbed(user, reason, punishment, { ai = false, test = false, note = null } = {}) {
    return ui.embed({
        kind: test ? 'base' : (punishment === 'stripall' || punishment === 'none') ? 'warning' : 'error',
        author: { name: user.username, iconURL: user.displayAvatarURL?.({ size: 64 }) },
        title: test ? 'Test alert' : 'Antinuke triggered',
        description: note ? `${reason}\n${note}` : reason,
        fields: [
            { name: 'Member', value: `<@${user.id}>`, inline: true },
            { name: 'Action', value: PUNISH_LABEL[punishment] || punishment, inline: true },
            { name: 'Detected by', value: ai ? 'AI Guard' : 'Rate limit', inline: true },
        ],
        footer: 'Antinuke',
        timestamp: true,
    });
}

async function sendLog(guild, config, user, reason, punishment, opts) {
    try {
        const channel = await findLogChannel(guild, config.logChannelId);
        if (!channel) { console.warn(`[antinuke] no usable log channel in ${guild.id}; alert not posted`); return false; }
        await channel.send({ embeds: [logEmbed(user, reason, punishment, opts)], allowedMentions: { parse: [] } });
        return true;
    } catch (e) { console.warn('[antinuke] log failed:', e.message); return false; }
}

/** Posts a sample alert so owners can confirm the log channel works. */
function sendTest(guild, config, user) {
    return sendLog(guild, config, user, 'This is how an alert will look.', config.punishment, { test: true });
}

/** Drop cached config / trusted entries for a guild after the panel edits them. */
function bust(guildId) {
    antinukeConfigCache.delete(guildId);
    for (const key of whitelistCache.keys()) if (key.startsWith(guildId + ':')) whitelistCache.delete(key);
}

async function isExtraOwner(guildId, userId) {
    const s = await GuardSettings.read(guildId, 'antinuke');
    return s.extraOwners.includes(userId);
}

function recentFacts(guildId, userId, timeframeMs) {
    const prefix = `${guildId}-${userId}-`;
    const now = Date.now();
    const out = {};
    for (const [key, times] of actionTracker.entries()) {
        if (!key.startsWith(prefix)) continue;
        const n = times.filter(t => now - t < timeframeMs).length;
        if (n) out[key.slice(prefix.length)] = n;
    }
    return out;
}

async function punishOnce(guild, executor, config, reason, opts) {
    const punishKey = `${guild.id}:${executor.id}`;
    if (pendingPunishments.has(punishKey)) return;
    pendingPunishments.add(punishKey);
    setTimeout(() => pendingPunishments.delete(punishKey), 30000);
    await executePunishment(guild, executor, config, reason, opts);
}

async function handleAntiAction(guild, executor, action, config) {
    if (!executor) return;
    if (executor.id === guild.ownerId) return;
    if (executor.id === guild.client.user.id) return;
    if (await isExtraOwner(guild.id, executor.id)) return;

    if (await isWhitelisted(guild.id, executor.id, action)) return;

    trackAction(guild.id, executor.id, action);
    const timeframeMs = config.timeframe * 1000;
    const count = getActionCount(guild.id, executor.id, action, timeframeMs);

    if (count >= config.threshold) {
        return punishOnce(guild, executor, config, `Mass ${action.replace('_', ' ')} detected (${count} actions)`);
    }

    // AI Guard: from the second action on, let the model judge the pattern early.
    if (count >= 2 && guardAI.available()) {
        const ai = await GuardSettings.read(guild.id, 'antinuke');
        if (!ai.ai) return;
        const member = await guild.members.fetch(executor.id).catch(() => null);
        const facts = {
            action,
            recentActions: recentFacts(guild.id, executor.id, timeframeMs),
            windowSeconds: config.timeframe,
            limit: config.threshold,
            isBot: !!executor.bot,
            accountAgeDays: Math.floor((Date.now() - executor.createdTimestamp) / 86400000),
            daysInServer: member?.joinedTimestamp ? Math.floor((Date.now() - member.joinedTimestamp) / 86400000) : null,
            hasAdministrator: !!member?.permissions.has(PermissionFlagsBits.Administrator),
        };
        const verdict = await guardAI.judgeExecutor(guild.id, executor.id, facts, ai.level);
        if (verdict?.malicious) {
            await punishOnce(guild, executor, config, `AI Guard: ${verdict.reason}`, { ai: true });
        }
    }
}

module.exports = {
    name: 'antinukeEvents',
    bust,
    sendTest,

    async init(client) {
        setInterval(cleanupOldActions, 300000);
        // one failing handler must never take the others down, and errors should show in the console
        const on = (ev, fn) => client.on(ev, (...a) => Promise.resolve(fn(...a)).catch((e) => console.warn(`[antinuke] ${ev}:`, e.message)));

        on('guildBanAdd', async (ban) => {
            const config = await getConfig(ban.guild.id);
            if (!config?.enabled || !config.antiBan) return;

            const executor = await getAuditLogExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
            await handleAntiAction(ban.guild, executor, 'ban', config);
        });

        on('guildMemberRemove', async (member) => {
            const config = await getConfig(member.guild.id);
            if (!config?.enabled || !config.antiKick) return;

            const executor = await getAuditLogExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
            if (executor) {
                await handleAntiAction(member.guild, executor, 'kick', config);
            }
        });

        on('channelCreate', async (channel) => {
            if (!channel.guild) return;
            const config = await getConfig(channel.guild.id);
            if (!config?.enabled || !config.antiChannelCreate) return;

            const executor = await getAuditLogExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
            await handleAntiAction(channel.guild, executor, 'channel_create', config);
        });

        on('channelDelete', async (channel) => {
            if (!channel.guild) return;
            const config = await getConfig(channel.guild.id);
            if (!config?.enabled || !config.antiChannelDelete) return;

            const executor = await getAuditLogExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
            await handleAntiAction(channel.guild, executor, 'channel_delete', config);
        });

        on('roleCreate', async (role) => {
            const config = await getConfig(role.guild.id);
            if (!config?.enabled || !config.antiRoleCreate) return;

            const executor = await getAuditLogExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
            await handleAntiAction(role.guild, executor, 'role_create', config);
        });

        on('roleDelete', async (role) => {
            const config = await getConfig(role.guild.id);
            if (!config?.enabled || !config.antiRoleDelete) return;

            const executor = await getAuditLogExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
            await handleAntiAction(role.guild, executor, 'role_delete', config);
        });

        on('roleUpdate', async (oldRole, newRole) => {
            const config = await getConfig(newRole.guild.id);
            if (!config?.enabled || !config.antiRoleUpdate) return;

            const dangerousPerms = [
                PermissionFlagsBits.Administrator,
                PermissionFlagsBits.BanMembers,
                PermissionFlagsBits.KickMembers,
                PermissionFlagsBits.ManageGuild,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageRoles,
                PermissionFlagsBits.ManageWebhooks
            ];

            let dangerousChange = false;
            for (const perm of dangerousPerms) {
                if (!oldRole.permissions.has(perm) && newRole.permissions.has(perm)) {
                    dangerousChange = true;
                    break;
                }
            }

            if (!dangerousChange) return;

            const executor = await getAuditLogExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
            await handleAntiAction(newRole.guild, executor, 'role_update', config);
        });

        on('webhooksUpdate', async (channel) => {
            const guild = channel.guild;
            if (!guild) return;
            const config = await getConfig(guild.id);
            if (!config?.enabled || !config.antiWebhook) return;

            const entry = await findEntry(guild, AuditLogEvent.WebhookCreate, { window: 8000 });
            if (!entry || seenWebhooks.has(entry.id)) return;
            seenWebhooks.add(entry.id);
            setTimeout(() => seenWebhooks.delete(entry.id), 60000);
            await handleAntiAction(guild, entry.executor, 'webhook_create', config);
        });

        on('guildMemberAdd', async (member) => {
            if (!member.user.bot) return;

            const config = await getConfig(member.guild.id);
            if (!config?.enabled || !config.antiBot) return;

            const executor = await getAuditLogExecutor(member.guild, AuditLogEvent.BotAdd, member.id);
            if (!executor) return;
            if (executor.id === member.guild.ownerId) return;
            if (executor.id === member.guild.client.user.id) return;
            if (await isExtraOwner(member.guild.id, executor.id)) return;
            if (await isWhitelisted(member.guild.id, executor.id, 'bot_add')) return;

            try {
                await member.kick('Antinuke: Unauthorized bot addition');
                await executePunishment(member.guild, executor, config, 'Unauthorized bot addition');
            } catch {}
        });

        on('guildUpdate', async (oldGuild, newGuild) => {
            const config = await getConfig(newGuild.id);
            if (!config?.enabled || !config.antiGuildUpdate) return;

            const executor = await getAuditLogExecutor(newGuild, AuditLogEvent.GuildUpdate);
            await handleAntiAction(newGuild, executor, 'guild_update', config);
        });

        on('emojiCreate', async (emoji) => {
            const config = await getConfig(emoji.guild.id);
            if (!config?.enabled || !config.antiEmoji) return;

            const executor = await getAuditLogExecutor(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
            await handleAntiAction(emoji.guild, executor, 'emoji_create', config);
        });

        on('emojiDelete', async (emoji) => {
            const config = await getConfig(emoji.guild.id);
            if (!config?.enabled || !config.antiEmoji) return;

            const executor = await getAuditLogExecutor(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
            await handleAntiAction(emoji.guild, executor, 'emoji_delete', config);
        });

        on('emojiUpdate', async (oldEmoji, newEmoji) => {
            const config = await getConfig(newEmoji.guild.id);
            if (!config?.enabled || !config.antiEmoji) return;

            const executor = await getAuditLogExecutor(newEmoji.guild, AuditLogEvent.EmojiUpdate, newEmoji.id);
            await handleAntiAction(newEmoji.guild, executor, 'emoji_update', config);
        });

        on('channelUpdate', async (oldChannel, newChannel) => {
            if (!newChannel.guild) return;
            const config = await getConfig(newChannel.guild.id);
            if (!config?.enabled || !config.antiChannelEdit) return;

            const executor = await getAuditLogExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
            await handleAntiAction(newChannel.guild, executor, 'channel_edit', config);
        });
    }
};
