const mongoose = require('mongoose');

/**
 * Connect to MongoDB database
 * Ensures strict connection handling with error logging.
 */
function connectToDB() {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => {
            console.log("MongoDB connection established successfully.");
        })
        .catch((err) => {
            console.error("Error connecting to MongoDB:", err.message);
            process.exit(1);
        });
}

module.exports = connectToDB;