// Developed by Cosmin
// paw — /settings
// Your own settings, shared by every server: language, Last.fm, help style, time zone, birthday,
// privacy, AFK behaviour and reminders. Each page lists the settings with a button next to them.
// Every confirmation is private (ephemeral), so only the person who changed something sees it.
// (Server-wide bot customisation lives in /customize.)

const {
  SlashCommandBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  SectionBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const ui = require('../../../services/ui');
const config = require('../../../settings');
const i18n = require('../../../localization');
const fm = require('../../../services/lastfm');
const B = require('../../../services/birthday');
const afkTools = require('../../../services/afkTools');
const birthdays = require('../../../database/birthdays');
const { getAll, run } = require('../../../database/pg');
const { UserSettings, LastfmUser, AFK } = require('../../../database/schemas');

const V2 = MessageFlags.IsComponentsV2;
const PREMIUM_URL = config.PREMIUM_URL || config.SUPPORT_SERVER;

const ID = {
  lang: 'us_lang', more: 'us_more', back: 'us_back',
  lastfm: 'us_lastfm', help: 'us_help',
  tz: 'us_tz', bday: 'us_bday',
  snipes: 'us_snipes', roleplay: 'us_roleplay',
  afkStatus: 'us_afk_status', afkMsg: 'us_afk_msg', afkPings: 'us_afk_pings',
  fmReact: 'us_fm_react', rem: 'us_rem',
};

const PAGES = [
  { key: 'general', label: 'General', description: 'Time zone, birthday and help style' },
  { key: 'privacy', label: 'Privacy', description: 'Snipes and roleplay' },
  { key: 'afk', label: 'AFK', description: 'Your AFK status, message and how pings reach you' },
  { key: 'lastfm', label: 'Last.fm', description: 'Your account and reactions' },
  { key: 'reminders', label: 'Reminders', description: 'Your upcoming reminders' },
];
const TITLES = Object.fromEntries(PAGES.map(p => [p.key, p]));

const PINGS = {
  channel: ['Tell them in the channel', 'Anyone who pings you sees that you are AFK'],
  dm: ['Tell them and DM me', 'Same, and I send you a DM about every ping'],
  none: ['Stay quiet', 'No reply and no DM while you are AFK'],
};

// helpers

const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
const onOff = (v) => (v ? 'On' : 'Off');

const validZone = (z) => { try { new Intl.DateTimeFormat('en-GB', { timeZone: z }); return true; } catch (_) { return false; } };
const zoneOf = (input) => {
  const q = String(input).trim().toLowerCase().replace(/\s+/g, '_');
  if (!q) return null;
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.find(z => z.toLowerCase() === q)
    ?? zones.find(z => z.toLowerCase().split('/').pop() === q)
    ?? (validZone(input.trim()) ? input.trim() : null);
};
const localTime = (zone) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

function textModal(id, title, label, { value, placeholder, max = 100, paragraph = false, description } = {}) {
  const input = new TextInputBuilder().setCustomId('value').setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(false).setMaxLength(max);
  if (value) input.setValue(String(value).slice(0, max));
  if (placeholder) input.setPlaceholder(placeholder);
  const f = new LabelBuilder().setLabel(label).setTextInputComponent(input);
  if (description) f.setDescription(description);
  return new ModalBuilder().setCustomId(id).setTitle(title).addLabelComponents(f);
}

/** One setting: text on the left, its button on the right. */
function item(text, button) {
  return new SectionBuilder().addTextDisplayComponents(ui.text(text)).setButtonAccessory(button);
}

// command

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Your own settings: language, Last.fm, help style, time zone, birthday, AFK and more'),

  name: 'settings',
  aliases: ['mysettings', 'preferences'],
  description: 'Your own settings: language, Last.fm, help style, time zone, birthday, AFK and more',
  category: 'general',

  async execute(ctx) {
    const user = ctx.user ?? ctx.author;
    const client = ctx.client;
    const guild = ctx.guild;
    const botName = client.user.displayName ?? client.user.username;
    const state = { view: 'home' };
    let d = {};

    async function refresh() {
      const [settings, lastfm, premium, birthday, afk, reminders] = await Promise.all([
        UserSettings.read(user.id),
        LastfmUser.findByPk(user.id).catch(() => null),
        require('../../../services/premium').isUserPremium(user.id).catch(() => false),
        birthdays.getUser(user.id).catch(() => null),
        guild ? AFK.findOne({ where: { guildId: guild.id, userId: user.id } }).catch(() => null) : null,
        getAll('SELECT * FROM reminders WHERE "userId" = $1 AND "triggerAt" > $2 ORDER BY "triggerAt" ASC LIMIT 10', [user.id, Date.now()]).catch(() => []),
      ]);
      d = { settings, lastfm, premium, birthday, afk, reminders, lang: i18n.byCode.get(i18n.languageOf(user.id)) ?? i18n.byCode.get(i18n.DEFAULT) };
    }

    // rendering

    const moreMenu = (disabled) => ui.row(ui.select(ID.more, 'More settings',
      PAGES.map(p => ({ label: p.label, value: p.key, description: p.description, default: p.key === state.view })), { disabled }));

    function home(disabled) {
      const s = d.settings;
      const auto = i18n.sourceOf(user.id) !== 'manual';
      const text = [
        `### ${user.displayName ?? user.username}'s settings`,
        `**Language** ${d.lang.flag} ${d.lang.native}${auto ? ' (automatic)' : ''}\n-# The language ${botName} replies to you in, anywhere you use it.`,
        `**Last.fm:** ${d.lastfm ? d.lastfm.username : 'Not linked'}\n${d.lastfm ? '-# Your music commands use this account.' : '-# Link your account to use the music commands.'}`,
        `**Premium:** ${d.premium ? 'Active' : 'Not active'}\n${d.premium ? '-# Thank you for supporting me.' : '-# Premium unlocks antiraid, filters, backups and more.'}`,
        `**Help style:** ${s.helpSimple ? 'Simple' : 'Panel'}\n-# Choose between the full help panel and the plain text version.`,
      ].join('\n');

      const c = ui.box();
      c.addSectionComponents(ui.section(text, user.displayAvatarURL({ size: 256 })));
      c.addSeparatorComponents(ui.sep());
      c.addActionRowComponents(ui.row(ui.select(ID.lang, 'Language', [
        { label: 'Automatic', value: 'auto', description: 'Follow your Discord language', default: auto },
        ...i18n.LANGUAGES.map(l => ({ label: l.native, value: l.code, description: l.name, emoji: l.flag, default: !auto && l.code === d.lang.code })),
      ], { disabled })));
      const buttons = [
        ui.btn(ID.lastfm, d.lastfm ? 'Unlink Last.fm' : 'Link Last.fm', { disabled }),
        ui.btn(ID.help, s.helpSimple ? 'Use help panel' : 'Use simple help', { disabled }),
      ];
      c.addActionRowComponents(ui.row(...buttons));
      if (!d.premium) c.addActionRowComponents(ui.row(ui.link('Get premium', PREMIUM_URL)));
      c.addActionRowComponents(moreMenu(disabled));
      return c;
    }

    function page(disabled) {
      const s = d.settings;
      const c = ui.box();
      const t = TITLES[state.view];
      c.addTextDisplayComponents(ui.text(`### ${t.label}\n${t.description}`));
      c.addSeparatorComponents(ui.sep());
      const b = (id, label, o = {}) => ui.btn(id, label, { disabled, ...o });

      if (state.view === 'general') {
        const tz = s.timezone ? `${s.timezone.replace(/_/g, ' ')} · ${localTime(s.timezone)}` : 'Not set';
        c.addSectionComponents(item(`**Time zone** · ${tz}\nShown on \`time\` when you do not name a place, e.g. Europe/London or America/New_York.`, b(ID.tz, 'Edit')));
        c.addSectionComponents(item(`**Birthday** · ${d.birthday ? B.pretty(d.birthday) : 'Not set'}\nMonth and day, e.g. March 14 or 14/03. Servers with birthdays turned on will celebrate it.`, b(ID.bday, 'Edit')));
        c.addSectionComponents(item(`**Simple help** · ${onOff(s.helpSimple)}\nPlain text help instead of the help panel.`, b(ID.help, onOff(s.helpSimple))));
      } else if (state.view === 'privacy') {
        c.addSectionComponents(item(`**Snipes** · ${onOff(s.allowSnipes)}\nLet others read your last deleted or edited message with \`snipe\`.`, b(ID.snipes, onOff(s.allowSnipes))));
        c.addSectionComponents(item(`**Roleplay** · ${onOff(s.allowRoleplay)}\nLet others hug, pat and wave at you with the roleplay commands.`, b(ID.roleplay, onOff(s.allowRoleplay))));
      } else if (state.view === 'afk') {
        const [pingName, pingDesc] = PINGS[s.afkPings] ?? PINGS.channel;
        c.addSectionComponents(item(`**Status** · ${d.afk ? clip(d.afk.reason, 60) : 'Not set'}\nSets you AFK in this server with this status. Leave it empty to come back.`, b(ID.afkStatus, 'Edit', { disabled: disabled || !guild })));
        c.addSectionComponents(item(`**AFK message** · ${s.afkMessage ? clip(s.afkMessage, 60) : 'Not set'}\nWhat I say when someone pings you while AFK. Use {user}, {reason} and {time}.`, b(ID.afkMsg, 'Edit')));
        c.addSectionComponents(item(`**Pings while AFK** · ${pingName}\n${pingDesc}.`, b(ID.afkPings, 'Edit')));
      } else if (state.view === 'lastfm') {
        c.addSectionComponents(item(`**Account** · ${d.lastfm ? d.lastfm.username : 'Not linked'}\n${d.lastfm ? 'Unlink it to stop using your Last.fm in the music commands.' : 'Link your Last.fm username to use the music commands.'}`, b(ID.lastfm, d.lastfm ? 'Unlink' : 'Link')));
        c.addSectionComponents(item(`**Reactions** · ${onOff(s.lastfmReactions)}\nAdd a thumbs up and down to your now playing message.`, b(ID.fmReact, onOff(s.lastfmReactions))));
      } else if (state.view === 'reminders') {
        if (!d.reminders.length) c.addTextDisplayComponents(ui.text('You have no upcoming reminders. Set one with `remind <time> <text>`.'));
        else {
          c.addTextDisplayComponents(ui.text(d.reminders.map((r, n) => `**${n + 1}.** <t:${Math.floor(Number(r.triggerAt) / 1000)}:R> · ${clip(r.message, 80)}`).join('\n')));
          c.addActionRowComponents(ui.row(ui.select(ID.rem, 'Cancel a reminder…', d.reminders.map((r, n) => ({
            label: `${n + 1}. ${clip(r.message, 60)}`, value: String(r.id), description: new Date(Number(r.triggerAt)).toUTCString().slice(5, 22) + ' UTC',
          })), { disabled })));
        }
      }

      c.addSeparatorComponents(ui.sep());
      c.addActionRowComponents(ui.row(b(ID.back, 'Back')));
      c.addActionRowComponents(moreMenu(disabled));
      return c;
    }

    const panel = (disabled = false) => (state.view === 'home' ? home(disabled) : page(disabled));

    await refresh();
    const msg = await ui.send(ctx, panel());
    if (!msg?.createMessageComponentCollector) return msg;

    const collector = msg.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: 600000 });

    /* private confirmations: only you see them */
    const privately = (i, box) => i.followUp({ components: [box], flags: V2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).catch(() => {});
    const done = (i, t) => privately(i, ui.success(t));
    const failed = (i, e) => privately(i, ui.fail(e instanceof fm.FmError ? e.message : (e?.message ?? String(e))));

    /** Acknowledge, run `work` (returns the confirmation), redraw, then confirm privately. */
    async function act(i, work) {
      await i.deferUpdate();
      let text = null; let error = null;
      try { text = await work(); } catch (e) { error = e; }
      try { await refresh(); } catch (_) {}
      await i.editReply({ components: [panel()], flags: V2 }).catch(() => {});
      if (error) await failed(i, error); else if (text) await done(i, text);
    }

    /** Show a modal, wait for it, then behave like `act` with what was submitted. */
    async function ask(i, modal, work) {
      await i.showModal(modal);
      const sub = await i.awaitModalSubmit({
        time: 180000,
        filter: (m) => m.customId === modal.data.custom_id && m.user.id === user.id,
      }).catch(() => null);
      if (!sub) return;
      await sub.deferUpdate();
      let text = null; let error = null;
      try { text = await work(sub); } catch (e) { error = e; }
      try { await refresh(); } catch (_) {}
      await sub.editReply({ components: [panel()], flags: V2 }).catch(() => {});
      if (error) await failed(sub, error); else if (text) await done(sub, text);
    }

    const modalId = (k) => `us_modal_${k}_${msg.id}_${Date.now()}`;
    const value = (sub) => sub.fields.getTextInputValue('value').trim();
    const toggle = (key, on, off) => async () => {
      const next = !d.settings[key];
      await UserSettings.write(user.id, { [key]: next });
      return next ? on : off;
    };

    // actions

    async function linkLastfm(sub) {
      const name = value(sub).replace(/^@/, '').replace(/^.*last\.fm\/user\//i, '').split(/[/?#]/)[0];
      if (!name) throw new Error('Enter your Last.fm username.');
      const u = await fm.info(name);                   // proves the account exists
      const old = await LastfmUser.findByPk(user.id);
      await LastfmUser.upsert({ userId: user.id, username: u.name, sessionKey: old && old.username.toLowerCase() === u.name.toLowerCase() ? old.sessionKey : null });
      return `Linked to ${u.name}.`;
    }

    async function setBirthday(sub) {
      const raw = value(sub);
      if (!raw) { await birthdays.removeUser(user.id); return 'Birthday removed.'; }
      const p = B.parseDate(raw);
      if (p.error) throw new Error(p.error.replace(/`/g, ''));
      await birthdays.setUser(user.id, p.month, p.day, p.year);
      return `Birthday set to ${B.pretty(p)}.`;
    }

    async function setTimezone(sub) {
      const raw = value(sub);
      if (!raw) { await UserSettings.write(user.id, { timezone: null }); return 'Time zone cleared.'; }
      const zone = zoneOf(raw);
      if (!zone) throw new Error('I do not know that time zone. Use a name like Europe/London or Asia/Kolkata.');
      await UserSettings.write(user.id, { timezone: zone });
      return `Time zone set to ${zone.replace(/_/g, ' ')}.`;
    }

    async function setStatus(sub) {
      const raw = value(sub);
      if (!guild) throw new Error('Use this in a server.');
      if (!raw) {
        const gone = await AFK.destroy({ where: { guildId: guild.id, userId: user.id } });
        afkTools.bust(guild.id, user.id);
        return gone ? 'Welcome back, your AFK is removed.' : 'You were not AFK.';
      }
      const checked = afkTools.cleanReason(raw);
      if (!checked.ok) throw new Error(checked.error);
      await afkTools.setAfk({ guildId: guild.id, userId: user.id, reason: checked.reason, dm: d.settings.afkPings === 'dm' });
      return `You are now AFK: ${checked.reason}`;
    }

    async function setAfkMessage(sub) {
      const raw = value(sub);
      if (/discord\.gg\/|discord(app)?\.com\/invite/i.test(raw)) throw new Error('No invite links in an AFK message.');
      await UserSettings.write(user.id, { afkMessage: raw || null });
      return raw ? 'AFK message saved.' : 'AFK message cleared, I will use the default.';
    }

    async function setPings(sub) {
      const pick = sub.fields.getStringSelectValues('pings')[0] ?? 'channel';
      await UserSettings.write(user.id, { afkPings: pick });
      return `Pings while AFK: ${PINGS[pick][0]}.`;
    }

    // routing

    collector.on('collect', async (i) => {
      try {
        const id = i.customId;

        // navigation
        if (id === ID.more) { state.view = i.values[0]; return await i.update({ components: [panel()], flags: V2 }); }
        if (id === ID.back) { state.view = 'home'; return await i.update({ components: [panel()], flags: V2 }); }

        if (id === ID.lang) {
          const v = i.values[0];
          return await act(i, async () => {
            const lang = v === 'auto'
              ? i18n.setLanguage(user.id, null, { source: 'auto', interaction: i })
              : i18n.setLanguage(user.id, v, { source: 'manual' });
            const meta = i18n.byCode.get(lang);
            return `Language set to ${meta.native}${v === 'auto' ? ' (automatic)' : ''}.`;
          });
        }

        if (id === ID.lastfm) {
          if (d.lastfm) {
            return await act(i, async () => { await LastfmUser.destroy({ where: { userId: user.id } }); return 'Last.fm unlinked.'; });
          }
          return await ask(i, textModal(modalId('fm'), 'Link Last.fm', 'Last.fm username', { placeholder: 'your username or profile link', max: 100 }), linkLastfm);
        }

        if (id === ID.help) return await act(i, toggle('helpSimple', 'Help now shows as plain text.', 'Help now opens the full panel.'));
        if (id === ID.snipes) return await act(i, toggle('allowSnipes', 'Others can snipe your messages.', 'Your deleted and edited messages are no longer saved for snipe.'));
        if (id === ID.roleplay) return await act(i, toggle('allowRoleplay', 'Others can use roleplay actions on you.', 'Roleplay actions on you are now blocked.'));
        if (id === ID.fmReact) return await act(i, toggle('lastfmReactions', 'Now playing will get reactions.', 'Now playing will not get reactions.'));

        if (id === ID.tz) return await ask(i, textModal(modalId('tz'), 'Time zone', 'Time zone', { value: d.settings.timezone, placeholder: 'Europe/London', max: 64, description: 'A city or zone name. Leave empty to clear it.' }), setTimezone);
        if (id === ID.bday) return await ask(i, textModal(modalId('bday'), 'Birthday', 'Birthday', { value: d.birthday ? B.pretty(d.birthday) : '', placeholder: 'March 14', max: 30, description: 'Month and day. Leave empty to remove it.' }), setBirthday);
        if (id === ID.afkStatus) return await ask(i, textModal(modalId('status'), 'Status', 'Status', { value: d.afk?.reason, placeholder: 'Leave empty to clear it.', max: 200 }), setStatus);
        if (id === ID.afkMsg) {
          return await ask(i, textModal(modalId('afkmsg'), 'AFK message', 'AFK message', {
            value: d.settings.afkMessage, placeholder: 'Leave empty to clear it.', max: 500, paragraph: true, description: 'Use {user}, {reason} and {time}.',
          }), setAfkMessage);
        }
        if (id === ID.afkPings) {
          const select = new StringSelectMenuBuilder().setCustomId('pings').addOptions(
            Object.entries(PINGS).map(([k, [label, description]]) => ({ label, description, value: k, default: k === d.settings.afkPings })));
          const modal = new ModalBuilder().setCustomId(modalId('pings')).setTitle('Pings while AFK')
            .addLabelComponents(new LabelBuilder().setLabel('Pings while AFK').setDescription('How I react when someone pings you.').setStringSelectMenuComponent(select));
          return await ask(i, modal, setPings);
        }

        if (id === ID.rem) {
          const rid = Number(i.values[0]);
          return await act(i, async () => {
            await run('DELETE FROM reminders WHERE id = $1 AND "userId" = $2', [rid, user.id]);
            return 'Reminder cancelled.';
          });
        }
      } catch (err) {
        console.error('[settings]', err);
      }
    });

    collector.on('end', async () => {
      try { await msg.edit({ components: [panel(true)], flags: V2 }); } catch (_) {}
    });

    return msg;
  },
};
