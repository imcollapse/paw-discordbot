// Developed by Cosmin
// Channels where the bot reports what it does. Leave a value empty to skip that log.
// Set them in .env, the values are channel IDs.

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const id = (name) => String(process.env[name] || '').trim();

module.exports = {
    JOIN_LOGS:   id('JOIN_LOGS'),   // the bot joins a server
    LEAVE_LOGS:  id('LEAVE_LOGS'),  // the bot leaves a server
    SLASH_LOGS:  id('SLASH_LOGS'),  // slash command usage
    PREFIX_LOGS: id('PREFIX_LOGS'), // prefix command usage
    ERROR_LOGS:  id('ERROR_LOGS'),  // errors and exceptions
    DM_LOGS:     id('DM_LOGS'),     // messages sent to the bot in DMs
};
