require('dotenv').config();

const app = require('./src/app');
const connectToDB = require('./src/config/db');

const PORT = process.env.PORT || 3000;
const MODE = process.env.MODE || 'DEVELOPMENT';

// Initialize Database connection
connectToDB();

// Start Express HTTP Server
app.listen(PORT, () => {
    console.log(`PORT: ${PORT}`);
    console.log(`MODE: ${MODE} - Server is running...`);
});