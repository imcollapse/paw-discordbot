// Developed by Cosmin
// paw · music · UI
// containers, status lines, now playing controls and the queue pages

const {
    ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder,
    SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder,
    ButtonStyle, MessageFlags,
} = require('discord.js');
const E = require('./emojis');
const { formatDuration, humanDuration, safeTitle } = require('./helpers');
const { parseEmoji } = require('../ui');

const WHITE = 0xffffff;
const V2_FLAGS = MessageFlags.IsPersistent | MessageFlags.IsComponentsV2;
const NO_PINGS = { parse: [], repliedUser: false };
const QUEUE_PAGE_SIZE = 3;

const divider = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);
const text = (c) => new TextDisplayBuilder().setContent(String(c));

const link = (track) => `[${safeTitle(track.info.title)}](${track.info.uri || 'https://discord.com'})`;
const artworkOf = (track) => track?.info?.artworkUrl || track?.info?.image || null;
const requesterId = (track) => track?.info?.requester?.id;
const requesterName = (track) => track?.info?.requester?.username || track?.info?.requester?.globalName || 'Unknown';
const requesterMention = (track) => (requesterId(track) ? `<@${requesterId(track)}>` : requesterName(track));

const ID_LABELS = [[/previous/, 'Prev'], [/favorite/, 'Like'], [/skip/, 'Skip'], [/home/, 'Home'], [/delete/, 'Delete'], [/prev/, '<'], [/next/, '>']];

/** An icon button. Without a custom emoji it shows the text fallback, so Discord always gets a label. */
function iconButton(id, emoji, { style = ButtonStyle.Secondary, disabled = false } = {}) {
    const b = new ButtonBuilder().setCustomId(id).setStyle(style).setDisabled(disabled);
    const e = parseEmoji(emoji);
    if (e) b.setEmoji(e);
    else b.setLabel((typeof emoji === 'string' && emoji) || ID_LABELS.find(([re]) => re.test(id))?.[1] || 'Option');
    return b;
}

/* ---------- status lines ---------- */

// A status line: no stripe unless `color` is given (success / error pastel, or white for a few).
function statusContainer(t, color) {
    const c = new ContainerBuilder().addTextDisplayComponents(text(t));
    return color ? c.setAccentColor(color) : c;
}
const statusPayload = (t, color) => ({ components: [statusContainer(t, color)], flags: V2_FLAGS, allowedMentions: NO_PINGS });
const ok = (t) => statusPayload(`${E.success} | ${t}`, 0xBAFFE5);
const fail = (t) => statusPayload(`${E.error} | ${t}`, 0xFFA7A7);

const addedToQueuePayload = (track) =>
    statusPayload(`${E.success} | added to queue ${link(track)} by ${requesterMention(track)}`, WHITE);
const addedPlaylistPayload = (name, count, user) =>
    statusPayload(`${E.success} | added **${count}** tracks from **${safeTitle(name)}** to queue by <@${user.id}>`, WHITE);

/** A softer version of a hex colour like '#8c9bff', for a stripe. */
function pastel(hex, mix = 0.3) {
    const n = parseInt(String(hex || '#c9d1ff').replace('#', ''), 16);
    const f = (c) => Math.round(c + (255 - c) * mix);
    return (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255);
}

/* ---------- now playing message ---------- */

function nowPlayingButtons(player, disabled = false) {
    return new ActionRowBuilder().addComponents(
        iconButton('music_previous', E.previous, { disabled }),
        iconButton('music_pause_resume', player.isPaused ? (E.play || 'Play') : (E.pause || 'Pause'), { disabled }),
        iconButton('music_skip', E.skip, { disabled }),
        iconButton('music_favorite', E.heart, { disabled }),
    );
}

function trackSection(container, content, track) {
    const art = artworkOf(track);
    if (art) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(text(content))
                .setThumbnailAccessory(new ThumbnailBuilder().setDescription(safeTitle(track.info.title).slice(0, 200)).setURL(art)),
        );
    } else {
        container.addTextDisplayComponents(text(content));
    }
}

function nowPlayingContainer(player, track, disabled = false) {
    const body =
        `### ${link(track)}\n` +
        `> - **Author:** ${track.info.author || 'Unknown'}\n` +
        `> - **Duration:** \`${track.info.isStream ? 'LIVE' : humanDuration(track.info.length)}\`\n` +
        `> - **Requester:** ${requesterName(track)}`;
    const c = new ContainerBuilder();
    trackSection(c, body, track);
    return c.addSeparatorComponents(divider()).addActionRowComponents(nowPlayingButtons(player, disabled));
}

