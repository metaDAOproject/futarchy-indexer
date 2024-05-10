import { Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { FutarchyRPCClient } from "@metadaoproject/futarchy-sdk";

export const RPC_ENDPOINT = process.env.RPC_ENDPOINT ?? "";
export const connection: Connection = new Connection(RPC_ENDPOINT, "confirmed");
// the indexer will only be reading, not writing
export const readonlyWallet: Wallet = undefined as unknown as Wallet;
export const provider = new AnchorProvider(connection, readonlyWallet, {
  commitment: "confirmed",
});

export const rpcReadClient = FutarchyRPCClient.make(provider, undefined);
