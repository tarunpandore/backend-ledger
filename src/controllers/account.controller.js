const accountModel = require('../models/account.model');

/**
 * ============================================================================
 * ACCOUNT CONTROLLER
 * ============================================================================
 */

/**
 * Create a new financial account for the authenticated user
 *
 * Defaults:
 * - Currency: "INR"
 * - Status: "ACTIVE"
 * - Initial derived balance: 0 (since no ledger entries exist yet)
 */
async function createAccountController(req, res) {
    const user = req.user;

    const account = await accountModel.create({
        user: user._id
    });

    res.status(201).json({
        account
    });
}

/**
 * Get all accounts owned by the authenticated user
 */
async function getUserAccountController(req, res) {
    const accounts = await accountModel.find({ user: req.user._id });

    res.status(200).json({
        accounts
    });
}

/**
 * Calculate and return the real-time balance for a specific account
 *
 * Security:
 * - Scoped to the authenticated user (`user: req.user._id`) to prevent unauthorized balance leakage.
 * - Invokes `account.getBalance()` which computes balance from the immutable ledger via aggregation.
 */
async function getAccountBalanceController(req, res) {
    const { accountId } = req.params;

    const account = await accountModel.findOne({
        _id: accountId,
        user: req.user._id
    });

    if (!account) {
        return res.status(404).json({
            message: "Account not found"
        });
    }

    const balance = await account.getBalance();

    res.status(200).json({
        accountId: account._id,
        balance: balance
    });
}

module.exports = {
    createAccountController,
    getUserAccountController,
    getAccountBalanceController
};