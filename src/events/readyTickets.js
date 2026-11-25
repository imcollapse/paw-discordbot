// Developed by Cosmin
// module : readyTickets
// paw — starts the ticket automation sweeper once the bot is ready.

const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    require('../services/ticketAutomation').start(client);
  },
};
