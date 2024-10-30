import { Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  FutarchyRPCClient,
  FutarchyIndexerClient,
} from "@metadaoproject/futarchy-sdk";
import { ConditionalVaultClient } from "@metadaoproject/futarchy/v0.3";

export const RPC_ENDPOINT = process.env.RPC_ENDPOINT ?? "";
export const INDEXER_URL = process.env.INDEXER_URL ?? "";
export const INDEXER_WSS_URL = process.env.INDEXER_WSS_URL ?? "";
export const connection: Connection = new Connection(RPC_ENDPOINT, "confirmed");
// the indexer will only be reading, not writing
export const readonlyWallet: Wallet = undefined as unknown as Wallet;
export const provider = new AnchorProvider(connection, readonlyWallet, {
  commitment: "confirmed",
});

export const rpcReadClient = FutarchyRPCClient.make(provider, undefined);

export const indexerReadClient = FutarchyIndexerClient.make(
  rpcReadClient,
  INDEXER_URL,
  INDEXER_WSS_URL,
  ""
);

export const conditionalVaultClient = ConditionalVaultClient.createClient({
  provider,
});
