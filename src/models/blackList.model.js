const mongoose = require('mongoose');

/**
 * ============================================================================
 * TOKEN BLACKLIST MODEL
 * ============================================================================
 *
 * Stores invalidated JWT tokens upon user logout to prevent token replay attacks.
 * Features:
 * - Token uniqueness to avoid redundant entries in the blacklist.
 * - TTL (Time-To-Live) index on `createdAt` that automatically purges blacklisted
 *   tokens after 3 days (matching the 3-day JWT expiration time).
 */
const tokenBlackListSchema = new mongoose.Schema({
    token: {
        type: String,
        required: [true, "Token is required to blacklist"],
        unique: true,
        index: true
    }
}, {
    timestamps: true
});

// Automatically remove blacklisted token documents after 3 days
tokenBlackListSchema.index({ createdAt: 1 }, {
    expireAfterSeconds: 60 * 60 * 24 * 3
});

const tokenBlackListModel = mongoose.model('blacklist', tokenBlackListSchema);

module.exports = tokenBlackListModel;