const nowPlayingPayload = (player, track, disabled = false) =>
    ({ components: [nowPlayingContainer(player, track, disabled)], flags: V2_FLAGS, allowedMentions: NO_PINGS });

/* ---------- queue ---------- */

function buildQueuePayload(player, page = 1, disabled = false) {
    const queue = [...player.queue];
    const totalPages = Math.max(1, Math.ceil(queue.length / QUEUE_PAGE_SIZE));
    page = Math.max(1, Math.min(page, totalPages));
    const start = (page - 1) * QUEUE_PAGE_SIZE;
    const slice = queue.slice(start, start + QUEUE_PAGE_SIZE);
    const current = player.currentTrack;
    const totalMs = queue.reduce((a, t) => a + (t?.info?.length || 0), 0);

    const c = new ContainerBuilder();
    if (current?._accent) c.paint(pastel(current._accent));
    c.addTextDisplayComponents(text(current
        ? `### Now Playing ${link(current)} \`${formatDuration(current.info.length)}\``
        : '### Now Playing Nothing'));
    c.addSeparatorComponents(divider());
    if (!slice.length) c.addTextDisplayComponents(text('**No more tracks in queue**'));

    slice.forEach((track, i) => {
        trackSection(c,
            `### ${start + i + 1}. ${link(track)}\n` +
            `> - **Author:** ${String(track.info.author || 'Unknown').slice(0, 40)}\n` +
            `> - **Duration:** ${formatDuration(track.info.length)}\n` +
            `> - **Requester:** ${requesterMention(track)}`, track);
        if (i < slice.length - 1) c.addSeparatorComponents(divider());
    });

    const row = new ActionRowBuilder().addComponents(
        iconButton(`queue_home_${page}`, E.home, { disabled: disabled || page === 1 }),
        iconButton(`queue_prev_${page}`, E.prevPage, { disabled: disabled || page === 1 }),
        iconButton(`queue_delete_${page}`, E.delete, { style: ButtonStyle.Danger, disabled }),
        iconButton(`queue_next_${page}`, E.nextPage, { disabled: disabled || page === totalPages }),
    );
    c.addSeparatorComponents(divider()).addActionRowComponents(row).addSeparatorComponents(divider())
        .addTextDisplayComponents(text(`-# Page ${page} of ${totalPages} • ${queue.length} tracks • ${formatDuration(totalMs)}`));

    return { components: [c], flags: V2_FLAGS, allowedMentions: NO_PINGS, page, totalPages };
}

/** Sends the queue (ctx = kit context) and wires home / back / delete / next. */
async function sendQueue(ctx, player) {
    const first = buildQueuePayload(player, 1);
    const response = await ctx.respond({ components: first.components, flags: first.flags, allowedMentions: NO_PINGS });
    const collector = response.createMessageComponentCollector({ time: 300000 });
    let currentPage = 1;

    collector.on('collect', async (i) => {
        if (i.user.id !== ctx.user.id) {
            return i.reply({ ...fail('only the command user can use these buttons'), flags: V2_FLAGS | MessageFlags.Ephemeral }).catch(() => {});
        }
        const [, action, raw] = i.customId.split('_');
        let page = parseInt(raw, 10) || 1;
        if (action === 'delete') {
            collector.stop('deleted');
            await i.deferUpdate().catch(() => {});
            return i.message.delete().catch(() => {});
        }
        if (action === 'home') page = 1;
        else if (action === 'prev') page -= 1;
        else if (action === 'next') page += 1;
        else return;
        const next = buildQueuePayload(player, page);
        currentPage = next.page;
        await i.update({ components: next.components, flags: next.flags }).catch(() => {});
    });

    collector.on('end', async (_, reason) => {
        if (reason === 'deleted') return;
        const last = buildQueuePayload(player, currentPage, true);
        await response.edit({ components: last.components, flags: last.flags }).catch(() => {});
    });
}

module.exports = {
    pastel,
    WHITE, V2_FLAGS, NO_PINGS, divider, text, link, iconButton,
    statusContainer, statusPayload, ok, fail,
    addedToQueuePayload, addedPlaylistPayload,
    nowPlayingButtons, nowPlayingContainer, nowPlayingPayload,
    buildQueuePayload, sendQueue,
};
