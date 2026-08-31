import React, { createContext, useContext, useMemo } from "react";
import { KeeperRegistryClient } from "../client";

export interface KeeperRegistryProviderProps {
  /**
   * Optional pre-constructed client instance. If provided, configuration props are ignored.
   */
  client?: KeeperRegistryClient;

  /**
   * Smart contract ID string (C...). Required if `client` is not provided.
   */
  contractId?: string;

  /**
   * Soroban RPC URL. Required if `client` is not provided.
   */
  rpcUrl?: string;

  /**
   * Stellar network passphrase. Required if `client` is not provided.
   */
  networkPassphrase?: string;

  /**
   * Optional secret key (S...) for server/testing environments.
   */
  secretKey?: string;

  /**
   * React children components.
   */
  children: React.ReactNode;
}

const KeeperRegistryContext = createContext<KeeperRegistryClient | null>(null);

/**
 * Context Provider that supplies a shared `KeeperRegistryClient` instance to children React components.
 */
export const KeeperRegistryProvider: React.FC<KeeperRegistryProviderProps> = ({
  client,
  contractId,
  rpcUrl,
  networkPassphrase,
  secretKey,
  children,
}) => {
  const clientInstance = useMemo(() => {
    if (client) {
      return client;
    }

    if (!contractId || !rpcUrl || !networkPassphrase) {
      throw new Error(
        "KeeperRegistryProvider requires either a `client` prop or all of (`contractId`, `rpcUrl`, `networkPassphrase`)."
      );
    }

    return new KeeperRegistryClient({
      contractId,
      rpcUrl,
      networkPassphrase,
      secretKey,
    });
  }, [client, contractId, rpcUrl, networkPassphrase, secretKey]);

  return (
    <KeeperRegistryContext.Provider value={clientInstance}>
      {children}
    </KeeperRegistryContext.Provider>
  );
};

/**
 * Custom hook to retrieve the shared `KeeperRegistryClient` instance from context.
 * Throws a clear, actionable error if called outside `<KeeperRegistryProvider>`.
 */
export function useKeeperRegistryClient(): KeeperRegistryClient {
  const client = useContext(KeeperRegistryContext);
  if (!client) {
    throw new Error(
      "useKeeperRegistryClient must be used within a <KeeperRegistryProvider>."
    );
  }
  return client;
}
