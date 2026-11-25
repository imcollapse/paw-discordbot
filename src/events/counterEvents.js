// Developed by Cosmin
// paw · counter channels: starts the refresh timer (see services/counters.js).

const counters = require('../services/counters');

module.exports = { init(client) { counters.start(client); } };
