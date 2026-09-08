require('dotenv').config();

const app = require('./src/app');
const connectToDB = require('./src/config/db');

const PORT = process.env.PORT;
const MODE = process.env.MODE;


connectToDB()

app.listen(PORT, () => {
    console.log(`PORT: ${PORT}`);
    console.log(`${MODE}: Server is running...`);
});