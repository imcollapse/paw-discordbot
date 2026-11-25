// Developed by Cosmin
// paw — /customize (alias: custom)
// Server administrators change how I look in ONE server: name, avatar, banner, bio and name style.
// Six buttons, and every one opens a modal (avatar and banner take a real image upload).
// It is a premium feature: without Branding or Server Premium every button answers with the private premium card.

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  StringSelectMenuBuilder,
  FileUploadBuilder,
  TextDisplayBuilder,
  REST,
  Routes,
} = require('discord.js');
const ui = require('../../../services/ui');
const config = require('../../../settings');
const branding = require('../../../services/branding');
const botStyle = require('../../../services/botStyle');
const prem = require('../../../services/premium');
const premViews = require('../../../services/premium/views');
const { BotCustomization } = require('../../../database/schemas');

const V2 = MessageFlags.IsComponentsV2;
const EPH = MessageFlags.Ephemeral;
const SUPPORT = config.SUPPORT_SERVER;
const BIO_MAX = 190;

// name style: exactly what Discord offers, nothing invented

const FONTS = [
  [11, 'Default'], [1, 'Bangers'], [2, 'BioRhyme'], [3, 'Cherry Bomb'], [4, 'Chicle'], [5, 'Compagnon'],
  [6, 'MuseoModerno'], [7, 'Neo-Castel'], [8, 'Pixelify Sans'], [9, 'Ribes'], [10, 'Sinistre'], [12, 'Zilla Slab'],
];
const EFFECTS = [[1, 'Solid'], [2, 'Gradient'], [3, 'Neon'], [4, 'Toon'], [5, 'Pop'], [6, 'Glow']];

// helpers

const hex = (n) => '#' + n.toString(16).padStart(6, '0').toUpperCase();
const parseHex = (s) => (/^#?[0-9a-f]{6}$/i.test(String(s).trim()) ? parseInt(String(s).trim().replace('#', ''), 16) : null);

function lighten(n, f = 0.45) {
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * f));
  return (ch[0] << 16) | (ch[1] << 8) | ch[2];
}

const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

function composeBio(userBio) {
  const room = BIO_MAX - SUPPORT.length - 1;
  const text = (userBio || '').trim().slice(0, room);
  return text ? `${text}\n${SUPPORT}` : null; // null → my default bio
}

function errorText(err) {
  const code = err?.status ?? err?.rawError?.code;
  const raw = err?.rawError?.message ?? err?.message ?? 'something went wrong';
  if (err?.status === 403 || code === 50013) return 'i am missing the **Change Nickname** permission';
  if (err?.status === 429) return 'rate limited, try again in a moment';
  return clip(raw, 140);
}

/** The image a person uploaded in a modal, as a data uri Discord accepts. */
async function uploadToDataUri(attachment) {
  const type = (attachment.contentType || '').split(';')[0].trim().toLowerCase()
    || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' })[String(attachment.name).split('.').pop().toLowerCase()];
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(type || '')) throw new Error('use a png, jpg, gif or webp image');
  if (attachment.size > 8 * 1024 * 1024) throw new Error('that image is larger than 8 MB');
  const res = await fetch(attachment.url);
  if (!res.ok) throw new Error(`could not read the upload (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${type};base64,${buf.toString('base64')}`;
}

// modals

function textInput(id, { value, placeholder, max = 100, min = 0, paragraph = false, required = false } = {}) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(required)
    .setMaxLength(max)
    .setMinLength(min);
  if (value) input.setValue(String(value).slice(0, max));
  if (placeholder) input.setPlaceholder(placeholder);
  return input;
}

const field = (label, description) => {
  const l = new LabelBuilder().setLabel(label);
  if (description) l.setDescription(description);
  return l;
};

const textModal = (id, title, label, description, opts) =>
  new ModalBuilder().setCustomId(id).setTitle(title).addLabelComponents(field(label, description).setTextInputComponent(textInput('value', opts)));

