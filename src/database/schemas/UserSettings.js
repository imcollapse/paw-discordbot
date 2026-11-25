// Developed by Cosmin
// paw — per-user settings (help style, time zone, AFK behaviour, privacy, Last.fm). One row per Discord user, shared by every server.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

const cache = new Map();
const DEFAULTS = Object.freeze({
    helpSimple: false,
    timezone: null,
    afkMessage: null,
    afkPings: 'channel',        // channel = tell them in the channel · dm = channel and my DMs · none = say nothing
    allowSnipes: true,
    allowRoleplay: true,
    lastfmReactions: true,
});

class UserSettings extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                userId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
                helpSimple: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
                timezone: { type: DataTypes.STRING(64), allowNull: true },
                afkMessage: { type: DataTypes.TEXT, allowNull: true },
                afkPings: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'channel' },
                allowSnipes: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
                allowRoleplay: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
                lastfmReactions: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            },
            { sequelize, modelName: 'UserSettings', tableName: 'user_settings', timestamps: true },
        );
        return this;
    }

    /** Plain object with defaults; never null. */
    static async read(userId) {
        if (cache.has(userId)) return cache.get(userId);
        const row = await this.findByPk(userId);
        const val = { ...DEFAULTS };
        if (row) for (const k of Object.keys(DEFAULTS)) if (row[k] !== undefined) val[k] = row[k];
        if (cache.size > 5000) cache.clear();
        cache.set(userId, val);
        return val;
    }

    static async write(userId, patch) {
        const [row] = await this.findOrCreate({ where: { userId }, defaults: { userId } });
        Object.assign(row, patch);
        await row.save();
        cache.delete(userId);
        return this.read(userId);
    }
}

module.exports = UserSettings;
