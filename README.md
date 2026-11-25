# Paw

A multipurpose Discord bot built on discord.js v14. Moderation, security, community tools, economy, music and server analytics, all with a clean Components V2 interface.

Default prefix is `,` and it can be changed per server. Most commands also work as slash commands.

## Features

- **Security and moderation**: antinuke, antiraid, lockdown, permission guard, automod, logging, purge, snipe, tickets, warnings with proof images
- **Community**: levels and rank cards, profiles, welcome and farewell cards, giveaways, birthdays, reaction roles, button roles, confessions, stat counters, bump reminders, family, voicemaster
- **Economy and fun**: economy, stocks, games, roleplay, reminders, todo, leaderboards
- **Music**: Lavalink playback through Poru with queue, filters, playlists, favorites, autoplay and lyrics
- **Analytics**: server overview, activity, messages, voice, membership and per member stats
- **Lookups**: Instagram, TikTok, Twitter, Reddit, YouTube, Twitch, GitHub, Pinterest and more
- **Optional extras**: AI chat, image generation, text to speech and background removal, each turned on by adding its key
- **Localization**: several languages, picked per server

## Requirements

- Node.js 20 or newer
- PostgreSQL 13 or newer
- A Lavalink v4 server (only if you want music)

## Setup

```bash
git clone <your-repository-url> paw
cd paw
npm install
cp .env.example .env
```

Fill in `.env`, then start the bot:

```bash
npm start
```

Tables are created on the first start. On panel hosts, set the same names as startup variables and use `npm start` as the start command. Panels that hide dotfiles can use `env.example`, it is the same file.

## Configuration

Required:

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Bot token from the Discord Developer Portal |
| `CLIENT_ID` | Application ID |
| `OWNER_ID` | Your Discord user ID |
| `DATABASE_URL` | PostgreSQL connection string |

Common options:

| Variable | Description |
|---|---|
| `PREFIX` | Default prefix, `,` if empty |
| `SUPPORT_SERVER`, `WEBSITE` | Links used by the help and botinfo buttons |
| `HELP_BANNER` | Image link shown at the top of the help menu |
| `LAVALINK_HOSTS`, `LAVALINK_PORTS`, `LAVALINK_PASSWORDS`, `LAVALINK_SECURES` | Lavalink nodes, leave the host empty to run without music |
| `MUSIC_DEFAULT_PLATFORM` | `spsearch` (needs the LavaSrc plugin) or `ytsearch` |
| `DATABASE_SSL`, `DB_POOL_MAX` | Database tuning, SSL is detected on its own when empty |
| `AUTOMOD_EXEMPT` | `mods`, `admins` or `none` |

Everything else (AI providers, media tools, social lookups, premium links, log channels) is optional and listed with comments in [.env.example](.env.example).

## Database

Any PostgreSQL 13 or newer works. Set `DATABASE_URL` and the tables are created on the first start.

## Emojis

Paw works with no custom emoji at all, icons fall back to plain text. A bundled set of images lives in `src/media/emoji-pack`, named after the keys in `src/media/emojis.json`. With `BOT_TOKEN` set, the bot uploads every image whose key is still empty as an application emoji on start, writes the ids into `emojis.json` and restarts once. It never deletes anything.

To add or replace one, put a PNG or GIF named exactly like its key into `tempassets/` and restart. `src/media/emojis.md` lists every key.

## Permissions

Antinuke, the permission guard and logging need View Audit Log, Manage Roles, Kick Members, Ban Members and Moderate Members, plus a role placed above the members the bot should act on. Counters need Manage Channels.

Intents used, all requested in code: Guilds, Guild Members, Guild Moderation, Guild Emojis and Stickers, Guild Webhooks, Guild Invites, Guild Voice States, Guild Presences, Guild Messages, Message Content, Guild Message Reactions and Direct Messages. Enable the privileged ones (Server Members, Presence, Message Content) in the Developer Portal.

## Project structure

```
src/
  bootstrap.js     entry point
  events/          Discord event handlers
  modules/         commands (dual is prefix and slash, text, interactions)
  services/        shared logic, cards, music
  database/        schemas and queries
  localization/    language files
  settings/        configuration
  media/           fonts, badges, emoji data and pack
tools/             i18n checks
```

## Credits

Developed by [Cosmin](https://cosmin.bond).

The card fonts Courier Prime, Space Mono, Gloock and Outfit are licensed under the SIL Open Font License, the license files are in `src/media/fonts/cards/`.

## License

Released under the [ISC License](LICENSE).
