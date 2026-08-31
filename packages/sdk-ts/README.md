# @soroban-keeper-network/sdk

TypeScript SDK for interacting with the Soroban Keeper Network smart contracts.

## Overview

The SDK supports two primary operation modes:

1. **Browser / Wallet Extension Mode (Recommended for dApps)**:
   Build an unsigned transaction envelope XDR and pass it to a wallet extension (such as Freighter or Stellar Wallet Kit) for signing. The SDK never handles or stores private keys.

2. **Server-Side / Keeper Bot Mode**:
   Use a secret key directly for off-chain automated keeper bots to build, sign, and submit transactions in a single convenience call.

---

## Recommended Browser / Wallet Signing Pattern

```ts
import { KeeperRegistryClient, TaskType } from "@soroban-keeper-network/sdk";

const client = new KeeperRegistryClient({
  contractId: "C123...",
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; July 2015",
});

// Step 1: Build unsigned transaction XDR + metadata (which accounts need to sign)
const { unsignedXdr, signers } = await client.buildTransaction("registerTask", {
  owner: userPublicKey,
  taskType: TaskType.Liquidation,
  calldata: Buffer.from("..."),
  reward: 10_000_000n, // 1 XLM in stroops
  deadline: 1700000000n,
  ttlLedgers: 100,
  lockLedgers: 20,
}, {
  sourcePublicKey: userPublicKey,
});

console.log("Required signers:", signers); // ["G..."]

// Step 2: Pass unsigned XDR to wallet extension (e.g. Freighter)
const signedXdr = await window.freighter.signTransaction(unsignedXdr, {
  networkPassphrase: client.networkPassphrase,
});

// Step 3: Submit signed transaction
const result = await client.submitSignedTransaction(signedXdr);
console.log("Transaction confirmed:", result.hash);
```

---

## Dual-Auth Signing Pattern (e.g. `transferAdmin`)

Some operations require multiple signers. For example, `transferAdmin` requires signatures from both the current admin and the incoming new admin.

```ts
const { unsignedXdr, signers } = await client.buildTransaction("transferAdmin", {
  admin: currentAdminPublicKey,
  newAdmin: newAdminPublicKey,
});

console.log("Signers required:", signers);
// Returns: [currentAdminPublicKey, newAdminPublicKey]

// Both signers sign the unsignedXdr sequentially or via wallet prompts before calling:
// client.submitSignedTransaction(fullySignedXdr);
```

---

## Server-Side Keeper Bot Mode

For trusted server environments or automated keeper bots:

```ts
const keeperClient = new KeeperRegistryClient({
  contractId: "C123...",
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; July 2015",
  secretKey: "S...",
});

// Convenience wrapper builds, signs with secretKey, and submits
const result = await keeperClient.claimTask({
  keeper: keeperPublicKey,
  taskId: 1n,
});
```
