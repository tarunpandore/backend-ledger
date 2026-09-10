const mongoose = require('mongoose');

/**
 * ============================================================================
 * LEDGER MODEL (Double-Entry Bookkeeping System)
 * ============================================================================
 *
 * In financial systems, balances should NEVER be stored as a single mutable number.
 * Storing a mutable "balance" column is prone to race conditions, silent data corruption,
 * and lack of auditability.
 *
 * Instead, this system implements an Append-Only Immutable Ledger:
 * 1. Every transfer produces two balanced ledger records:
 *    - DEBIT entry on the sender account
 *    - CREDIT entry on the recipient account
 * 2. An account's balance is derived on-demand by aggregating all historical entries:
 *    Current Balance = Total CREDITs - Total DEBITs
 * 3. Ledger entries are strictly IMMUTABLE. Once created, they cannot be edited or deleted.
 *    Any correction requires a new compensatory transaction.
 */
const ledgerSchema = new mongoose.Schema({
    // The account being debited or credited
    account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'account',
        required: [true, "Ledger must be associated with an account"],
        index: true,
        immutable: true
    },
    // The transaction amount (strictly positive number)
    amount: {
        type: Number,
        required: [true, "Amount is required for creating a ledger entry"],
        min: [0.01, "Amount must be greater than zero"],
        immutable: true
    },
    // Reference to the parent transaction linking debit and credit entries
    transaction: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'transaction',
        required: [true, "Ledger must be associated with a transaction"],
        index: true,
        immutable: true
    },
    // The direction of fund movement for this account
    type: {
        type: String,
        enum: {
            values: ["CREDIT", "DEBIT"],
            message: "Type can be either CREDIT or DEBIT",
        },
        required: [true, "Ledger type is required"],
        immutable: true
    }
}, {
    timestamps: true // Track exact timestamp when the ledger record was posted
});

/**
 * Prevent any modification or deletion of existing ledger records.
 * In a compliant financial ledger, history is permanent and auditable.
 */
function preventLedgerModification() {
    throw new Error("Ledger entries are immutable and cannot be modified or deleted");
}

// Hook into all Mongoose update/delete operations to enforce immutability
ledgerSchema.pre('findOneAndUpdate', preventLedgerModification);
ledgerSchema.pre('updateOne', preventLedgerModification);
ledgerSchema.pre('deleteOne', preventLedgerModification);
ledgerSchema.pre('remove', preventLedgerModification);
ledgerSchema.pre('deleteMany', preventLedgerModification);
ledgerSchema.pre('updateMany', preventLedgerModification);
ledgerSchema.pre('findOneAndDelete', preventLedgerModification);
ledgerSchema.pre('findOneAndReplace', preventLedgerModification);

const ledgerModel = mongoose.model('ledger', ledgerSchema);

module.exports = ledgerModel;