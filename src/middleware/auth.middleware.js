const userModel = require('../models/user.model');
const jwt = require('jsonwebtoken');

/**
 * ============================================================================
 * AUTHENTICATION MIDDLEWARE
 * ============================================================================
 *
 * Verifies JWT tokens passed either via:
 * 1. HTTP-only cookies (`req.cookies.token`)
 * 2. Authorization Header (`Bearer <token>`)
 *
 * If valid, fetches the authenticated user and attaches it to `req.user`.
 */
async function authMiddleware(req, res, next) {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Unauthorized access, token is missing"
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await userModel.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                message: "Unauthorized access, user not found"
            });
        }

        req.user = user;
        return next();
    } catch (err) {
        return res.status(401).json({
            message: "Unauthorized access, token is invalid"
        });
    }
}

/**
 * ============================================================================
 * SYSTEM USER (ADMIN / INTERNAL) AUTHORIZATION MIDDLEWARE
 * ============================================================================
 *
 * Enforces role-based access control for privileged system endpoints
 * (such as system-initiated fund injections or privileged transaction execution).
 *
 * Validates the JWT and ensures the authenticated user has `systemUser: true`.
 */
async function authSystemUserMiddleware(req, res, next) {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Unauthorized access, token is missing"
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await userModel.findById(decoded.userId).select('+systemUser');

        if (!user) {
            return res.status(401).json({
                message: "Unauthorized access, user not found"
            });
        }

        if (!user.systemUser) {
            return res.status(403).json({
                message: "Forbidden access, not a system user"
            });
        }

        req.user = user;
        return next();
    } catch (err) {
        return res.status(401).json({
            message: "Unauthorized access, token is invalid"
        });
    }
}

module.exports = {
    authMiddleware,
    authSystemUserMiddleware
};