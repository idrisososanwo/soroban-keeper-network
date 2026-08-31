/**
 * Soroban Keeper Network — Typed Error Decoding
 */

/**
 * TypeScript enum mirroring the contract's KeeperError discriminants in `contracts/keeper-registry/src/errors.rs`.
 */
export enum KeeperErrorCode {
  AlreadyInitialized = 1,
  Unauthorized = 2,
  ContractPaused = 3,
  TaskNotFound = 4,
  InvalidTaskStatus = 5,
  DeadlinePassed = 6,
  DeadlineNotPassed = 7,
  InvalidReward = 8,
  LockPeriodActive = 9,
  InvalidFeeBps = 10,
  NotTaskOwner = 11,
  NotTaskClaimer = 12,
  NoRewardsAvailable = 13,
  ProofTooLarge = 14,
  NotInitialized = 15,
  TtlTooShort = 16,
  CalldataTooLarge = 17,
  InvalidTaskParams = 18,
  ArithmeticOverflow = 19,
  IncompatibleVerifierInterface = 20,
  BatchTooLarge = 21,
  EmptyBatch = 22,
  BatchRewardCeilingExceeded = 23,
}

/**
 * Decodes a simulation error message or response into a typed `KeeperErrorCode`.
 * Returns `undefined` if the error was a host-level or network-level error rather than a contract `KeeperError`.
 *
 * @param error The raw error string, Error object, or simulation error response
 */
export function decodeKeeperError(error: any): KeeperErrorCode | undefined {
  if (!error) return undefined;

  let errorStr = "";
  if (typeof error === "string") {
    errorStr = error;
  } else if (typeof error === "object") {
    errorStr = error.message || error.error || error.errorResult || JSON.stringify(error);
  }

  if (typeof errorStr !== "string") return undefined;

  // Matches patterns such as "Error(Contract, #4)", "ContractError(4)", "Error(Contract, #0x04)", "HostError: Error(Contract, #4)"
  const match =
    errorStr.match(/Error\(Contract,\s*#?(\d+)\)/i) ||
    errorStr.match(/ContractError\((\d+)\)/i) ||
    errorStr.match(/Error\(Contract,\s*#0x([0-9a-f]+)\)/i);

  if (match) {
    const rawCode = match[1];
    const code = match[0].toLowerCase().includes("#0x") || rawCode.startsWith("0x")
      ? parseInt(rawCode, 16)
      : parseInt(rawCode, 10);

    if (code in KeeperErrorCode && typeof (KeeperErrorCode as any)[code] === "string") {
      return code as KeeperErrorCode;
    }
  }

  return undefined;
}
