// Developed by Cosmin
// paw · music · resume

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

module.exports = command({
    name: 'resume',
    aliases: ['unpause'],
    description: 'Resume the paused song',
    guard: { player: true },
    async run(ctx, _p, player) {
        if (!player.isPaused) return ctx.status(`${E.play} | the music is already playing.`);
        player.pause(false);
        return ctx.status(`${E.play} | resumed.`);
    },
});
