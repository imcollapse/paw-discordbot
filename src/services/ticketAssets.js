// Developed by Cosmin
// paw — ticket panel images. A member uploads a picture in a modal; it is stored here and sent as an
// attachment of the panel message itself, so it never expires like a plain Discord link would.

const { TicketAsset } = require('../database/schemas');

const MAX_BYTES = 4 * 1024 * 1024;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const SLOTS = { banner: 'panel-banner', thumb: 'panel-thumb' };

/** Download one uploaded attachment and check it. Returns { mime, data } or throws a readable Error. */
async function fromUpload(att) {
    const mime = String(att.contentType || '').split(';')[0].trim().toLowerCase();
    if (!EXT[mime]) throw new Error('Use a png, jpg, gif or webp image.');
    if (att.size > MAX_BYTES) throw new Error('Images can be up to 4 MB.');
    const res = await fetch(att.url);
    if (!res.ok) throw new Error('I could not download that image. Try again.');
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_BYTES) throw new Error('Images can be up to 4 MB.');
    return { mime, data };
}

async function save(guildId, panelId, slot, { mime, data }) {
    const row = await TicketAsset.findOne({ where: { panelId, slot } });
    if (row) await row.update({ guildId, mime, data });
    else await TicketAsset.create({ guildId, panelId, slot, mime, data });
}

const remove = (panelId, slot) => TicketAsset.destroy({ where: { panelId, slot } });
const removeAll = (panelId) => TicketAsset.destroy({ where: { panelId } });

/** { banner: { name, data }, thumb: { name, data } } for the slots that have an image. */
async function forPanel(panelId) {
    const rows = await TicketAsset.findAll({ where: { panelId } });
    const out = {};
    for (const r of rows) if (SLOTS[r.slot]) out[r.slot] = { name: `${SLOTS[r.slot]}.${EXT[r.mime] || 'png'}`, data: r.data };
    return out;
}

module.exports = { fromUpload, save, remove, removeAll, forPanel, MAX_BYTES };