const HAS_UPLOAD = typeof FileUploadBuilder === 'function' && typeof LabelBuilder.prototype.setFileUploadComponent === 'function';

/** Avatar / banner: a real file upload. (Falls back to an image link only if discord.js is too old for uploads.) */
function imageModal(id, title, what) {
  if (!HAS_UPLOAD) {
    return textModal(id, title, 'Image link', `Leave empty to go back to my default ${what}.`, { placeholder: 'https://…/image.png', max: 500 });
  }
  const upload = new FileUploadBuilder().setCustomId('image').setMinValues(0).setMaxValues(1).setRequired(false);
  return new ModalBuilder().setCustomId(id).setTitle(title)
    .addLabelComponents(field('Image', `Upload a png, jpg, gif or webp. Leave it empty to go back to my default ${what}.`).setFileUploadComponent(upload));
}

function styleModal(id, current) {
  const cur = current ?? botStyle.DEFAULT_STYLE;
  const colors = cur.colors ?? [];
  const font = new StringSelectMenuBuilder().setCustomId('font').setPlaceholder('Pick a font')
    .addOptions(FONTS.map(([v, name]) => ({ label: name, value: String(v), default: cur.font === v })));
  // gradient is not an effect here: it comes from the optional second colour
  const effect = new StringSelectMenuBuilder().setCustomId('effect').setPlaceholder('Pick an effect')
    .addOptions(EFFECTS.filter(([v]) => v !== 2).map(([v, name]) => ({ label: name, value: String(v), default: cur.effect === v || (cur.effect === 2 && v === 1) })));
  return new ModalBuilder().setCustomId(id).setTitle('Name style').addLabelComponents(
    field('Font').setStringSelectMenuComponent(font),
    field('Effect').setStringSelectMenuComponent(effect),
    field('Colour', 'One hex code.').setTextInputComponent(
      textInput('colors', { value: colors[0] != null ? hex(colors[0]) : '', placeholder: '#f6a8cc', max: 7, min: 6, required: true })),
    field('Gradient colour', 'Optional. Add a second hex code to fade into it.').setTextInputComponent(
      textInput('colors2', { value: colors[1] != null ? hex(colors[1]) : '', placeholder: '#c9b7f4', max: 7, required: false })),
  );
}

function resetModal(id) {
  return new ModalBuilder().setCustomId(id).setTitle('Reset everything?')
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('my name, avatar, banner, bio and name style go back to how they were when i joined.'))
    .addLabelComponents(field('Type reset to confirm').setTextInputComponent(textInput('value', { placeholder: 'reset', max: 5, min: 5, required: true })));
}

/** Read a string select from a submitted modal (works on every discord.js 14.2x). */
function pickedValue(sub, id) {
  try { const v = sub.fields.getStringSelectValues(id); if (v?.length) return v[0]; } catch (_) { /* fall through */ }
  return sub.fields.fields?.get(id)?.values?.[0];
}

// command

