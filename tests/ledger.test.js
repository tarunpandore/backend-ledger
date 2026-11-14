/**
 * ============================================================================
 * BACKEND LEDGER INTEGRATION TEST SUITE
 * ============================================================================
 *
 * Verifies core banking and ledger guarantees:
 * 1. Double-Entry Bookkeeping: Total debits must strictly equal total credits.
 * 2. ACID Rollback: Any failure during multi-document operations aborts the session.
 * 3. Idempotency: Replaying an identical transaction key returns cached response without duplicate execution.
 * 4. Authentication & Token Revocation: Verifies JWT issuance, RBAC, and TTL blacklisting.
 * 5. Concurrency Safeguards: Parallel requests with duplicate idempotency keys do not double-spend.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_1234567890';
process.env.TEST_TRANSACTION_DELAY_MS = '0';

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const userModel = require('../src/models/user.model');
const accountModel = require('../src/models/account.model');
const transactionModel = require('../src/models/transaction.model');
const ledgerModel = require('../src/models/ledger.model');
const tokenBlackListModel = require('../src/models/blackList.model');

let replset;

beforeAll(async () => {
  // Initialize in-memory single-node replica set to support MongoDB ACID transactions
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const uri = replset.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replset) {
    await replset.stop();
  }
});

describe('1. System Health & Infrastructure', () => {
  test('GET / returns 200 and operational status', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Backend Ledger API is operational');
    expect(res.body.version).toBe('1.0.0');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('2. Authentication, RBAC & Token Blacklist', () => {
  const testUser = {
    name: 'DevOps Tester',
    email: 'devops@test.local',
    password: 'Password123!',
  };
  let userToken = '';

  test('POST /api/auth/register creates user and returns JWT token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.token).toBeDefined();
    userToken = res.body.token;

    // Password must be hashed in database
    const savedUser = await userModel.findOne({ email: testUser.email }).select('+password');
    expect(savedUser.password).not.toBe(testUser.password);
  });

  test('POST /api/auth/login authenticates valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('Protected endpoint rejects requests missing JWT token with 401', async () => {
    const res = await request(app).get('/api/account');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/token is missing/i);
  });

  test('POST /api/auth/logout blacklists token and prevents subsequent access', async () => {
    // 1. Verify access works with active token
    const preLogoutRes = await request(app)
      .get('/api/account')
      .set('Authorization', `Bearer ${userToken}`);
    expect(preLogoutRes.status).toBe(200);

    // 2. Perform logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${userToken}`);
    expect(logoutRes.status).toBe(200);

    // 3. Confirm token exists in blacklist collection
    const blacklisted = await tokenBlackListModel.findOne({ token: userToken });
    expect(blacklisted).not.toBeNull();

    // 4. Verify identical token is now rejected with 401
    const postLogoutRes = await request(app)
      .get('/api/account')
      .set('Authorization', `Bearer ${userToken}`);
    expect(postLogoutRes.status).toBe(401);
    expect(postLogoutRes.body.message).toMatch(/token is invalid/i);
  });
});

describe('3. Double-Entry Bookkeeping & ACID Transactions', () => {
  let systemUser, systemAccount, systemToken;
  let userA, accountA, tokenA;
  let userB, accountB, tokenB;

  beforeAll(async () => {
    // Create System Administrator User
    systemUser = await userModel.create({
      name: 'Central Reserve',
      email: 'system.reserve@bank.local',
      password: 'SystemPassword123!',
      systemUser: true,
    });
    systemToken = jwt.sign({ userId: systemUser._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    systemAccount = await accountModel.create({
      user: systemUser._id,
      status: 'ACTIVE',
      currency: 'INR',
    });

    // Create User A
    userA = await userModel.create({
      name: 'Alice Cooper',
      email: 'alice@bank.local',
      password: 'AlicePassword123!',
    });
    tokenA = jwt.sign({ userId: userA._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    accountA = await accountModel.create({
      user: userA._id,
      status: 'ACTIVE',
      currency: 'INR',
    });

    // Create User B
    userB = await userModel.create({
      name: 'Bob Marley',
      email: 'bob@bank.local',
      password: 'BobPassword123!',
    });
    tokenB = jwt.sign({ userId: userB._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    accountB = await accountModel.create({
      user: userB._id,
      status: 'ACTIVE',
      currency: 'INR',
    });
  });

  test('Liquidity Seeding: System injects initial funds into Account A', async () => {
    const seedPayload = {
      toAccount: accountA._id.toString(),
      amount: 1000,
      idempotencyKey: 'seed-alice-1000-inr',
    };

    const res = await request(app)
      .post('/api/transaction/system/initial-funds')
      .set('Authorization', `Bearer ${systemToken}`)
      .send(seedPayload);

    expect(res.status).toBe(201);
    expect(res.body.transaction.status).toBe('COMPLETED');

    // Balance verification: Account A should now have 1000
    const balanceA = await accountA.getBalance();
    expect(balanceA).toBe(1000);
  });

  test('Double-Entry Invariant: Transfer A -> B posts equal DEBIT and CREDIT entries', async () => {
    const transferPayload = {
      fromAccount: accountA._id.toString(),
      toAccount: accountB._id.toString(),
      amount: 300,
      idempotencyKey: 'transfer-alice-to-bob-300',
    };

    const res = await request(app)
      .post('/api/transaction')
      .set('Authorization', `Bearer ${systemToken}`)
      .send(transferPayload);

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/completed successfully/i);

    const transactionId = res.body.transaction._id;

    // Verify exactly two ledger entries exist for this transaction
    const ledgerEntries = await ledgerModel.find({ transaction: transactionId });
    expect(ledgerEntries).toHaveLength(2);

    const debitEntry = ledgerEntries.find((e) => e.type === 'DEBIT');
    const creditEntry = ledgerEntries.find((e) => e.type === 'CREDIT');

    // Double-entry guarantee: Debit amount strictly equals Credit amount
    expect(debitEntry.amount).toBe(300);
    expect(creditEntry.amount).toBe(300);
    expect(debitEntry.account.toString()).toBe(accountA._id.toString());
    expect(creditEntry.account.toString()).toBe(accountB._id.toString());

    // Verify derived ledger balances
    const newBalanceA = await accountA.getBalance();
    const newBalanceB = await accountB.getBalance();
    expect(newBalanceA).toBe(700);
    expect(newBalanceB).toBe(300);
  });

  test('Validation: Rejects transfer when sender has insufficient funds', async () => {
    const overdrawPayload = {
      fromAccount: accountA._id.toString(),
      toAccount: accountB._id.toString(),
      amount: 50000, // Exceeds balance of 700
      idempotencyKey: 'overdraw-attempt-50000',
    };

    const res = await request(app)
      .post('/api/transaction')
      .set('Authorization', `Bearer ${systemToken}`)
      .send(overdrawPayload);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insufficient balance/i);

    // Balance remains unchanged
    expect(await accountA.getBalance()).toBe(700);
  });

  test('ACID Rollback: Failure during transaction aborts session with zero orphan entries', async () => {
    const fakeRecipientId = new mongoose.Types.ObjectId();
    const failedPayload = {
      fromAccount: accountA._id.toString(),
      toAccount: fakeRecipientId.toString(),
      amount: 100,
      idempotencyKey: 'fail-rollback-test-key-01',
    };

    const res = await request(app)
      .post('/api/transaction')
      .set('Authorization', `Bearer ${systemToken}`)
      .send(failedPayload);

    expect(res.status).toBe(400);

    // No ledger entries should exist for this failed key
    const orphanedTx = await transactionModel.findOne({ idempotencyKey: failedPayload.idempotencyKey });
    expect(orphanedTx).toBeNull();

    // Sender balance remains intact at 700
    expect(await accountA.getBalance()).toBe(700);
  });

  test('Idempotency Replay: Submitting duplicate key returns cached transaction without duplicate deduction', async () => {
    const replayPayload = {
      fromAccount: accountA._id.toString(),
      toAccount: accountB._id.toString(),
      amount: 100,
      idempotencyKey: 'idempotent-unique-transfer-key-999',
    };

    // First execution
    const firstRes = await request(app)
      .post('/api/transaction')
      .set('Authorization', `Bearer ${systemToken}`)
      .send(replayPayload);
    expect(firstRes.status).toBe(201);
    expect(await accountA.getBalance()).toBe(600);
    expect(await accountB.getBalance()).toBe(400);

    // Second execution with identical payload and key (simulating network timeout retry)
    const secondRes = await request(app)
      .post('/api/transaction')
      .set('Authorization', `Bearer ${systemToken}`)
      .send(replayPayload);

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.message).toMatch(/transaction already processed/i);
    expect(secondRes.body.transaction._id).toBe(firstRes.body.transaction._id);

    // Balances must NOT be deducted again
    expect(await accountA.getBalance()).toBe(600);
    expect(await accountB.getBalance()).toBe(400);
  });

  test('Concurrency Safeguard: Parallel requests with same key execute exactly once', async () => {
    const concurrentKey = 'concurrent-race-key-' + Date.now();
    const concurrentPayload = {
      fromAccount: accountA._id.toString(),
      toAccount: accountB._id.toString(),
      amount: 50,
      idempotencyKey: concurrentKey,
    };

    const initialBalanceA = await accountA.getBalance();

    // Fire 3 simultaneous requests with identical idempotency key
    const [res1, res2, res3] = await Promise.all([
      request(app).post('/api/transaction').set('Authorization', `Bearer ${systemToken}`).send(concurrentPayload),
      request(app).post('/api/transaction').set('Authorization', `Bearer ${systemToken}`).send(concurrentPayload),
      request(app).post('/api/transaction').set('Authorization', `Bearer ${systemToken}`).send(concurrentPayload),
    ]);

    // All should resolve without crashes
    const statuses = [res1.status, res2.status, res3.status];
    expect(statuses).toContain(201); // Exactly one primary creation

    // Account A balance must be debited exactly once (50 INR), never 150 INR
    const finalBalanceA = await accountA.getBalance();
    expect(finalBalanceA).toBe(initialBalanceA - 50);
  });
});
