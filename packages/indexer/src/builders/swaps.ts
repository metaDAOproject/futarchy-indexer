import { Context, Logs } from "@solana/web3.js";
import { Err, Ok, Result, TaggedUnion } from "../match";
import {
  AmmInstructionIndexerError,
  SwapPersistableError,
} from "../types/errors";
import { schema, usingDb, eq } from "@metadaoproject/indexer-db";
import {
  OrderSide,
  OrdersRecord,
  TakesRecord,
  TransactionRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import { PriceMath, SwapType } from "@metadaoproject/futarchy";
import { BN } from "@coral-xyz/anchor";
import { SolanaParser } from "@debridge-finance/solana-transaction-parser";
import { connection } from "../connection";

export class SwapPersistable {
  private ordersRecord: OrdersRecord;
  private takesRecord: TakesRecord;
  constructor(ordersRecord: OrdersRecord, takesRecord: TakesRecord) {
    this.ordersRecord = ordersRecord;
    this.takesRecord = takesRecord;
  }

  async persist() {
    const orderInsertRes = await usingDb((db) =>
      db
        .insert(schema.orders)
        .values(this.ordersRecord)
        .onConflictDoNothing()
        .returning({ txSig: schema.takes.orderTxSig })
    );
    if (orderInsertRes.length > 0) {
      console.log(
        "successfully inserted swap order record",
        orderInsertRes[0].txSig
      );
    } else {
      console.warn(
        "did not save swap order in persister.",
        this.ordersRecord.orderTxSig
      );
    }
    const takeInsertRes = await usingDb((db) =>
      db
        .insert(schema.takes)
        .values(this.takesRecord)
        .onConflictDoNothing()
        .returning({ txSig: schema.takes.orderTxSig })
    );
    if (takeInsertRes.length > 0) {
      console.log(
        "successfully inserted swap take record",
        takeInsertRes[0].txSig
      );
    } else {
      console.warn(
        "did not save swap take record in persister.",
        this.takesRecord.orderTxSig
      );
    }
  }
}

export class SwapBuilder {
  private ammParser: SolanaParser;
  constructor(ammParser: SolanaParser) {
    this.ammParser = ammParser;
  }
  async withSignatureAndCtx(
    signature: string,
    ctx: Context
  ): Promise<Result<SwapPersistable, TaggedUnion>> {
    try {
      const swapTime = new Date();

      // first check to see if swap is already persisted
      const swapOrder = await usingDb((db) =>
        db
          .select()
          .from(schema.orders)
          .where(eq(schema.markets.createTxSig, signature))
          .execute()
      );
      if (swapOrder) {
        return Err({ type: SwapPersistableError.AlreadyPersistedSwap });
      }

      const ixs = await this.ammParser.parseTransaction(connection, signature);
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
          orderBlock: BigInt(ctx.slot),
          orderTime: new Date(),
          orderTxSig: signature,
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

        const swapTake: TakesRecord = {
          marketAcct: marketAcct.pubkey.toBase58(),
          // This will always be the DAO / proposal base token, so while it may be NICE to have a key
          // to use to reference on data aggregate, it's not directly necessary.
          baseAmount: BigInt(baseAmount.toNumber()), // NOTE: This is always the base token given we have a BASE / QUOTE relationship
          orderBlock: BigInt(ctx.slot),
          orderTime: swapTime,
          orderTxSig: signature,
          quotePrice: price.toString(),
          // TODO: this is coded into the market, in the case of our AMM, it's 1%
          // this fee is based on the INPUT value (so if we're buying its USDC, selling its TOKEN)
          takerBaseFee: BigInt(0),
          takerQuoteFee: BigInt(0),
        };
        return Ok(new SwapPersistable(swapOrder, swapTake));
      }
      return Err({ type: SwapPersistableError.NonSwapTransaction });
    } catch (e) {
      return Err({ type: SwapPersistableError.GeneralError });
    }
  }
}
