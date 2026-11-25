// Developed by Cosmin
// paw · bump reminder: watches DISBOARD bumps and brings saved reminders back after a restart (see services/bumpReminder.js).

const bump = require('../services/bumpReminder');

module.exports = {
  init(client) {
    client.on('messageCreate', (m) => bump.onMessage(client, m).catch((e) => console.warn('[bump]', e.message)));
    client.once('clientReady', () => bump.restore(client));
    if (client.isReady?.()) bump.restore(client);          // the module can load after the bot is already ready
  },
};
