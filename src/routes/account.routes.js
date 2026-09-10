const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const accountController = require('../controllers/account.controller');

const router = express.Router();

/**
 * @route   POST /api/account
 * @desc    Create a new financial account for the authenticated user
 * @access  Private (Authenticated User)
 */
router.post('/', authMiddleware.authMiddleware, accountController.createAccountController);

/**
 * @route   GET /api/account
 * @desc    Retrieve all financial accounts owned by the authenticated user
 * @access  Private (Authenticated User)
 */
router.get('/', authMiddleware.authMiddleware, accountController.getUserAccountController);

/**
 * @route   GET /api/account/balance/:accountId
 * @desc    Get real-time balance for a specific account computed via ledger entries
 * @access  Private (Account Owner)
 */
router.get('/balance/:accountId', authMiddleware.authMiddleware, accountController.getAccountBalanceController);

module.exports = router;