import { connection, provider } from "../../connection";
import { VersionedTransactionResponse } from "@solana/web3.js";
import { schema, usingDb, eq } from "@metadaoproject/indexer-db";
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
  PriceMath,
  SwapType,
} from "@metadaoproject/futarchy";
import { InstructionIndexer } from "../instruction-indexer";
import { IDL as IDLValue } from "@openbook-dex/openbook-v2";
import { AmmInstructionIndexerError } from "../../types/errors";
import { ammClient, ammParser, IDL } from "../common";

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
        // determine side
        const side = args.args.swapType.buy ? OrderSide.BID : OrderSide.ASK;

        // get the base/quote amount (NOTE: this can be confusing given the directionality, but solved based on side)
        let baseAmount = args.args.outputAmountMin; // What you're trading INTO (output)
        let quoteAmount = args.args.inputAmount; // What you're trading FROM (input)

        // if we're selling we need to take the inverse
        if (side === OrderSide.ASK) {
          baseAmount = args.args.inputAmount; // Trading FROM
          quoteAmount = args.args.outputAmountMin; // Trading TO
        }

        // determine price
        // NOTE: This is estimated given the output is a min expected value
        // default is input / output (buying a token with USDC or whatever)
        const marketAcctRecord = await usingDb((db) =>
          db
            .select()
            .from(schema.markets)
            .where(eq(schema.markets.marketAcct, marketAcct.pubkey.toBase58()))
            .execute()
        );
        if (marketAcctRecord.length === 0) {
          return Err({ type: AmmInstructionIndexerError.MissingMarket });
        }
        const baseToken = await usingDb((db) =>
          db
            .select()
            .from(schema.tokens)
            .where(eq(schema.tokens.mintAcct, marketAcctRecord[0].baseMintAcct))
            .execute()
        );
        if (baseToken.length === 0) {
          return Err({ type: AmmInstructionIndexerError.MissingMarket });
        }
        const quoteToken = await usingDb((db) =>
          db
            .select()
            .from(schema.tokens)
            .where(
              eq(schema.tokens.mintAcct, marketAcctRecord[0].quoteMintAcct)
            )
            .limit(1)
            .execute()
        );
        if (baseToken.length === 0) {
          return Err({ type: AmmInstructionIndexerError.MissingMarket });
        }

        const ammPrice = quoteAmount
          .mul(new BN(10).pow(new BN(12)))
          .div(baseAmount);
        const price = PriceMath.getHumanPrice(
          ammPrice,
          baseToken[0].decimals,
          quoteToken[0].decimals
        );
        // TODO: Need to likely handle rounding.....
        // index a swap here
        const swapOrder: OrdersRecord = {
          marketAcct: marketAcct.pubkey.toBase58(),
          orderBlock: BigInt(transaction.slot),
          orderTime: transaction.blockTime,
          orderTxSig: transaction.txSig,
          quotePrice: price.toString(),
          actorAcct: userAcct.pubkey.toBase58(),
          // TODO: If and only if the transaction is SUCCESSFUL does this value equal this..
          filledBaseAmount: BigInt(baseAmount.toNumber()),
          isActive: false,
          side: side,
          // TODO: If transaction is failed then this is the output amount...
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

        // use the above price and understandings from the order to correctly
        // supply the values

        const swapTake: TakesRecord = {
          marketAcct: marketAcct.pubkey.toBase58(),
          // This will always be the DAO / proposal base token, so while it may be NICE to have a key
          // to use to reference on data aggregate, it's not directly necessary.
          baseAmount: BigInt(baseAmount.toNumber()), // NOTE: This is always the base token given we have a BASE / QUOTE relationship
          orderBlock: BigInt(transaction.slot),
          orderTime: transaction.blockTime,
          orderTxSig: transaction.txSig,
          quotePrice: price.toString(),
          // TODO: this is coded into the market, in the case of our AMM, it's 1%
          // this fee is based on the INPUT value (so if we're buying its USDC, selling its TOKEN)
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
