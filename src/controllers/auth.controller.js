const userModel = require('../models/user.model');
const jwt = require('jsonwebtoken');
const emailService = require('../services/email.service');
const tokenBlackListModel = require('../models/blackList.model');

/**
 * ============================================================================
 * AUTHENTICATION CONTROLLER
 * ============================================================================
 */

/**
 * Register a new user
 *
 * Flow:
 * 1. Validate required payload (email, password, name)
 * 2. Check if a user with the provided email already exists (HTTP 422 if duplicate)
 * 3. Create user document (password is securely hashed via pre-save hook)
 * 4. Generate JWT token with a 3-day expiration
 * 5. Set JWT token in HTTP cookie and respond with user profile
 * 6. Send asynchronous welcome email notification
 */
async function userRegisterController(req, res) {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({
            message: "Email, password, and name are required",
            status: "failed"
        });
    }

    const isExists = await userModel.findOne({
        email: email
    });

    if (isExists) {
        return res.status(422).json({
            message: "User already exists with email.",
            status: "failed"
        });
    }

    const user = await userModel.create({
        email,
        password,
        name
    });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        expiresIn: "3d"
    });

    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.MODE === 'PRODUCTION',
        sameSite: 'strict'
    });

    res.status(201).json({
        user: {
            _id: user._id,
            email: user.email,
            name: user.name
        },
        token
    });

    // Send welcome email asynchronously without blocking or failing the registration flow
    try {
        await emailService.sendRegistrationEmail(user.email, user.name);
    } catch (emailErr) {
        console.error("Welcome email delivery failed:", emailErr.message);
    }
}

/**
 * User Login
 *
 * Flow:
 * 1. Extract email and password from request body
 * 2. Retrieve user record including the hidden password hash (`select('+password')`)
 * 3. Verify password hash using bcrypt comparison method
 * 4. Generate signed JWT token
 * 5. Set HTTP cookie and return sanitized user profile
 */
async function userLoginController(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Email and password are required"
        });
    }

    const user = await userModel.findOne({ email }).select("+password");

    if (!user) {
        return res.status(401).json({
            message: "Email or password is INVALID"
        });
    }

    const isValidPassword = await user.comparePassword(password);

    if (!isValidPassword) {
        return res.status(401).json({
            message: "Email or password is INVALID"
        });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        expiresIn: "3d"
    });

    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.MODE === 'PRODUCTION',
        sameSite: 'strict'
    });

    res.status(200).json({
        user: {
            _id: user._id,
            email: user.email,
            name: user.name
        },
        token
    });
}


/**
 * User Logout
 *
 * Flow:
 * 1. Extract token from HTTP-only cookie or Authorization Bearer header
 * 2. If token is missing, return 400 Bad Request
 * 3. Store the token in the token blacklist to invalidate further use
 * 4. Clear the 'token' cookie from the client response
 * 5. Return success confirmation
 */
async function userLogoutController(req, res) {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(400).json({
            message: "Token is required to logout"
        });
    }

    try {
        await tokenBlackListModel.updateOne(
            { token },
            { $setOnInsert: { token } },
            { upsert: true }
        );

        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.MODE === 'PRODUCTION',
            sameSite: 'strict'
        });

        return res.status(200).json({
            message: "User logged out successfully"
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to logout user",
            error: error.message
        });
    }
}

module.exports = {
    userRegisterController,
    userLoginController,
    userLogoutController
};

