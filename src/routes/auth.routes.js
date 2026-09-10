const express = require("express");
const authController = require('../controllers/auth.controller');

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user, issue JWT token & send welcome email
 * @access  Public
 */
router.post('/register', authController.userRegisterController);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user credentials & issue JWT token
 * @access  Public
 */
router.post('/login', authController.userLoginController);

module.exports = router;