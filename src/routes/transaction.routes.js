const express = require('express');
const transactionController = require('../controllers/transaction.controller');
const authMiddleware = require('../middleware/auth.middleware');

const transactionRouter = express.Router();

/**
 * @route   POST /api/transaction
 * @desc    Execute an atomic transfer between two accounts with double-entry ledger postings
 * @access  Private (System User / Authorized System Service)
 */
transactionRouter.post('/', authMiddleware.authSystemUserMiddleware, transactionController.createTransaction);

/**
 * @route   POST /api/transaction/system/initial-funds
 * @desc    Deposit initial funds / liquidity into an account from system reserves
 * @access  Private (System User Only)
 */
transactionRouter.post('/system/initial-funds', authMiddleware.authSystemUserMiddleware, transactionController.createInitialFundsTransaction);

module.exports = transactionRouter;