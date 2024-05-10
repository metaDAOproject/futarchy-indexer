import { AccountInfoIndexer } from "../account-info-indexer";
import { connection, provider, rpcReadClient } from "../../connection";
import {
  AccountInfo,
  Context,
  PublicKey,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import { schema, usingDb } from "@metadaoproject/indexer-db";
import { Err, Ok, Result, TaggedUnion } from "../../match";
import { BN } from "@coral-xyz/anchor";
import { PricesType, TakesRecord } from "@metadaoproject/indexer-db/lib/schema";
import { enrichTokenMetadata } from "@metadaoproject/futarchy-sdk";
import {
  AMM_PROGRAM_ID,
  AmmClient,
  PriceMath,
  SwapType,
} from "@metadaoproject/futarchy-ts";
import {
  TwapRecord,
  PricesRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import { InstructionIndexer } from "../instruction-indexer";
import { IDL } from "@openbook-dex/openbook-v2";
import { SolanaParser } from "@debridge-finance/solana-transaction-parser";

export enum AmmAccountIndexerError {
  GeneralError = "GeneralError",
}

const ammClient = new AmmClient(provider, AMM_PROGRAM_ID, []);

type IDL = typeof ammClient.program.idl;

// create handle new instruction function, which makes a call to store the transaction in the DB and
// then gets the instruction indexer implementation for the account...

const ammParser = new SolanaParser([
  {
    idl: ammClient.program.idl,
    programId: AMM_PROGRAM_ID,
  },
]);

export const AmmMarketInstructionsIndexer: InstructionIndexer<IDL> = {
  PROGRAM_ID: AMM_PROGRAM_ID.toString(),
  PROGRAM_IDL: ammClient.program.idl,
  PROGRAM_NAME: "amm",
  indexInstruction: async (
    transactionIndex: number,
    transactionResponse: VersionedTransactionResponse,
    instructionIndex: number,
    decodedInstruction: IDL["instructions"][number]
  ) => {
    try {
      return Ok({ acct: "" });
    } catch (e) {
      console.error(e);
      return Err({ type: AmmAccountIndexerError.GeneralError });
    }
  },
  async indexTransactionSig(transactionSignature: string): Promise<
    Result<
      {
        acct: string;
      },
      TaggedUnion
    >
  > {
    const ixs = await ammParser.parseTransaction(
      connection,
      transactionSignature
    );
    const ixTypes = ixs?.reduce(
      (prev, currIx) => {
        // Check for 'swap' instruction
        if (currIx.name === "swap") {
          prev.swap = true;
        }
        // Check for 'addLiquidity' instruction
        else if (currIx.name === "addLiquidity") {
          prev.addLiquidity = true;
        }
        // Check for 'removeLiquidity' instruction
        else if (currIx.name === "removeLiquidity") {
          prev.removeLiquidity = true;
        }

        return prev;
      },
      { swap: false, addLiquidity: false, removeLiquidity: false }
    );
    if (ixTypes?.swap) {
      const relatedIx = ixs?.find((i) => i.name === "swap");
      const marketAcct = relatedIx?.accounts.find((a) => a.name === "amm");
      if (!marketAcct) return Err({ type: "missing data" });
      if (!relatedIx?.args) return Err({ type: "missing data" });
      const args = relatedIx.args as {
        swapType: SwapType;
        inputAmont: BN;
        outputAmountMin: BN;
      };
      // index a swap here
      const swapTake: TakesRecord = {
        marketAcct: marketAcct.pubkey.toBase58(),
        baseAmount: BigInt(args.outputAmountMin.toNumber()),
        orderBlock: BigInt(0), // TODO add this from tx record
        orderTime: new Date(), // TODO use tx record for this as well
        orderTxSig: transactionSignature,
        quotePrice: BigInt(args.inputAmont.toNumber()),
        takerBaseFee: BigInt(0),
        takerQuoteFee: BigInt(0),
      };

      const takeInsertRes = await usingDb((db) =>
        db
          .insert(schema.takes)
          .values(swapTake)
          .onConflictDoNothing()
          .returning({ txSig: schema.takes.orderTxSig })
      );
      if (takeInsertRes.length > 0) {
        console.log(
          "successfully inserted swap take record",
          takeInsertRes[0].txSig
        );
      }
    }
    if (ixTypes?.addLiquidity) {
      // index a add liquid here
      console.log("holy crap");
    }
    if (ixTypes?.removeLiquidity) {
      // index a remove liquid here
      console.log("holy crap");
    }
    return Ok({ acct: "" });
  },
};
