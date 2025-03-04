import { Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { ConditionalVaultClient as V4ConditionalVaultClient, AmmClient as V4AmmClient } from "@metadaoproject/futarchy/v0.4";
import { 
  ConditionalVaultClient as V3ConditionalVaultClient
} from "@metadaoproject/futarchy/v0.3";
import { FutarchyRPCClient, FutarchyIndexerClient } from "@metadaoproject/futarchy-sdk";

// Environment variables
export const RPC_ENDPOINT = process.env.RPC_ENDPOINT ?? "";
export const BACKUP_RPC_ENDPOINT = process.env.BACKUP_RPC_ENDPOINT ?? "";
export const INDEXER_URL = process.env.INDEXER_URL ?? "";
export const INDEXER_WSS_URL = process.env.INDEXER_WSS_URL ?? "";

if (!RPC_ENDPOINT) {
  throw new Error("RPC_ENDPOINT is not set");
}

// Core connection setup
export const connection: Connection = new Connection(RPC_ENDPOINT, "confirmed");
export const backupConnection: Connection = new Connection(BACKUP_RPC_ENDPOINT, "confirmed");
export const readonlyWallet: Wallet = undefined as unknown as Wallet;
export const provider = new AnchorProvider(connection, readonlyWallet, {
  commitment: "confirmed",
});

// V4 clients
export const v4AmmClient = V4AmmClient.createClient({ provider });
export const v4ConditionalVaultClient = V4ConditionalVaultClient.createClient({ provider });

// V3 clients
export const rpcReadClient = FutarchyRPCClient.make(provider, undefined);
export const indexerReadClient = FutarchyIndexerClient.make(
  rpcReadClient,
  INDEXER_URL,
  INDEXER_WSS_URL,
  ""
);
export const v3ConditionalVaultClient = V3ConditionalVaultClient.createClient({ provider });
