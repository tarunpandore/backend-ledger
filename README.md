# 🏦 Backend Ledger — Double-Entry Financial Transaction Engine

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-lightgrey.svg?logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20ReplicaSet-forestgreen.svg?logo=mongodb)](https://www.mongodb.com/)
[![Mongoose](https://img.shields.io/badge/Mongoose-9.x-red.svg?logo=mongoose)](https://mongoosejs.com/)
[![JWT](https://img.shields.io/badge/JWT-Authentication-blue.svg?logo=jsonwebtokens)](https://jwt.io/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

A robust, enterprise-grade financial transaction API and double-entry accounting engine built with **Node.js**, **Express**, and **MongoDB**. 

This system enforces core banking tenets: **immutable append-only ledgers**, **ACID-compliant multi-document transactions**, **idempotency keys** for safe retries, **real-time balance aggregation**, and **event-driven email notifications via Google OAuth2**.

---

## 📑 Table of Contents

- [Architectural Highlights](#-architectural-highlights)
- [System Architecture & Flow](#-system-architecture--flow)
- [Database Schema Design](#-database-schema-design)
- [API Reference](#-api-reference)
  - [Health Check](#health-check)
  - [Authentication](#authentication-endpoints)
  - [Accounts](#account-endpoints)
  - [Transactions](#transaction-endpoints)
- [Double-Entry Accounting Principle](#-double-entry-accounting-principle)
- [Idempotency & Race Condition Prevention](#-idempotency--race-condition-prevention)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running the Server](#running-the-server)
- [Testing Idempotency in Development](#-testing-idempotency-in-development)
- [Security & Best Practices](#-security--best-practices)

---

## 🌟 Architectural Highlights

- **Double-Entry Bookkeeping**: Balances are **never** stored as raw mutable numbers. Every financial transaction generates matching `DEBIT` and `CREDIT` entries.
- **Append-Only Immutable Ledger**: Ledger records cannot be updated, replaced, or deleted once written. Mongoose query hooks block all mutation attempts.
- **ACID Transactions via MongoDB Sessions**: Transfers execute within atomic multi-document sessions. If any step fails, the entire transaction is rolled back.
- **Idempotency Key Guard**: Client-provided UUID tokens ensure repeat requests (due to network latency or retries) never produce duplicate charges or entries.
- **Real-Time Balance Derivation**: Balances are calculated dynamically using high-performance MongoDB aggregation pipelines (`Total CREDIT - Total DEBIT`).
- **Role-Based Access Control (RBAC)**: Supports regular customer accounts and privileged `systemUser` accounts with immutable system flags.
- **Transactional Notifications**: Seamless email notifications for registration and transfer events via Nodemailer with Google OAuth2 authentication.

---

## 🏛 System Architecture & Flow

### Transfer Execution Flow

```
[ Client Request ]
        │  POST /api/transaction (with Idempotency Key)
        ▼
[ Idempotency Check ] ── (Already Processed?) ──► [ Return Existing Result ]
        │ (New Key)
        ▼
[ Account & Balance Validation ]
        │ (Verify ACTIVE status & Live Ledger Balance >= Amount)
        ▼
[ MongoDB ACID Session Start ]
   ├── 1. Insert Transaction (Status: PENDING)
   ├── 2. Insert DEBIT Ledger Record (Sender Account)
   ├── 3. [Simulated Processing Window for Concurrency Checks]
   ├── 4. Insert CREDIT Ledger Record (Recipient Account)
   └── 5. Update Transaction (Status: COMPLETED)
        │
[ Atomic Commit ] ── (Error?) ──► [ Abort Session & Rollback ]
        │ (Success)
        ▼
[ Async Email Notification via OAuth2 ]
        │
[ 201 Response to Client ]
```

---

## 🗄 Database Schema Design

### 1. `User` Model
Represents customer and internal operator profiles.
- `email`: String (Unique, validated via regex, indexed)
- `name`: String (Required)
- `password`: String (Hashed with `bcryptjs`, excluded from queries by default with `select: false`)
- `systemUser`: Boolean (Designates internal operator, `immutable: true`, `select: false`)

### 2. `Account` Model
Represents financial accounts belonging to a user.
- `user`: ObjectId (Ref to `User`, indexed)
- `status`: String enum (`ACTIVE`, `FROZEN`, `CLOSED`, default: `ACTIVE`)
- `currency`: String (Default: `"INR"`)
- **Instance Method**: `account.getBalance()` — Aggregates real-time balance from the ledger.

### 3. `Transaction` Model
Maintains transaction records and state machines.
- `fromAccount`: ObjectId (Ref to `Account`, debtor)
- `toAccount`: ObjectId (Ref to `Account`, creditor)
- `amount`: Number (Minimum 1)
- `status`: String enum (`PENDING`, `COMPLETED`, `FAILED`, `REVERSED`)
- `idempotencyKey`: String (Unique, indexed)

### 4. `Ledger` Model
The core append-only immutable ledger.
- `account`: ObjectId (Ref to `Account`, immutable)
- `amount`: Number (immutable)
- `transaction`: ObjectId (Ref to `Transaction`, immutable)
- `type`: String enum (`DEBIT`, `CREDIT`, immutable)
- **Immutability Hooks**: Pre-hooks for `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `findOneAndUpdate`, and `findOneAndDelete` throw errors if invoked.

---

## 🚀 API Reference

### Health Check

#### `GET /`
Returns the API operational status.

**Response (`200 OK`):**
```json
{
  "message": "Backend Ledger API is operational",
  "version": "1.0.0",
  "timestamp": "2026-09-10T21:00:00.000Z"
}
```

---

### Authentication Endpoints

Base URL: `/api/auth`

#### `POST /api/auth/register`
Registers a new customer, hashes the password, sets an authentication cookie, and sends a welcome email.

**Request Body:**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "securePassword123"
}
```

**Response (`201 Created`):**
```json
{
  "user": {
    "_id": "66e06cb321...",
    "email": "jane@example.com",
    "name": "Jane Doe"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### `POST /api/auth/login`
Authenticates user credentials and issues a JWT token.

**Request Body:**
```json
{
  "email": "jane@example.com",
  "password": "securePassword123"
}
```

**Response (`200 OK`):**
```json
{
  "user": {
    "_id": "66e06cb321...",
    "email": "jane@example.com",
    "name": "Jane Doe"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Account Endpoints

Base URL: `/api/account`  
*Requires Bearer Token in `Authorization` header or `token` cookie.*

#### `POST /api/account`
Creates a new financial account for the authenticated user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (`201 Created`):**
```json
{
  "account": {
    "_id": "66e0712a10...",
    "user": "66e06cb321...",
    "status": "ACTIVE",
    "currency": "INR",
    "createdAt": "2026-09-10T21:10:00.000Z",
    "updatedAt": "2026-09-10T21:10:00.000Z"
  }
}
```

#### `GET /api/account`
Retrieves all accounts belonging to the authenticated user.

**Response (`200 OK`):**
```json
{
  "accounts": [
    {
      "_id": "66e0712a10...",
      "user": "66e06cb321...",
      "status": "ACTIVE",
      "currency": "INR"
    }
  ]
}
```

#### `GET /api/account/balance/:accountId`
Calculates the live balance for a given account via double-entry aggregation.

**Response (`200 OK`):**
```json
{
  "accountId": "66e0712a10...",
  "balance": 2500
}
```

---

### Transaction Endpoints

Base URL: `/api/transaction`  
*Protected endpoints requiring authorization.*

#### `POST /api/transaction`
Executes an atomic transfer between two accounts.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "fromAccount": "66e0712a10...",
  "toAccount": "66e0821b33...",
  "amount": 500,
  "idempotencyKey": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
}
```

**Response (`201 Created`):**
```json
{
  "message": "Transaction completed successfully",
  "transaction": {
    "_id": "66e0934f88...",
    "fromAccount": "66e0712a10...",
    "toAccount": "66e0821b33...",
    "amount": 500,
    "status": "COMPLETED",
    "idempotencyKey": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "createdAt": "2026-09-10T21:15:00.000Z",
    "updatedAt": "2026-09-10T21:15:15.000Z"
  }
}
```

#### `POST /api/transaction/system/initial-funds`
Seeds liquidity or initial funds into an account from the system reserve account.

**Headers:**
```
Authorization: Bearer <system_user_jwt_token>
```

**Request Body:**
```json
{
  "toAccount": "66e0712a10...",
  "amount": 10000,
  "idempotencyKey": "init-funds-seed-001"
}
```

**Response (`201 Created`):**
```json
{
  "message": "Initial funds transaction completed successfully",
  "transaction": {
    "_id": "66e0999aa1...",
    "fromAccount": "66e0000000...",
    "toAccount": "66e0712a10...",
    "amount": 10000,
    "status": "COMPLETED",
    "idempotencyKey": "init-funds-seed-001"
  }
}
```

---

## ⚖️ Double-Entry Accounting Principle

In traditional naive architectures, transferring $100 from Alice to Bob updates balance columns:
```sql
-- DANGEROUS PATTERN (proned to race conditions and lost audit trails):
UPDATE accounts SET balance = balance - 100 WHERE id = 'alice';
UPDATE accounts SET balance = balance + 100 WHERE id = 'bob';
```

**In Backend Ledger**, account balance is a **derived view**, not a mutable number:
1. Every transfer posts two immutable ledger rows:
   - Account Alice: `DEBIT 100`
   - Account Bob: `CREDIT 100`
2. Total debits across the entire platform always balance total credits:
   $$\sum \text{Credits} - \sum \text{Debits} = 0$$
3. An account's balance is computed via the aggregation pipeline:
   ```javascript
   balance = Total(CREDIT) - Total(DEBIT)
   ```
4. Even if a server crashes midway, ACID sessions guarantee either both records exist or neither does.

---

## 🔒 Idempotency & Race Condition Prevention

Network disruptions often cause clients to retry requests when they don't receive an acknowledgment. Without idempotency guards, this leads to **double-spending**.

In this project:
1. Every transaction requires an `idempotencyKey` provided by the client (typically a UUID v4).
2. If a request is received with an already completed key, the cached result is returned immediately without executing another transfer.
3. If a request is received while the previous one is still processing (`status: PENDING`), the API acknowledges that the transaction is in flight, blocking duplicate runs.
4. An intentional 15-second simulation window exists between debit and credit postings in `createTransaction`, enabling developers to test concurrent requests and observe the pending status protection in action.

---

## 🛠 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) or a local MongoDB Replica Set (Transactions require a replica set or Atlas cluster)
- Google Cloud Console Project (for Gmail OAuth2 credentials)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tarunpandore/backend-ledger.git
   cd backend-ledger
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

### Environment Variables

Copy the sample environment file and configure your values:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
PORT=3000
MODE=DEVELOPMENT

# MongoDB Atlas URI (Replica Set required for ACID transactions)
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/backend-ledger

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key

# Google OAuth2 Credentials for Email Notifications
CLIENT_ID=your_google_oauth_client_id
CLIENT_SECRET=your_google_oauth_client_secret
REFRESH_TOKEN=your_google_oauth_refresh_token
EMAIL_USER=your_email_address@gmail.com
```

### Running the Server

- **Development Mode** (with Nodemon):
  ```bash
  npm run dev
  ```

- **Production Mode**:
  ```bash
  npm start
  ```

---

## 🧪 Testing Idempotency in Development

To verify that the system handles retries and race conditions safely:

1. Open Postman or your preferred API client.
2. Send a `POST /api/transaction` request with a unique `idempotencyKey`:
   ```json
   {
     "fromAccount": "<your_account_id>",
     "toAccount": "<recipient_account_id>",
     "amount": 100,
     "idempotencyKey": "test-key-100"
   }
   ```
3. Within 15 seconds, send the exact same request again in another tab.
4. Notice that the second request immediately receives:
   ```json
   {
     "message": "Transaction is still processing"
   }
   ```
5. Once the first request finishes, any subsequent request with `test-key-100` returns the completed transaction without debiting funds a second time.

---

## 🛡 Security & Best Practices

- **Password Hashing**: Salts and hashes passwords with `bcryptjs` using 10 salt rounds.
- **Data Protection**: Sensitive fields like passwords and system user flags are explicitly suppressed from query projections (`select: false`).
- **HTTP-Only Cookies**: JWT tokens are issued with `httpOnly: true` and `sameSite: strict` to mitigate Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF).
- **Immutable Financial Ledger**: Pre-hooks prevent modification or erasure of financial records.
- **Fail-Safe Email Dispatch**: Email delivery failures are logged gracefully without interrupting committed financial transactions.

---

## 👤 Author

Developed by **Tarun Pandore**  
- GitHub: [@tarunpandore](https://github.com/tarunpandore)
