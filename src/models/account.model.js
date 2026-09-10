const mongoose = require('mongoose');
const ledgerModel = require('./ledger.model');

/**
 * ============================================================================
 * ACCOUNT MODEL
 * ============================================================================
 *
 * Represents a user's financial account.
 * Key Concepts:
 * - Accounts belong to a User (`user` ref).
 * - Status lifecycle: ACTIVE, FROZEN, CLOSED.
 *   Transactions can only proceed if both accounts are ACTIVE.
 * - Single-currency support (default: "INR").
 * - Balance is NOT stored directly on this document.
 *   Instead, `getBalance()` aggregates all immutable ledger entries in real time,
 *   preventing race conditions and discrepancies.
 */
const accountSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: [true, "Account must be associated with a user"],
        index: true
    },
    status: {
        type: String,
        enum: {
            values: ["ACTIVE", "FROZEN", "CLOSED"],
            message: "Status can be either ACTIVE, FROZEN, or CLOSED",
        },
        default: "ACTIVE"
    },
    currency: {
        type: String,
        required: [true, "Currency is required for creating an account"],
        default: "INR"
    }
}, {
    timestamps: true
});

// Compound index to optimize queries filtering by user and account status
accountSchema.index({ user: 1, status: 1 });

/**
 * Instance Method: getBalance
 *
 * Calculates real-time account balance using double-entry ledger aggregation:
 * 1. Matches all ledger entries for this account (`account === this._id`).
 * 2. Groups records and sums amounts by entry type (CREDIT vs DEBIT).
 * 3. Subtracts totalDebit from totalCredit:
 *    Account Balance = Total CREDIT - Total DEBIT
 *
 * Returns 0 if no ledger entries exist yet.
 */
accountSchema.methods.getBalance = async function () {
    const balanceData = await ledgerModel.aggregate([
        { $match: { account: this._id } },
        {
            $group: {
                _id: null,
                totalDebit: {
                    $sum: {
                        $cond: [
                            { $eq: ["$type", "DEBIT"] },
                            "$amount",
                            0
                        ]
                    }
                },
                totalCredit: {
                    $sum: {
                        $cond: [
                            { $eq: ["$type", "CREDIT"] },
                            "$amount",
                            0
                        ]
                    }
                }
            }
        },
        {
            $project: {
                _id: 0,
                balance: { $subtract: ["$totalCredit", "$totalDebit"] }
            }
        }
    ]);

    if (balanceData.length === 0) {
        return 0;
    }

    return balanceData[0].balance;
};

const accountModel = mongoose.model('account', accountSchema);

module.exports = accountModel;