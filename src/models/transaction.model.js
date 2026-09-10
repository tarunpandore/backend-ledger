const mongoose = require('mongoose');

/**
 * ============================================================================
 * TRANSACTION MODEL
 * ============================================================================
 *
 * Represents an intent to transfer funds between two accounts.
 *
 * Key Concepts:
 * - Links `fromAccount` (debtor) and `toAccount` (creditor).
 * - State Machine:
 *   - PENDING: Transaction initialized, ledger postings in progress.
 *   - COMPLETED: Both DEBIT and CREDIT ledger entries posted, session committed.
 *   - FAILED: Aborted due to validation, business rule failure, or database error.
 *   - REVERSED: Rollback or refund transaction executed.
 * - Idempotency Key:
 *   A client-provided unique UUID/token (`idempotencyKey`).
 *   Guarantees that repeated/retry requests do NOT cause duplicate debit/credit operations.
 */
const transactionSchema = new mongoose.Schema({
    fromAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'account',
        required: [true, "Transaction must be associated with a from account"],
        index: true
    },
    toAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'account',
        required: [true, "Transaction must be associated with a to account"],
        index: true
    },
    status: {
        type: String,
        enum: {
            values: ["PENDING", "COMPLETED", "FAILED", "REVERSED"],
            message: "Status can be either PENDING, COMPLETED, FAILED or REVERSED",
        },
        default: "PENDING"
    },
    amount: {
        type: Number,
        required: [true, "Amount is required for creating a transaction"],
        min: [1, "Transaction amount cannot be negative or zero"]
    },
    idempotencyKey: {
        type: String,
        required: [true, "Idempotency Key is required for creating a transaction"],
        index: true,
        unique: true
    }
}, {
    timestamps: true
});

const transactionModel = mongoose.model('transaction', transactionSchema);

module.exports = transactionModel;