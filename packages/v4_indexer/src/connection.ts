import { Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { ConditionalVaultClient, AmmClient } from "@metadaoproject/futarchy/v0.4";

export const RPC_ENDPOINT = process.env.RPC_ENDPOINT ?? "";

if (!RPC_ENDPOINT) {
  throw new Error("RPC_ENDPOINT is not set");
}

export const connection: Connection = new Connection(RPC_ENDPOINT, "confirmed");
// the indexer will only be reading, not writing
export const readonlyWallet: Wallet = undefined as unknown as Wallet;
export const provider = new AnchorProvider(connection, readonlyWallet, {
  commitment: "confirmed",
});

export const ammClient = AmmClient.createClient({ provider });
export const conditionalVaultClient = ConditionalVaultClient.createClient({ provider });
