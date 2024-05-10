import { connection, provider } from "../../connection";
import { VersionedTransactionResponse } from "@solana/web3.js";
import { schema, usingDb } from "@metadaoproject/indexer-db";
import { Err, Ok, Result, TaggedUnion } from "../../match";
import { BN } from "@coral-xyz/anchor";
import {
  OrderSide,
  OrdersRecord,
  TakesRecord,
  TransactionRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import {
  AMM_PROGRAM_ID,
  AmmClient,
  SwapType,
} from "@metadaoproject/futarchy-ts";
import { InstructionIndexer } from "../instruction-indexer";
import { IDL } from "@openbook-dex/openbook-v2";
import { SolanaParser } from "@debridge-finance/solana-transaction-parser";

export enum AmmInstructionIndexerError {
  GeneralError = "GeneralError",
  MissingMarket = "MissingMarket",
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
      return Ok({ txSig: "" });
    } catch (e) {
      console.error(e);
      return Err({ type: AmmInstructionIndexerError.GeneralError });
    }
  },
  async indexTransactionSig(transaction: TransactionRecord): Promise<
    Result<
      {
        txSig: string;
      },
      TaggedUnion
    >
  > {
    try {
      const ixs = await ammParser.parseTransaction(
        connection,
        transaction.txSig
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
        const userAcct = relatedIx?.accounts.find((a) => a.name === "user");
        if (!userAcct) return Err({ type: "missing data" });
        if (!relatedIx?.args) return Err({ type: "missing data" });
        const args = relatedIx.args as {
          args: {
            swapType: SwapType;
            inputAmount: BN;
            outputAmountMin: BN;
          };
        };
        // index a swap here
        const swapOrder: OrdersRecord = {
          marketAcct: marketAcct.pubkey.toBase58(),
          orderBlock: BigInt(transaction.slot),
          orderTime: transaction.blockTime,
          orderTxSig: transaction.txSig,
          quotePrice: BigInt(args.args.inputAmount.toNumber()),
          actorAcct: userAcct.pubkey.toBase58(),
          filledBaseAmount: BigInt(args.args.outputAmountMin.toNumber()),
          isActive: false,
          side: OrderSide.BID,
          unfilledBaseAmount: BigInt(0),
          updatedAt: new Date(),
        };

        const orderInsertRes = await usingDb((db) =>
          db
            .insert(schema.orders)
            .values(swapOrder)
            .onConflictDoNothing()
            .returning({ txSig: schema.takes.orderTxSig })
        );
        if (orderInsertRes.length > 0) {
          console.log(
            "successfully inserted swap order record",
            orderInsertRes[0].txSig
          );
        }

        const swapTake: TakesRecord = {
          marketAcct: marketAcct.pubkey.toBase58(),
          baseAmount: BigInt(args.args.outputAmountMin.toNumber()),
          orderBlock: BigInt(transaction.slot),
          orderTime: transaction.blockTime,
          orderTxSig: transaction.txSig,
          quotePrice: BigInt(args.args.inputAmount.toNumber()),
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
        console.log("add liquidity holy crap");
      }
      if (ixTypes?.removeLiquidity) {
        // index a remove liquid here
        console.log("remove liquidity holy crap");
      }
      return Ok({ txSig: transaction.txSig });
    } catch (e) {
      console.error(e);
      return Err({ type: AmmInstructionIndexerError.GeneralError });
    }
  },
};
