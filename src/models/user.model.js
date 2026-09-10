const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * ============================================================================
 * USER MODEL
 * ============================================================================
 *
 * Represents application users (customers and internal system accounts).
 * Features:
 * - Email format validation via regex and uniqueness guarantee
 * - Password hashing with bcrypt via Mongoose pre-save middleware
 * - Password exclusion from query projections by default (`select: false`)
 * - System user designation (`systemUser: true`) for administrative operations
 */
const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, "Email is required for creating a user"],
        trim: true,
        lowercase: true,
        match: [
            /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            "Invalid Email address"
        ],
        unique: [true, "Email already exists"]
    },
    name: {
        type: String,
        required: [true, "Name is required for creating an account"],
        trim: true
    },
    password: {
        type: String,
        required: [true, "Password is required for creating an account"],
        minLength: [6, "Password should contain more than 6 characters"],
        select: false // Excluded from default queries for security
    },
    systemUser: {
        type: Boolean,
        default: false,
        immutable: true, // Prevents privilege escalation once set
        select: false
    }
}, {
    timestamps: true
});

/**
 * Pre-save middleware to hash the password before saving to the database.
 * Only hashes the password if it has been modified or is newly created.
 */
userSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }

    const hash = await bcrypt.hash(this.password, 10);
    this.password = hash;
    return;
});

/**
 * Instance method to safely compare candidate plain-text password with stored hash.
 */
userSchema.methods.comparePassword = async function (password) {
    return bcrypt.compare(password, this.password);
};

const userModel = mongoose.model("user", userSchema);

module.exports = userModel;