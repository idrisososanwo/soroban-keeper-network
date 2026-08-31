import {
  Contract,
  TransactionBuilder,
  rpc,
  BASE_FEE,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import { BuiltTransaction, BuildTransactionOptions } from "./types";
import { encodeScVal, validateContractId, validateAddress, toBuffer } from "./utils";

/**
 * Normalizes camelCase method names to contract snake_case function names.
 */
export function normalizeMethodName(methodName: string): string {
  const mapping: Record<string, string> = {
    registerTask: "register_task",
    batchRegisterTasks: "batch_register_tasks",
    increaseReward: "increase_reward",
    extendDeadline: "extend_deadline",
    claimTask: "claim_task",
    executeTask: "execute_task",
    cancelTask: "cancel_task",
    expireTask: "expire_task",
    withdrawRewards: "withdraw_rewards",
    pause: "pause",
    unpause: "unpause",
    setFeeBps: "set_fee_bps",
    setMinReward: "set_min_reward",
    transferAdmin: "transfer_admin",
    upgrade: "upgrade",
    sweepFees: "sweep_fees",
    initialize: "initialize",
  };
  return mapping[methodName] || methodName;
}

/**
 * Determines which accounts must sign the transaction based on the contract method and parameters.
 */
export function getRequiredSigners(methodName: string, params: Record<string, any>): string[] {
  const normalized = normalizeMethodName(methodName);
  const signers: string[] = [];

  switch (normalized) {
    case "transfer_admin":
      if (params.admin) signers.push(params.admin);
      if (params.newAdmin || params.new_admin) signers.push(params.newAdmin || params.new_admin);
      break;

    case "register_task":
    case "batch_register_tasks":
    case "increase_reward":
    case "extend_deadline":
    case "cancel_task":
      if (params.owner) signers.push(params.owner);
      break;

    case "claim_task":
    case "execute_task":
    case "withdraw_rewards":
      if (params.keeper) signers.push(params.keeper);
      break;

    case "pause":
    case "unpause":
    case "set_fee_bps":
    case "set_min_reward":
    case "upgrade":
    case "sweep_fees":
    case "initialize":
      if (params.admin) signers.push(params.admin);
      break;

    case "expire_task":
      if (params.sourcePublicKey) signers.push(params.sourcePublicKey);
      break;

    default:
      if (params.admin) signers.push(params.admin);
      else if (params.owner) signers.push(params.owner);
      else if (params.keeper) signers.push(params.keeper);
      break;
  }

  // Deduplicate and filter empty values
  return Array.from(new Set(signers.filter((s): s is string => typeof s === "string" && s.length > 0)));
}

/**
 * Encodes method parameters into an ordered array of Soroban ScVal contract arguments.
 */
export function encodeMethodArgs(methodName: string, params: Record<string, any>): xdr.ScVal[] {
  const normalized = normalizeMethodName(methodName);

  switch (normalized) {
    case "initialize":
      return [
        encodeScVal(params.admin, "address"),
        encodeScVal(params.rewardToken || params.reward_token, "address"),
        encodeScVal(params.feeBps ?? params.fee_bps, "u32"),
      ];

    case "register_task":
      return [
        encodeScVal(params.owner, "address"),
        encodeScVal(params.taskType ?? params.task_type, "u32"),
        encodeScVal(params.calldata, "bytes"),
        encodeScVal(params.reward, "i128"),
        encodeScVal(params.deadline, "u64"),
        encodeScVal(params.ttlLedgers ?? params.ttl_ledgers, "u32"),
        encodeScVal(params.lockLedgers ?? params.lock_ledgers, "u32"),
        encodeScVal(params.verifier, "opt_address"),
      ];

    case "batch_register_tasks": {
      const rawTasks = params.tasks || [];
      const encodedTasks = rawTasks.map((t: any) => {
        const mapEntries: xdr.ScMapEntry[] = [
          new xdr.ScMapEntry({
            key: nativeToScVal("calldata", { type: "symbol" }),
            val: encodeScVal(t.calldata, "bytes"),
          }),
          new xdr.ScMapEntry({
            key: nativeToScVal("deadline", { type: "symbol" }),
            val: encodeScVal(t.deadline, "u64"),
          }),
          new xdr.ScMapEntry({
            key: nativeToScVal("lock_ledgers", { type: "symbol" }),
            val: encodeScVal(t.lockLedgers ?? t.lock_ledgers, "u32"),
          }),
          new xdr.ScMapEntry({
            key: nativeToScVal("reward", { type: "symbol" }),
            val: encodeScVal(t.reward, "i128"),
          }),
          new xdr.ScMapEntry({
            key: nativeToScVal("task_type", { type: "symbol" }),
            val: encodeScVal(t.taskType ?? t.task_type, "u32"),
          }),
          new xdr.ScMapEntry({
            key: nativeToScVal("ttl_ledgers", { type: "symbol" }),
            val: encodeScVal(t.ttlLedgers ?? t.ttl_ledgers, "u32"),
          }),
          new xdr.ScMapEntry({
            key: nativeToScVal("verifier", { type: "symbol" }),
            val: encodeScVal(t.verifier, "opt_address"),
          }),
        ];
        return xdr.ScVal.scvMap(mapEntries);
      });

      return [
        encodeScVal(params.owner, "address"),
        xdr.ScVal.scvVec(encodedTasks),
        encodeScVal(params.maxTotalReward ?? params.max_total_reward, "i128"),
      ];
    }

    case "increase_reward":
      return [
        encodeScVal(params.owner, "address"),
        encodeScVal(params.taskId ?? params.task_id, "u64"),
        encodeScVal(params.additional, "i128"),
      ];

    case "extend_deadline":
      return [
        encodeScVal(params.owner, "address"),
        encodeScVal(params.taskId ?? params.task_id, "u64"),
        encodeScVal(params.additionalLedgers ?? params.additional_ledgers, "u64"),
      ];

    case "claim_task":
      return [
        encodeScVal(params.keeper, "address"),
        encodeScVal(params.taskId ?? params.task_id, "u64"),
      ];

    case "execute_task":
      return [
        encodeScVal(params.keeper, "address"),
        encodeScVal(params.taskId ?? params.task_id, "u64"),
        encodeScVal(params.proof, "bytes"),
      ];

    case "cancel_task":
      return [
        encodeScVal(params.owner, "address"),
        encodeScVal(params.taskId ?? params.task_id, "u64"),
      ];

    case "expire_task":
      return [encodeScVal(params.taskId ?? params.task_id, "u64")];

    case "withdraw_rewards":
      return [encodeScVal(params.keeper, "address")];

    case "pause":
    case "unpause":
      return [encodeScVal(params.admin, "address")];

    case "set_fee_bps":
      return [
        encodeScVal(params.admin, "address"),
        encodeScVal(params.newBps ?? params.new_bps, "u32"),
      ];

    case "set_min_reward":
      return [
        encodeScVal(params.admin, "address"),
        encodeScVal(params.minReward ?? params.min_reward, "i128"),
      ];

    case "transfer_admin":
      return [
        encodeScVal(params.admin, "address"),
        encodeScVal(params.newAdmin ?? params.new_admin, "address"),
      ];

    case "upgrade":
      return [
        encodeScVal(params.admin, "address"),
        encodeScVal(params.newWasmHash ?? params.new_wasm_hash, "bytes32"),
      ];

    case "sweep_fees":
      return [
        encodeScVal(params.admin, "address"),
        encodeScVal(params.treasury, "address"),
        encodeScVal(params.amount, "i128"),
      ];

    default:
      throw new Error(`Unsupported or unknown contract method: "${methodName}".`);
  }
}

/**
 * Builds an unsigned Soroban transaction for any mutating contract method.
 *
 * Runs simulation via SorobanRpc to populate footers and authorization entries,
 * then returns the unsigned XDR string along with the required signers metadata.
 *
 * @param server SorobanRpc Server instance
 * @param contractId Contract ID string
 * @param networkPassphrase Network passphrase
 * @param methodName Method name to invoke (e.g. "registerTask", "transferAdmin")
 * @param params Parameters required by the method
 * @param options Building options (sourcePublicKey, fee, timeoutSeconds)
 */
export async function buildTransaction(
  server: rpc.Server,
  contractId: string,
  networkPassphrase: string,
  methodName: string,
  params: Record<string, any>,
  options: BuildTransactionOptions = {}
): Promise<BuiltTransaction> {
  validateContractId(contractId);

  const signers = getRequiredSigners(methodName, params);
  const sourcePublicKey = options.sourcePublicKey || signers[0] || params.sourcePublicKey;

  if (!sourcePublicKey) {
    throw new Error(
      `No source account public key provided for buildTransaction("${methodName}"). Pass sourcePublicKey in options or specify account parameters.`
    );
  }
  validateAddress(sourcePublicKey, "sourcePublicKey");

  const snakeMethod = normalizeMethodName(methodName);
  const scArgs = encodeMethodArgs(methodName, params);

  const account = await server.getAccount(sourcePublicKey);
  const contract = new Contract(contractId);

  const fee = options.fee ? String(options.fee) : BASE_FEE;
  const timeoutSeconds = options.timeoutSeconds ?? 30;

  const rawTx = new TransactionBuilder(account, {
    fee,
    networkPassphrase,
  })
    .addOperation(contract.call(snakeMethod, ...scArgs))
    .setTimeout(timeoutSeconds)
    .build();

  const simResponse = await server.simulateTransaction(rawTx);
  if (rpc.Api.isSimulationError(simResponse)) {
    throw new Error(`Soroban simulation failed for ${methodName}: ${simResponse.error}`);
  }

  const assembledTx = rpc.assembleTransaction(rawTx, simResponse).build();

  return {
    unsignedXdr: assembledTx.toXDR(),
    signers,
  };
}
