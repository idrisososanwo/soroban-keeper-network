import { rpc, xdr } from "@stellar/stellar-sdk";
import { BuiltTransaction, BuildTransactionOptions } from "./types";
/**
 * Normalizes camelCase method names to contract snake_case function names.
 */
export declare function normalizeMethodName(methodName: string): string;
/**
 * Determines which accounts must sign the transaction based on the contract method and parameters.
 */
export declare function getRequiredSigners(methodName: string, params: Record<string, any>): string[];
/**
 * Encodes method parameters into an ordered array of Soroban ScVal contract arguments.
 */
export declare function encodeMethodArgs(methodName: string, params: Record<string, any>): xdr.ScVal[];
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
export declare function buildTransaction(server: rpc.Server, contractId: string, networkPassphrase: string, methodName: string, params: Record<string, any>, options?: BuildTransactionOptions): Promise<BuiltTransaction>;
//# sourceMappingURL=transactionBuilder.d.ts.map