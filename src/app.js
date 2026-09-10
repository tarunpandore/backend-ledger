const express = require('express');
const cookieParser = require('cookie-parser');

const authRouter = require('./routes/auth.routes');
const accountRouter = require('./routes/account.routes');
const transactionRouter = require('./routes/transaction.routes');

const app = express();

// Parse incoming JSON payloads
app.use(express.json());

// Parse cookies attached to the client request
app.use(cookieParser());

// Health check endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        message: "Backend Ledger API is operational",
        version: "1.0.0",
        timestamp: new Date().toISOString()
    });
});

// Mount application API routers
app.use('/api/auth', authRouter);
app.use('/api/account', accountRouter);
app.use('/api/transaction', transactionRouter);

module.exports = app;