const mongoose = require("mongoose");
const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");
const accountModel = require("../models/account.model");
const emailService = require("../services/email.service");

/**
 * ============================================================================
 * TRANSACTION CONTROLLER
 * ============================================================================
 *
 * Implements double-entry ledger bookkeeping transfers with MongoDB ACID transactions.
 *
 * The 10-Step Transfer Flow:
 * 1. Validate request payload & ensure sender/recipient accounts are different
 * 2. Validate idempotency key to prevent double-charging or race conditions
 * 3. Verify accounts exist and account statuses are ACTIVE
 * 4. Derive sender balance in real-time from ledger aggregation
 * 5. Initialize atomic MongoDB ACID session
 * 6. Create Transaction record in PENDING status
 * 7. Post DEBIT ledger entry on sender account
 * 8. Post CREDIT ledger entry on recipient account
 * 9. Update Transaction status to COMPLETED and commit session
 * 10. Send asynchronous email notification to sender
 */

/**
 * User-to-User Transfer Execution
 *
 * Executes an atomic transfer between two accounts with double-entry ledger postings.
 */
async function createTransaction(req, res) {
    /**
     * 1. Validate request payload
     */
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "FromAccount, toAccount, amount and idempotencyKey are required"
        });
    }

    if (amount <= 0) {
        return res.status(400).json({
            message: "Transaction amount must be greater than zero"
        });
    }

    if (fromAccount.toString() === toAccount.toString()) {
        return res.status(400).json({
            message: "Sender and recipient accounts cannot be the same"
        });
    }

    const fromUserAccount = await accountModel.findOne({ _id: fromAccount });
    const toUserAccount = await accountModel.findOne({ _id: toAccount });

    if (!fromUserAccount || !toUserAccount) {
        return res.status(400).json({
            message: "Invalid fromAccount or toAccount"
        });
    }

    /**
     * 2. Validate idempotency key (prevent duplicate transactions on retry)
     */
    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey: idempotencyKey
    });

    if (isTransactionAlreadyExists) {
        if (isTransactionAlreadyExists.status === "COMPLETED") {
            return res.status(200).json({
                message: "Transaction already processed",
                transaction: isTransactionAlreadyExists
            });
        }

        if (isTransactionAlreadyExists.status === "PENDING") {
            return res.status(200).json({
                message: "Transaction is still processing",
                transaction: isTransactionAlreadyExists
            });
        }

        if (isTransactionAlreadyExists.status === "FAILED") {
            return res.status(500).json({
                message: "Transaction processing failed, please retry"
            });
        }

        if (isTransactionAlreadyExists.status === "REVERSED") {
            return res.status(500).json({
                message: "Transaction was reversed, please retry"
            });
        }
    }

    /**
     * 3. Check account status (both sender and receiver accounts must be ACTIVE)
     */
    if (fromUserAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE") {
        return res.status(400).json({
            message: "Both fromAccount and toAccount must be ACTIVE to process transaction"
        });
    }

    /**
     * 4. Derive sender balance from immutable ledger history
     */
    const balance = await fromUserAccount.getBalance();

    if (balance < amount) {
        return res.status(400).json({
            message: `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`
        });
    }

    /**
     * 5. Execute transfer inside an atomic MongoDB ACID Session
     */
    let transaction;
    let session;
    try {
        session = await mongoose.startSession();
        session.startTransaction();

        // 5a. Create initial Transaction record in PENDING state
        transaction = (await transactionModel.create([{
            fromAccount,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING"
        }], { session }))[0];

        // 5b. Post DEBIT entry to debtor's ledger
        await ledgerModel.create([{
            account: fromAccount,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT"
        }], { session });

        // 5c. Simulated latency (15s delay):
        // Intentionally demonstrates how concurrent duplicate requests encounter
        // the "PENDING" state and prevent double spending / race conditions.
        await new Promise((resolve) => setTimeout(resolve, 15 * 1000));

        // 5d. Post CREDIT entry to creditor's ledger
        await ledgerModel.create([{
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT"
        }], { session });

        // 5e. Transition transaction status to COMPLETED
        await transactionModel.findOneAndUpdate(
            { _id: transaction._id },
            { status: "COMPLETED" },
            { session, new: true }
        );

        // 5f. Commit all operations atomically
        await session.commitTransaction();
    } catch (error) {
        // Rollback all pending operations in this session if an error occurs
        if (session) {
            await session.abortTransaction();
        }

        return res.status(400).json({
            message: "Transaction is Pending due to some issue, please retry after sometime",
            error: error.message
        });
    } finally {
        if (session) {
            session.endSession();
        }
    }

    /**
     * 6. Send email notification asynchronously
     */
    try {
        await emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount);
    } catch (emailErr) {
        console.error("Transaction confirmation email failed to send:", emailErr.message);
    }

    return res.status(201).json({
        message: "Transaction completed successfully",
        transaction: transaction
    });
}

/**
 * System-Initiated Initial Funds Transfer (Liquidity Seeding)
 *
 * Allows system accounts (administrators) to inject initial funds into an account.
 * Uses atomic MongoDB sessions to generate DEBIT on the system account and CREDIT on the recipient account.
 */
async function createInitialFundsTransaction(req, res) {
    const { toAccount, amount, idempotencyKey } = req.body;

    if (!toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "toAccount, amount and idempotencyKey are required"
        });
    }

    if (amount <= 0) {
        return res.status(400).json({
            message: "Amount must be greater than zero"
        });
    }

    // Check for duplicate idempotency key
    const isTransactionAlreadyExists = await transactionModel.findOne({ idempotencyKey });
    if (isTransactionAlreadyExists) {
        return res.status(200).json({
            message: "Transaction already processed",
            transaction: isTransactionAlreadyExists
        });
    }

    const toUserAccount = await accountModel.findOne({ _id: toAccount });

    if (!toUserAccount) {
        return res.status(400).json({
            message: "Invalid toAccount"
        });
    }

    const fromUserAccount = await accountModel.findOne({ user: req.user._id });

    if (!fromUserAccount) {
        return res.status(400).json({
            message: "System user account not found"
        });
    }

    let session;
    let transaction;
    try {
        session = await mongoose.startSession();
        session.startTransaction();

        transaction = new transactionModel({
            fromAccount: fromUserAccount._id,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING"
        });

        await ledgerModel.create([{
            account: fromUserAccount._id,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT"
        }], { session });

        await ledgerModel.create([{
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT"
        }], { session });

        transaction.status = "COMPLETED";
        await transaction.save({ session });

        await session.commitTransaction();
    } catch (error) {
        if (session) {
            await session.abortTransaction();
        }
        return res.status(400).json({
            message: "Failed to process initial funds transaction",
            error: error.message
        });
    } finally {
        if (session) {
            session.endSession();
        }
    }

    return res.status(201).json({
        message: "Initial funds transaction completed successfully",
        transaction: transaction
    });
}

module.exports = {
    createTransaction,
    createInitialFundsTransaction
};
