// Developed by Cosmin
// paw — proof images for moderation commands (optional, up to 3).
// Prefix:  ,ban @user spamming   + attach up to 3 images to the same message
// Slash:   /moderation ban user:@x proof:<image> proof2:<image> proof3:<image>
// The result card shows them, and the moderation log gets them as proof.

const { MediaGalleryBuilder, MediaGalleryItemBuilder, AttachmentBuilder, ContainerBuilder, MessageFlags } = require('discord.js');

const MAX = 3;
const MAX_BYTES = 8 * 1024 * 1024;
const isImage = (a) => (a?.contentType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(a?.name || a?.url || '');

/** Image attachments on a prefix command message. */
const fromMessage = (message) => [...(message.attachments?.values?.() ?? [])].filter(isImage).slice(0, MAX).map(a => a.url);

/** proof, proof2, proof3 options on a slash command. */
function fromInteraction(i) {
  const out = [];
  for (const name of ['proof', 'proof2', 'proof3']) {
    const a = i.options.getAttachment(name);
    if (a && isImage(a)) out.push(a.url);
  }
  return out;
}

/** Slash options to add to a subcommand. */
function addOptions(sub) {
  return sub
    .addAttachmentOption(o => o.setName('proof').setDescription('Proof image (optional)'))
    .addAttachmentOption(o => o.setName('proof2').setDescription('Second proof image (optional)'))
    .addAttachmentOption(o => o.setName('proof3').setDescription('Third proof image (optional)'));
}

/* The audit-log events that post the moderation log fire a moment after the command,
   so the command leaves its proof here for them to pick up. */
const pending = new Map();
const key = (guildId, targetId) => `${guildId}:${targetId}`;
function remember(guildId, targetId, urls) {
  if (!urls?.length) return;
  pending.set(key(guildId, targetId), { urls, at: Date.now() });
  setTimeout(() => { const e = pending.get(key(guildId, targetId)); if (e && Date.now() - e.at >= 60000) pending.delete(key(guildId, targetId)); }, 61000).unref?.();
}
function take(guildId, targetId) {
  const e = pending.get(key(guildId, targetId));
  if (!e || Date.now() - e.at > 60000) return [];
  pending.delete(key(guildId, targetId));
  return e.urls;
}

/** Download the images so the log keeps them after the original links expire. */
async function download(urls) {
  const files = [];
  for (const [n, url] of urls.slice(0, MAX).entries()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) continue;
      const ext = (new URL(url).pathname.match(/\.(png|jpe?g|gif|webp)$/i)?.[1] || 'png').toLowerCase();
      files.push({ name: `proof-${n + 1}.${ext}`, buf });
    } catch (_) { /* skip an image that cannot be fetched */ }
  }
  return files;
}

/** Add the images to a container. Returns the container. */
function addGallery(container, urls, names = null) {
  if (!urls?.length) return container;
  const g = new MediaGalleryBuilder();
  urls.slice(0, MAX).forEach((u, i) => g.addItems(new MediaGalleryItemBuilder().setURL(names ? `attachment://${names[i]}` : u)));
  return container.addMediaGalleryComponents(g);
}

/**
 * Post a moderation log message with proof (used for warns, which have no audit-log event).
 * Needs the guild's Moderation Logs channel from /logging setup.
 */
async function postLog(guild, { title, target, moderator, reason, duration, proofs = [] }) {
  try {
    const { getLogChannel } = require('../events/logging/loggingUtils');
    const channel = await getLogChannel(guild.client, guild.id, 'moderationLogs');
    if (!channel) return;
    const lines = [`**User:** <@${target.id}> (\`${target.id}\`)`, `**By:** <@${moderator.id}>`];
    if (duration) lines.push(`**Duration:** ${duration}`);
    lines.push(`**Reason:** ${reason || 'No reason provided'}`);
    const c = new ContainerBuilder().addTextDisplayComponents({ type: 10, content: `### ${title}\n${lines.join('\n')}` });
    const dl = await download(proofs);
    if (dl.length) addGallery(c, dl.map(f => f.name), dl.map(f => f.name));
    await channel.send({ components: [c], files: dl.map(f => new AttachmentBuilder(f.buf, { name: f.name })), flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  } catch (_) { /* logging must never break a command */ }
}

/** For the audit-log based posts: returns { files, apply(container) } for the pending proof of a target. */
async function forLog(guildId, targetId) {
  const urls = take(guildId, targetId);
  if (!urls.length) return { files: [], apply: (c) => c };
  const dl = await download(urls);
  return {
    files: dl.map(f => new AttachmentBuilder(f.buf, { name: f.name })),
    apply: (c) => (dl.length ? addGallery(c, dl.map(f => f.name), dl.map(f => f.name)) : c),
  };
}

module.exports = { MAX, fromMessage, fromInteraction, addOptions, remember, take, addGallery, postLog, forLog, download };
