import { Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { FutarchyRPCClient } from "@metadaoproject/futarchy-sdk";

const HELIUS_API_KEY =
  process.env.FUTARCHY_HELIUS_API_KEY_2 ?? process.env.FUTARCHY_HELIUS_API_KEY;
export const RPC_ENDPOINT = `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
export const connection: Connection = new Connection(RPC_ENDPOINT, "confirmed");
// the indexer will only be reading, not writing
const readonlyWallet: Wallet = undefined as unknown as Wallet;
export const provider = new AnchorProvider(connection, readonlyWallet, {
  commitment: "confirmed",
});

export const rpcReadClient = FutarchyRPCClient.make(provider, undefined);
