// Developed by Cosmin
// paw — timezone: save your own, look at anyone else's.
// timezone                 your local time
// timezone @user           their local time
// timezone set <zone>      Europe/London, Asia/Kolkata, tokyo ...
// timezone clear           forget it

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const ui = require('./ui');
const config = require('../settings');
const { UserSettings } = require('../database/schemas');

const V2 = MessageFlags.IsComponentsV2;
const NO_PING = { parse: [] };

const CITY = {
  india: 'Asia/Kolkata', ist: 'Asia/Kolkata', kolkata: 'Asia/Kolkata', delhi: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', bangalore: 'Asia/Kolkata', chennai: 'Asia/Kolkata',
  newyork: 'America/New_York', nyc: 'America/New_York', est: 'America/New_York', la: 'America/Los_Angeles', pst: 'America/Los_Angeles', losangeles: 'America/Los_Angeles',
  chicago: 'America/Chicago', cst: 'America/Chicago', toronto: 'America/Toronto', london: 'Europe/London', uk: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin',
  madrid: 'Europe/Madrid', rome: 'Europe/Rome', moscow: 'Europe/Moscow', istanbul: 'Europe/Istanbul', dubai: 'Asia/Dubai', singapore: 'Asia/Singapore', tokyo: 'Asia/Tokyo',
  seoul: 'Asia/Seoul', beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai', hongkong: 'Asia/Hong_Kong', manila: 'Asia/Manila', jakarta: 'Asia/Jakarta', karachi: 'Asia/Karachi',
  dhaka: 'Asia/Dhaka', sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', auckland: 'Pacific/Auckland', cairo: 'Africa/Cairo', lagos: 'Africa/Lagos', utc: 'UTC', gmt: 'UTC',
};

const valid = (z) => { try { new Intl.DateTimeFormat('en-GB', { timeZone: z }); return true; } catch { return false; } };

/** "tokyo", "Asia/Tokyo", "kolkata" -> "Asia/Tokyo". Returns null when nothing matches. */
function zoneOf(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const q = raw.toLowerCase().replace(/\s+/g, '_');
  const zones = Intl.supportedValuesOf('timeZone');
  return CITY[q.replace(/_/g, '')]
    ?? zones.find(z => z.toLowerCase() === q)
    ?? zones.find(z => z.toLowerCase().split('/').pop() === q)
    ?? (valid(raw) ? raw : null);
}

/** Minutes east of UTC for a zone right now. */
function offsetMinutes(zone, at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(at).map(p => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}
const utcLabel = (zone) => {
  const m = offsetMinutes(zone), sign = m < 0 ? '-' : '+', a = Math.abs(m);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`;
};
const nice = (zone) => zone.replace(/_/g, ' ');

function difference(from, to) {   // how far `to` is from `from`
  const d = offsetMinutes(to) - offsetMinutes(from);
  if (d === 0) return 'the same time as you';
  const a = Math.abs(d), h = Math.floor(a / 60), m = a % 60;
  const span = [h ? `${h}h` : null, m ? `${m}m` : null].filter(Boolean).join(' ');
  return `${span} ${d > 0 ? 'ahead of' : 'behind'} you`;
}

const askerOf = (ctx) => ctx.user ?? ctx.author;
const say = (ctx, c, extra = []) => ui.send(ctx, extra.length ? [c, ...extra] : c, { extra: { allowedMentions: NO_PING } });
const prefixOf = (ctx) => (typeof ctx.isChatInputCommand === 'function' && ctx.isChatInputCommand() ? '/' : config.PREFIX);

const setButton = () => ui.row(ui.btn('tz:set', 'set your timezone'));

/** Show someone's local time. */
async function view(ctx, target) {
  const asker = askerOf(ctx);
  const self = !target || target.id === asker.id;
  const who = self ? asker : target;
  const [theirs, mine] = await Promise.all([UserSettings.read(who.id), self ? null : UserSettings.read(asker.id)]);

  if (!theirs.timezone) {
    if (self) {
      return say(ctx, ui.notice('base', `${asker}: you haven't set a timezone yet~ use \`${prefixOf(ctx)}timezone set (timezone)\` to set one.`), [setButton()]);
    }
    return say(ctx, ui.notice('base', `${who}: hasn't set a timezone yet~ ask them to use \`${prefixOf(ctx)}timezone set (timezone)\` ♡`));
  }

  const zone = theirs.timezone, now = new Date();
  const fmt = (o) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, ...o }).format(now);
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(now);
  const lines = [
    `### ${self ? 'your time' : `${who.displayName ?? who.username}'s time`}`,
    `**${clock}** · ${fmt({ weekday: 'long', day: 'numeric', month: 'long' })}`,
    `${nice(zone)} · ${utcLabel(zone)}`,
    !self && mine?.timezone ? ui.sub(difference(mine.timezone, zone)) : null,
  ].filter(Boolean).join('\n');

  const c = ui.box().addSectionComponents(ui.section(lines, who.displayAvatarURL({ extension: 'png', size: 256 })));
  return say(ctx, c);
}

/** `timezone tokyo`: the time in a place, without saving anything. */
async function place(ctx, zone) {
  const asker = askerOf(ctx), mine = await UserSettings.read(asker.id), now = new Date();
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(now);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const lines = [`### ${nice(zone)}`, `**${clock}** · ${day}`, utcLabel(zone), mine.timezone ? ui.sub(difference(mine.timezone, zone)) : null].filter(Boolean).join('\n');
  return say(ctx, ui.box().addTextDisplayComponents(ui.text(lines)));
}

async function save(user, raw) {
  const zone = zoneOf(raw);
  if (!zone) return null;
  await UserSettings.write(user.id, { timezone: zone });
  return zone;
}

async function clear(ctx) {
  await UserSettings.write(askerOf(ctx).id, { timezone: null });
  return say(ctx, ui.success('timezone cleared~ you can set a new one whenever you like ♡'));
}

const BAD_ZONE = "hmm, i don't know that one~ try a city or a name like `Asia/Kolkata`, `Europe/London` or `tokyo`.";

/** `timezone set <zone>` */
async function set(ctx, raw) {
  const user = askerOf(ctx);
  if (!String(raw ?? '').trim()) return say(ctx, ui.notice('base', `${user}: tell me where you are~ like \`${prefixOf(ctx)}timezone set Asia/Kolkata\``));
  const zone = await save(user, raw);
  if (!zone) return say(ctx, ui.fail(BAD_ZONE));
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
  return say(ctx, ui.success(`${user}: timezone saved ♡ it's **${clock}** in ${nice(zone)}`));
}

/* ---- button + modal (the "set your timezone" button) ---- */

function modal() {
  return new ModalBuilder().setCustomId('tz:modal').setTitle('set your timezone').addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('zone').setLabel('city or timezone').setPlaceholder('Asia/Kolkata, London, tokyo...')
      .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(64),
  ));
}

async function handle(interaction) {
  const id = interaction.customId;
  if (!id?.startsWith('tz:')) return false;
  if (id === 'tz:set' && interaction.isButton()) { await interaction.showModal(modal()); return true; }
  if (id === 'tz:modal' && interaction.isModalSubmit()) {
    const zone = await save(interaction.user, interaction.fields.getTextInputValue('zone'));
    const body = zone
      ? ui.success(`timezone saved ♡ it's **${new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date())}** in ${nice(zone)}`)
      : ui.fail(BAD_ZONE);
    await interaction.reply({ components: [body], flags: V2 | MessageFlags.Ephemeral, allowedMentions: NO_PING });
    return true;
  }
  return false;
}

module.exports = { view, set, clear, place, handle, zoneOf, utcLabel };