const ID = { name: 'cz_name', avatar: 'cz_avatar', banner: 'cz_banner', bio: 'cz_bio', style: 'cz_style', reset: 'cz_reset' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('customize')
    .setDescription('Change how I look in this server')
    .setDMPermission(false),

  name: 'customize',
  aliases: ['custom'],
  description: 'Change how I look in this server (name, avatar, banner, bio, style)',
  category: 'general',

  async execute(ctx) {
    const guild = ctx.guild;
    const user = ctx.user ?? ctx.author;
    if (!guild) return ui.say.error(ctx, 'use this in a server');

    const member = ctx.member ?? (await guild.members.fetch(user.id).catch(() => null));
    const allowed = guild.ownerId === user.id || member?.permissions?.has(PermissionFlagsBits.Administrator);
    if (!allowed) return ui.say.error(ctx, 'only server administrators can use this');

    const client = ctx.client;
    const rest = new REST({ version: '10' }).setToken(client.token);
    const patchMe = (body) => rest.patch(Routes.guildMember(guild.id, '@me'), { body });

    // the panel: same shape as the reference, in my voice

    function build(disabled = false) {
      const b = (id, label, o = {}) => ui.btn(id, label, { disabled, ...o });
      const c = ui.box();
      c.addTextDisplayComponents(ui.text('## dress me up ♡\nchange how i look in this server~ the owner and admins can use these.'));
      c.addSeparatorComponents(ui.sep());
      c.addActionRowComponents(ui.row(b(ID.name, 'name'), b(ID.avatar, 'avatar'), b(ID.banner, 'banner')));
      c.addActionRowComponents(ui.row(b(ID.bio, 'bio'), b(ID.style, 'style'), b(ID.reset, 'reset', { style: 'danger' })));
      return c;
    }
    const panel = (disabled = false) => branding.withGuild(guild.id, () => build(disabled));

    const msg = await ui.send(ctx, panel());
    if (!msg?.createMessageComponentCollector) return msg;

    const collector = msg.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: 600000 });

    /* private answers: only the person who pressed the button sees them */
    const privately = (i, box) => i.reply({ components: [box], flags: V2 | EPH, allowedMentions: { parse: [] } }).catch(() => {});
    const done = (i, t) => privately(i, ui.success(t));
    const failed = (i, err) => privately(i, ui.fail(typeof err === 'string' ? err : errorText(err)));

    /** The premium card, shown instead of any action while the server has no plan. */
    async function lock(i) {
      const status = await prem.guildStatus(guild.id);
      const prefix = await require('../../../services/helpMenu').getPrefix(guild.id).catch(() => config.PREFIX);
      return i.reply({
        components: [premViews.customizeLocked({ prefix, canTrial: !status.trialUsed })],
        flags: V2 | EPH,
        allowedMentions: { parse: [] },
      }).catch(() => {});
    }

    /** Open a modal, wait for it, run `work(sub)` (returns the confirmation text) and answer privately. */
    async function ask(i, modal, work) {
      await i.showModal(modal);
      const sub = await i.awaitModalSubmit({
        time: 300000,
        filter: (m) => m.customId === modal.data.custom_id && m.user.id === user.id,
      }).catch(() => null);
      if (!sub) return;
      let text = null; let error = null;
      try {
        // a plan can end while the modal is open
        if (!(await prem.hasBranding(guild.id))) return lock(sub);
        text = await work(sub);
      } catch (err) { error = err; }
      if (error) return failed(sub, error);
      return done(sub, text || 'done ♡');
    }

    const modalId = (k) => `cz_modal_${k}_${msg.id}_${Date.now()}`;

    // actions (each returns the confirmation text)

    async function setImage(field, sub) {
      const label = field === 'avatar' ? 'avatar' : 'banner';
      let source = null;
      if (HAS_UPLOAD) {
        let files = null;
        try { files = sub.fields.getUploadedFiles('image', false); } catch (_) { files = sub.fields.fields?.get('image')?.attachments ?? null; }
        source = files?.first?.() ?? null;
      }
      const link = HAS_UPLOAD ? null : sub.fields.getTextInputValue('value').trim();
      if (!source && !link) { await patchMe({ [field]: null }); return `my ${label} is back to the default ♡`; }
      let data;
      if (source) data = await uploadToDataUri(source);
      else {
        const res = await fetch(link);
        if (!res.ok) throw new Error(`could not download the image (${res.status})`);
        const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!/^image\/(png|jpe?g|gif|webp)$/.test(type)) throw new Error('use a png, jpg, gif or webp image');
        data = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
      }
      await patchMe({ [field]: data });
      return `my new ${label} looks so good ♡`;
    }

    async function applyStyle(style) {
      await patchMe({ display_name_font_id: style.font, display_name_effect_id: style.effect, display_name_colors: style.colors });
      await BotCustomization.write(guild.id, { nameStyle: style });
      return 'my name has a new look ♡';
    }

    async function resetAll() {
      let memberError = null;
      try {
        await patchMe({ nick: null, avatar: null, banner: null, bio: null, ...{
          display_name_font_id: botStyle.DEFAULT_STYLE.font, display_name_effect_id: botStyle.DEFAULT_STYLE.effect, display_name_colors: botStyle.DEFAULT_STYLE.colors } });
      } catch (err) { memberError = err; }
      await BotCustomization.clear(guild.id);
      if (!memberError) await BotCustomization.write(guild.id, { nameStyle: botStyle.fresh() });
      branding.setAccent(guild.id, null);
      if (memberError) throw new Error(`saved settings were cleared, but my profile was not reset: ${errorText(memberError)}`);
      return 'all fresh again, i look like i did on day one ♡';
    }

    // routing

    collector.on('collect', async (i) => {
      try {
        // every button needs premium; without it, the same private card each time
        if (!(await prem.hasBranding(guild.id))) return await lock(i);

        const cust = await BotCustomization.read(guild.id);

        switch (i.customId) {
          case ID.name: {
            const me = await guild.members.fetchMe({ force: true }).catch(() => guild.members.me);
            return await ask(i, textModal(modalId('name'), 'Server name', 'Name', 'Leave empty to use my own name.', { value: me?.nickname, max: 32 }),
              async (sub) => {
                const val = sub.fields.getTextInputValue('value').trim();
                await patchMe({ nick: val || null });
                return val ? 'i love my new name ♡' : 'my name is back to normal ♡';
              });
          }

          case ID.avatar:
            return await ask(i, imageModal(modalId('avatar'), 'Server avatar', 'avatar'), (sub) => setImage('avatar', sub));

          case ID.banner:
            return await ask(i, imageModal(modalId('banner'), 'Server banner', 'banner'), (sub) => setImage('banner', sub));

          case ID.bio:
            return await ask(i, textModal(modalId('bio'), 'Server bio', 'Bio', 'Leave empty to use my default bio.',
              { value: cust.userBio, max: BIO_MAX - SUPPORT.length - 1, paragraph: true }),
            async (sub) => {
              const val = sub.fields.getTextInputValue('value').trim();
              await patchMe({ bio: val ? composeBio(val) : null }); // empty = my default bio
              await BotCustomization.write(guild.id, { userBio: val || null });
              return val ? 'my bio is updated ♡' : 'my bio is back to the default ♡';
            });

          case ID.style:
            return await ask(i, styleModal(modalId('style'), cust.nameStyle), async (sub) => {
              const font = Number(pickedValue(sub, 'font'));
              let effect = Number(pickedValue(sub, 'effect'));
              if (!FONTS.some((f) => f[0] === font) || !EFFECTS.some((e) => e[0] === effect)) throw new Error('pick a font and an effect');
              const first = parseHex(sub.fields.getTextInputValue('colors').trim());
              if (first === null) throw new Error('enter a 6-digit hex code for the colour');
              const raw2 = sub.fields.getTextInputValue('colors2').trim();
              const second = raw2 ? parseHex(raw2) : undefined;
              if (second === null) throw new Error('the gradient colour must be a 6-digit hex code, or leave it empty');
              const colors = second === undefined ? [first] : [first, second];
              // a second colour is what makes it a gradient; without one the name stays a single colour
              if (second !== undefined && effect === 1) effect = 2;
              return applyStyle({ font, effect, colors });
            });

          case ID.reset:
            return await ask(i, resetModal(modalId('reset')), async (sub) => {
              if (sub.fields.getTextInputValue('value').trim().toLowerCase() !== 'reset') throw new Error('type **reset** to confirm, nothing was changed');
              return resetAll();
            });
        }
      } catch (err) {
        console.error('[customize]', err);
      }
    });

    collector.on('end', async () => {
      try { await msg.edit({ components: [panel(true)], flags: V2 }); } catch (_) {}
    });

    return msg;
  },
};
