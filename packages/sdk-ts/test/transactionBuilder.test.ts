import test from "node:test";
import assert from "node:assert/strict";
import {
  Account,
  SorobanDataBuilder,
  Keypair,
  rpc,
  TransactionBuilder,
  Networks,
  Transaction,
  xdr,
} from "@stellar/stellar-sdk";
import { KeeperRegistryClient } from "../src/client";
import { getRequiredSigners, buildTransaction } from "../src/transactionBuilder";
import { TaskType } from "../src/types";

const adminKp = Keypair.random();
const newAdminKp = Keypair.random();
const ownerKp = Keypair.random();
const keeperKp = Keypair.random();
const dummyContractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const networkPassphrase = Networks.TESTNET;

function createMockServer() {
  const server = {
    getAccount: async (publicKey: string) => {
      return new Account(publicKey, "100");
    },
    simulateTransaction: async (tx: any) => {
      return {
        id: "1",
        latestLedger: 100,
        transactionData: new SorobanDataBuilder().build().toXDR("base64"),
        minResourceFee: "100",
        results: [
          {
            auth: [],
            xdr: xdr.ScVal.scvVoid().toXDR("base64"),
          },
        ],
      };
    },
    sendTransaction: async (tx: any) => {
      return {
        status: "PENDING",
        hash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      };
    },
    getTransaction: async (hash: string) => {
      return {
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        returnValue: undefined,
      };
    },
  } as unknown as rpc.Server;

  return server;
}

test("getRequiredSigners extracts signers for all mutating methods", () => {
  // Dual-auth case
  const dualSigners = getRequiredSigners("transferAdmin", {
    admin: adminKp.publicKey(),
    newAdmin: newAdminKp.publicKey(),
  });
  assert.deepEqual(dualSigners, [adminKp.publicKey(), newAdminKp.publicKey()]);

  // Owner methods
  const regSigners = getRequiredSigners("registerTask", { owner: ownerKp.publicKey() });
  assert.deepEqual(regSigners, [ownerKp.publicKey()]);

  const batchSigners = getRequiredSigners("batchRegisterTasks", { owner: ownerKp.publicKey() });
  assert.deepEqual(batchSigners, [ownerKp.publicKey()]);

  const increaseSigners = getRequiredSigners("increaseReward", { owner: ownerKp.publicKey() });
  assert.deepEqual(increaseSigners, [ownerKp.publicKey()]);

  const extendSigners = getRequiredSigners("extendDeadline", { owner: ownerKp.publicKey() });
  assert.deepEqual(extendSigners, [ownerKp.publicKey()]);

  const cancelSigners = getRequiredSigners("cancelTask", { owner: ownerKp.publicKey() });
  assert.deepEqual(cancelSigners, [ownerKp.publicKey()]);

  // Keeper methods
  const claimSigners = getRequiredSigners("claimTask", { keeper: keeperKp.publicKey() });
  assert.deepEqual(claimSigners, [keeperKp.publicKey()]);

  const execSigners = getRequiredSigners("executeTask", { keeper: keeperKp.publicKey() });
  assert.deepEqual(execSigners, [keeperKp.publicKey()]);

  const withdrawSigners = getRequiredSigners("withdrawRewards", { keeper: keeperKp.publicKey() });
  assert.deepEqual(withdrawSigners, [keeperKp.publicKey()]);

  // Admin methods
  const pauseSigners = getRequiredSigners("pause", { admin: adminKp.publicKey() });
  assert.deepEqual(pauseSigners, [adminKp.publicKey()]);

  const unpauseSigners = getRequiredSigners("unpause", { admin: adminKp.publicKey() });
  assert.deepEqual(unpauseSigners, [adminKp.publicKey()]);

  const feeSigners = getRequiredSigners("setFeeBps", { admin: adminKp.publicKey() });
  assert.deepEqual(feeSigners, [adminKp.publicKey()]);

  const minRewardSigners = getRequiredSigners("setMinReward", { admin: adminKp.publicKey() });
  assert.deepEqual(minRewardSigners, [adminKp.publicKey()]);

  const upgradeSigners = getRequiredSigners("upgrade", { admin: adminKp.publicKey() });
  assert.deepEqual(upgradeSigners, [adminKp.publicKey()]);

  const sweepSigners = getRequiredSigners("sweepFees", { admin: adminKp.publicKey() });
  assert.deepEqual(sweepSigners, [adminKp.publicKey()]);

  const initSigners = getRequiredSigners("initialize", { admin: adminKp.publicKey() });
  assert.deepEqual(initSigners, [adminKp.publicKey()]);
});

test("buildTransaction constructs unsigned XDR for single and dual-auth operations", async () => {
  const mockServer = createMockServer();

  // Test single-auth registerTask
  const regBuilt = await buildTransaction(
    mockServer,
    dummyContractId,
    networkPassphrase,
    "registerTask",
    {
      owner: ownerKp.publicKey(),
      taskType: TaskType.Liquidation,
      calldata: Buffer.from("test-calldata"),
      reward: 10000000n,
      deadline: 1700000000n,
      ttlLedgers: 100,
      lockLedgers: 20,
    }
  );

  assert.ok(regBuilt.unsignedXdr.length > 0);
  assert.deepEqual(regBuilt.signers, [ownerKp.publicKey()]);

  // Test dual-auth transferAdmin
  const dualBuilt = await buildTransaction(
    mockServer,
    dummyContractId,
    networkPassphrase,
    "transferAdmin",
    {
      admin: adminKp.publicKey(),
      newAdmin: newAdminKp.publicKey(),
    }
  );

  assert.ok(dualBuilt.unsignedXdr.length > 0);
  assert.deepEqual(dualBuilt.signers, [adminKp.publicKey(), newAdminKp.publicKey()]);
});

test("simulates full unsigned-build, external-sign (wallet stand-in), submit round trip", async () => {
  const mockServer = createMockServer();
  const client = new KeeperRegistryClient({
    contractId: dummyContractId,
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase,
  });

  // Inject mock server
  (client as any).server = mockServer;

  // Step 1: Build unsigned transaction (as a browser dApp would)
  const { unsignedXdr, signers } = await client.buildTransaction("transferAdmin", {
    admin: adminKp.publicKey(),
    newAdmin: newAdminKp.publicKey(),
  });

  assert.deepEqual(signers, [adminKp.publicKey(), newAdminKp.publicKey()]);

  // Step 2: External signing flow (simulating two wallets signing the unsigned XDR)
  const tx = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase) as Transaction;
  tx.sign(adminKp);
  tx.sign(newAdminKp);

  const signedXdr = tx.toXDR();

  // Step 3: Submit signed transaction
  const result = await client.submitSignedTransaction(signedXdr);

  assert.equal(result.status, "SUCCESS");
  assert.ok(result.hash.length > 0);
});

test("KeeperRegistryClient validates inputs and client-side error checks", async () => {
  const client = new KeeperRegistryClient({
    contractId: dummyContractId,
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase,
  });

  // Invalid contract ID in constructor
  assert.throws(
    () =>
      new KeeperRegistryClient({
        contractId: "invalid-contract-id",
        rpcUrl: "https://soroban-testnet.stellar.org",
        networkPassphrase,
      }),
    /Invalid contract ID/
  );

  // Client-side negative reward check for registerTask
  await assert.rejects(
    async () => {
      await client.registerTask({
        owner: ownerKp.publicKey(),
        taskType: TaskType.Liquidation,
        calldata: Buffer.from(""),
        reward: -100n,
        deadline: 100n,
        ttlLedgers: 10,
        lockLedgers: 10,
      });
    },
    /Task reward must be greater than zero/
  );
});
