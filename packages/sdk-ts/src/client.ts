import {
  Contract,
  Keypair,
  rpc,
  TransactionBuilder,
  Transaction,
  BASE_FEE,
  scValToNative,
} from "@stellar/stellar-sdk";
import {
  KeeperRegistryClientConfig,
  BuildTransactionOptions,
  BuiltTransaction,
  TransactionResult,
  TransactionPreviewResult,
  Task,
  TaskType,
  TaskStatus,
  RegisterTaskParams,
  BatchRegisterTasksParams,
  IncreaseRewardParams,
  ExtendDeadlineParams,
  ClaimTaskParams,
  ExecuteTaskParams,
  CancelTaskParams,
  ExpireTaskParams,
  WithdrawRewardsParams,
  PauseParams,
  UnpauseParams,
  SetFeeBpsParams,
  SetMinRewardParams,
  TransferAdminParams,
  UpgradeParams,
  SweepFeesParams,
  InitializeParams,
} from "./types";
import { validateContractId, validateAddress, validateSecretKey, encodeScVal } from "./utils";
import { buildTransaction, previewTransaction, normalizeMethodName } from "./transactionBuilder";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class KeeperRegistryClient {
  public readonly contractId: string;
  public readonly rpcUrl: string;
  public readonly networkPassphrase: string;
  public readonly server: rpc.Server;
  private secretKey?: string;

  constructor(config: KeeperRegistryClientConfig) {
    validateContractId(config.contractId);
    if (!config.rpcUrl) {
      throw new Error("RPC URL must be provided.");
    }
    if (!config.networkPassphrase) {
      throw new Error("Network passphrase must be provided.");
    }
    if (config.secretKey) {
      validateSecretKey(config.secretKey);
      this.secretKey = config.secretKey;
    }

    this.contractId = config.contractId;
    this.rpcUrl = config.rpcUrl;
    this.networkPassphrase = config.networkPassphrase;
    this.server = new rpc.Server(config.rpcUrl, { allowHttp: false });
  }

  /**
   * Lower-level method: Builds an unsigned transaction XDR plus required signers metadata.
   *
   * Recommended for browser dApps integrating with wallet extensions (Freighter, Wallet-Kit).
   *
   * @param methodName Method name to invoke (e.g. "registerTask", "transferAdmin")
   * @param params Method parameters
   * @param options Building options (sourcePublicKey, fee, timeoutSeconds)
   */
  public async buildTransaction(
    methodName: string,
    params: Record<string, any>,
    options?: BuildTransactionOptions
  ): Promise<BuiltTransaction> {
    return buildTransaction(
      this.server,
      this.contractId,
      this.networkPassphrase,
      methodName,
      params,
      options
    );
  }

  /**
   * Lower-level method: Previews a transaction simulation before submission without requiring any signers or private keys.
   * Returns resource costs (minResourceFee, cpuInstructions, memoryBytes) and simulated return value (or decoded typed KeeperErrorCode).
   *
   * @param methodName Method name to preview (e.g. "registerTask", "claimTask")
   * @param params Method parameters
   * @param options Preview options (sourcePublicKey, fee, timeoutSeconds)
   */
  public async previewTransaction(
    methodName: string,
    params: Record<string, any>,
    options?: BuildTransactionOptions
  ): Promise<TransactionPreviewResult> {
    return previewTransaction(
      this.server,
      this.contractId,
      this.networkPassphrase,
      methodName,
      params,
      options
    );
  }

  /**
   * Lower-level method: Submits a signed transaction XDR base64 string to the Soroban RPC server
   * and polls until confirmation.
   *
   * @param signedXdr The signed transaction XDR base64 string
   */
  public async submitSignedTransaction(signedXdr: string): Promise<TransactionResult> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase) as Transaction;
    const sendResponse = await this.server.sendTransaction(tx);

    if (sendResponse.status === "ERROR") {
      throw new Error(`Transaction submission failed: ${JSON.stringify(sendResponse.errorResult)}`);
    }

    const hash = sendResponse.hash;
    let attempts = 0;
    let getResponse = await this.server.getTransaction(hash);

    while (
      getResponse.status === rpc.Api.GetTransactionStatus.NOT_FOUND &&
      attempts < 30
    ) {
      await sleep(1000);
      getResponse = await this.server.getTransaction(hash);
      attempts++;
    }

    if (getResponse.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return {
        hash,
        status: "SUCCESS",
        returnValue: getResponse.returnValue ? scValToNative(getResponse.returnValue) : undefined,
        rawResponse: getResponse,
      };
    } else {
      throw new Error(`Transaction failed on-chain with status: ${getResponse.status}`);
    }
  }

  /**
   * Helper to execute convenience server-side signing for mutating methods.
   */
  private async executeWithSecretKey(
    methodName: string,
    params: Record<string, any>,
    options?: BuildTransactionOptions & { additionalSecretKeys?: string[] }
  ): Promise<TransactionResult> {
    if (!this.secretKey && (!options?.additionalSecretKeys || options.additionalSecretKeys.length === 0)) {
      throw new Error(
        `Convenience method "${methodName}" requires a configured secretKey in KeeperRegistryClient or options. ` +
        `For wallet extension flows, use client.buildTransaction("${methodName}", params) -> wallet.sign() -> client.submitSignedTransaction(signedXdr).`
      );
    }

    const mainKeypair = this.secretKey ? Keypair.fromSecret(this.secretKey) : undefined;
    const sourcePublicKey = options?.sourcePublicKey || mainKeypair?.publicKey();

    const built = await this.buildTransaction(methodName, params, {
      ...options,
      sourcePublicKey,
    });

    const tx = TransactionBuilder.fromXDR(built.unsignedXdr, this.networkPassphrase) as Transaction;

    if (mainKeypair) {
      tx.sign(mainKeypair);
    }

    if (options?.additionalSecretKeys) {
      for (const secret of options.additionalSecretKeys) {
        tx.sign(Keypair.fromSecret(secret));
      }
    }

    return this.submitSignedTransaction(tx.toXDR());
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Mutating Convenience Wrappers
  // ─────────────────────────────────────────────────────────────────────────────

  public async registerTask(
    params: RegisterTaskParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    if (BigInt(params.reward) <= 0n) {
      throw new Error("Task reward must be greater than zero.");
    }
    return this.executeWithSecretKey("registerTask", params, options);
  }

  public async batchRegisterTasks(
    params: BatchRegisterTasksParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    if (params.tasks.length === 0) {
      throw new Error("Batch tasks list cannot be empty.");
    }
    return this.executeWithSecretKey("batchRegisterTasks", params, options);
  }

  public async increaseReward(
    params: IncreaseRewardParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    if (BigInt(params.additional) <= 0n) {
      throw new Error("Additional reward must be greater than zero.");
    }
    return this.executeWithSecretKey("increaseReward", params, options);
  }

  public async extendDeadline(
    params: ExtendDeadlineParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    return this.executeWithSecretKey("extendDeadline", params, options);
  }

  public async claimTask(
    params: ClaimTaskParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    return this.executeWithSecretKey("claimTask", params, options);
  }

  public async executeTask(
    params: ExecuteTaskParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    return this.executeWithSecretKey("executeTask", params, options);
  }

  public async cancelTask(
    params: CancelTaskParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    return this.executeWithSecretKey("cancelTask", params, options);
  }

  public async expireTask(
    params: ExpireTaskParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    return this.executeWithSecretKey("expireTask", params, options);
  }

  public async withdrawRewards(
    params: WithdrawRewardsParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    return this.executeWithSecretKey("withdrawRewards", params, options);
  }

  public async pause(
    params: PauseParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    return this.executeWithSecretKey("pause", params, options);
  }

  public async unpause(
    params: UnpauseParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    return this.executeWithSecretKey("unpause", params, options);
  }

  public async setFeeBps(
    params: SetFeeBpsParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    return this.executeWithSecretKey("setFeeBps", params, options);
  }

  public async setMinReward(
    params: SetMinRewardParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    return this.executeWithSecretKey("setMinReward", params, options);
  }

  /**
   * Dual-auth admin transfer: requires signatures from both `admin` and `newAdmin`.
   * Pass both secret keys in options.additionalSecretKeys for server-side keypair calls,
   * or use `buildTransaction("transferAdmin", { admin, newAdmin })` for wallet flows.
   */
  public async transferAdmin(
    params: TransferAdminParams,
    options?: BuildTransactionOptions & { newAdminSecretKey?: string }
  ): Promise<TransactionResult> {
    const additionalSecretKeys: string[] = [];
    if (options?.newAdminSecretKey) {
      additionalSecretKeys.push(options.newAdminSecretKey);
    }
    return this.executeWithSecretKey("transferAdmin", params, {
      ...options,
      additionalSecretKeys,
    });
  }

  public async upgrade(
    params: UpgradeParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    return this.executeWithSecretKey("upgrade", params, options);
  }

  public async sweepFees(
    params: SweepFeesParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    if (BigInt(params.amount) <= 0n) {
      throw new Error("Sweep fee amount must be greater than zero.");
    }
    return this.executeWithSecretKey("sweepFees", params, options);
  }

  public async initialize(
    params: InitializeParams,
    options?: BuildTransactionOptions
  ): Promise<TransactionResult> {
    return this.executeWithSecretKey("initialize", params, options);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Read-Only Views (Simulation-based)
  // ─────────────────────────────────────────────────────────────────────────────

  private async readContract(
    methodName: string,
    args: any[],
    sourcePublicKey?: string
  ): Promise<any> {
    const key = sourcePublicKey || (this.secretKey ? Keypair.fromSecret(this.secretKey).publicKey() : undefined);
    if (!key) {
      throw new Error(`sourcePublicKey is required for readContract("${methodName}") simulation when no secretKey is set.`);
    }

    const snakeMethod = normalizeMethodName(methodName);
    const account = await this.server.getAccount(key);
    const contract = new Contract(this.contractId);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(snakeMethod, ...args))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed for ${methodName}: ${sim.error}`);
    }
    return sim.result ? scValToNative(sim.result.retval) : null;
  }

  public async getTask(taskId: bigint | number | string, sourcePublicKey?: string): Promise<Task | null> {
    const raw = await this.readContract("get_task", [encodeScVal(taskId, "u64")], sourcePublicKey);
    if (!raw) return null;

    return {
      id: BigInt(raw.id),
      owner: raw.owner,
      taskType: Number(raw.task_type) as TaskType,
      calldata: Buffer.from(raw.calldata),
      reward: BigInt(raw.reward),
      deadline: BigInt(raw.deadline),
      ttlLedgers: Number(raw.ttl_ledgers),
      lockLedgers: Number(raw.lock_ledgers),
      verifier: raw.verifier || undefined,
      status: Number(raw.status) as TaskStatus,
      claimedBy: raw.claimed_by || undefined,
      claimDeadline: raw.claim_deadline ? BigInt(raw.claim_deadline) : undefined,
    };
  }

  public async taskCount(sourcePublicKey?: string): Promise<bigint> {
    const raw = await this.readContract("task_count", [], sourcePublicKey);
    return BigInt(raw || 0);
  }

  public async keeperBalance(keeper: string, sourcePublicKey?: string): Promise<bigint> {
    validateAddress(keeper, "keeper");
    const raw = await this.readContract("keeper_balance", [encodeScVal(keeper, "address")], sourcePublicKey);
    return BigInt(raw || 0);
  }

  public async feesAccrued(sourcePublicKey?: string): Promise<bigint> {
    const raw = await this.readContract("fees_accrued", [], sourcePublicKey);
    return BigInt(raw || 0);
  }

  public async isPaused(sourcePublicKey?: string): Promise<boolean> {
    const raw = await this.readContract("is_paused", [], sourcePublicKey);
    return Boolean(raw);
  }

  public async admin(sourcePublicKey?: string): Promise<string | null> {
    return await this.readContract("admin", [], sourcePublicKey);
  }

  public async getFeeBps(sourcePublicKey?: string): Promise<number> {
    const raw = await this.readContract("get_fee_bps", [], sourcePublicKey);
    return Number(raw || 0);
  }

  public async rewardTokenAddress(sourcePublicKey?: string): Promise<string | null> {
    return await this.readContract("reward_token_address", [], sourcePublicKey);
  }
}
