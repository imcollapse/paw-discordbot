// Developed by Cosmin
// paw — timezone: save yours, see anyone's local time.
// timezone · timezone @user · timezone set <zone> · timezone clear · timezone tokyo (just looks, saves nothing)

module.exports = {
    name: 'timezone',
    description: "Set your timezone or see someone else's local time",
    usage: 'timezone [user] | set <zone> | clear',
    aliases: ['tz', 'mytz'],
    category: 'utility',

    async execute(message, args = []) {
        const T = require('../../../services/timezone');
        const ui = require('../../../services/ui');
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'set') return T.set(message, args.slice(1).join(' '));
        if (['clear', 'remove', 'reset'].includes(sub)) return T.clear(message);
        if (!args.length) return T.view(message, null);

        // a person: mention, id or (part of) a name in this server
        let user = message.mentions.users.first() ?? null;
        const raw = args.join(' ').trim();
        if (!user && /^\d{17,20}$/.test(raw)) user = await message.client.users.fetch(raw).catch(() => null);
        if (!user && message.guild) {
            const q = raw.toLowerCase();
            user = message.guild.members.cache.find(m => m.user.username.toLowerCase() === q || m.displayName.toLowerCase() === q)?.user
                ?? message.guild.members.cache.find(m => m.user.username.toLowerCase().startsWith(q) || m.displayName.toLowerCase().startsWith(q))?.user ?? null;
        }
        if (user) return T.view(message, user);

        const zone = T.zoneOf(raw);   // `timezone tokyo`
        if (zone) return T.place(message, zone);
        return ui.send(message, ui.notice('base', `${message.author}: i couldn't find anyone or any place called **${raw.slice(0, 40)}** ~ try a @mention or a city`), { extra: { allowedMentions: { parse: [] } } });
    },
};
