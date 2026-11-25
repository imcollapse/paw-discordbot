// Developed by Cosmin
// paw — images uploaded for a ticket panel (banner, thumbnail). Stored here because Discord upload links expire.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class TicketAsset extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                guildId: { type: DataTypes.STRING, allowNull: false },
                panelId: { type: DataTypes.INTEGER, allowNull: false },
                slot: { type: DataTypes.STRING(16), allowNull: false },   // 'banner' | 'thumb'
                mime: { type: DataTypes.STRING(32), allowNull: false },
                data: { type: DataTypes.BLOB('long'), allowNull: false },
            },
            {
                sequelize,
                modelName: 'TicketAsset',
                tableName: 'ticket_assets',
                timestamps: true,
                indexes: [{ unique: true, fields: ['panelId', 'slot'] }],
            }
        );
        return this;
    }
}

module.exports = TicketAsset;
