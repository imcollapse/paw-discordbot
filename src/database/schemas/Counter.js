// Developed by Cosmin
// Counter channels: voice channels whose name shows a live number.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class Counter extends BaseModel {
    static init(sequelize) {
        super.init({
            id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            guildId:   { type: DataTypes.STRING, allowNull: false },
            channelId: { type: DataTypes.STRING, allowNull: false },
            type:      { type: DataTypes.STRING, allowNull: false },            // members | humans | bots | boosts | channels | roles
            template:  { type: DataTypes.STRING, allowNull: false },            // e.g. "Members: {count}"
            lastName:  { type: DataTypes.STRING, allowNull: true },
        }, {
            sequelize, modelName: 'Counter', tableName: 'counters', timestamps: true,
            indexes: [{ unique: true, fields: ['guildId', 'channelId'] }],
        });
        return this;
    }
}
module.exports = Counter;
