import test from "node:test";
import assert from "node:assert/strict";
import { KeeperErrorCode, decodeKeeperError } from "../src/errors";

test("decodeKeeperError decodes contract error strings accurately", () => {
  assert.equal(decodeKeeperError("HostError: Error(Contract, #4)"), KeeperErrorCode.TaskNotFound);
  assert.equal(decodeKeeperError("Error(Contract, #1)"), KeeperErrorCode.AlreadyInitialized);
  assert.equal(decodeKeeperError("ContractError(23)"), KeeperErrorCode.BatchRewardCeilingExceeded);
  assert.equal(decodeKeeperError("Error(Contract, #0x17)"), KeeperErrorCode.BatchRewardCeilingExceeded);

  // Object error structure
  assert.equal(decodeKeeperError({ error: "Error(Contract, #15)" }), KeeperErrorCode.NotInitialized);
  assert.equal(decodeKeeperError(new Error("HostError: Error(Contract, #3)")), KeeperErrorCode.ContractPaused);
});

test("decodeKeeperError returns undefined for non-contract errors", () => {
  assert.equal(decodeKeeperError("Network timeout"), undefined);
  assert.equal(decodeKeeperError("Transaction expired"), undefined);
  assert.equal(decodeKeeperError(new Error("RPC node unreachable")), undefined);
  assert.equal(decodeKeeperError(null), undefined);
  assert.equal(decodeKeeperError(undefined), undefined);
  assert.equal(decodeKeeperError("Error(Contract, #999)"), undefined); // Out of bounds
});
