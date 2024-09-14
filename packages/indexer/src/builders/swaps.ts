import { Context } from "@solana/web3.js";
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
import { BN } from "@coral-xyz/anchor";
import {
  Instruction,
  SERIALIZED_TRANSACTION_LOGIC_VERSION,
  Transaction,
  getTransaction,
  parseFormattedInstructionArgsData,
  serialize,
} from "../transaction/serializer";
import { logger } from "../logger";
import { getMainIxTypeFromTransaction } from "../transaction/watcher";
import { getHumanPrice } from "../usecases/math";

export class SwapPersistable {
  private ordersRecord: OrdersRecord;
  private takesRecord: TakesRecord;
  private transactionRecord: TransactionRecord;
  constructor(
    ordersRecord: OrdersRecord,
    takesRecord: TakesRecord,
    transactionRecord: TransactionRecord
  ) {
    this.ordersRecord = ordersRecord;
    this.takesRecord = takesRecord;
    this.transactionRecord = transactionRecord;
  }

  async persist() {
    try {
      const upsertResult = await usingDb((db) =>
        db
          .insert(schema.transactions)
          .values(this.transactionRecord)
          .onConflictDoUpdate({
            target: schema.transactions.txSig,
            set: this.transactionRecord,
          })
          .returning({ txSig: schema.transactions.txSig })
      );
      if (
        upsertResult.length !== 1 ||
        upsertResult[0].txSig !== this.transactionRecord.txSig
      ) {
        logger.warn(
          `Failed to upsert ${this.transactionRecord.txSig}. ${JSON.stringify(
            this.transactionRecord
          )}`
        );
      }
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
        logger.warn(
          `did not save swap order in persister.
        ${this.ordersRecord.orderTxSig}`
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
        logger.log(
          `successfully inserted swap take record.
        ${takeInsertRes[0].txSig}`
        );
      } else {
        logger.warn(
          `did not save swap take record in persister.
        ${this.takesRecord.orderTxSig}`
        );
      }
    } catch (e) {
      logger.errorWithChatBotAlert(`error with persisting swap: ${e}`);
    }
  }
}

export class SwapBuilder {
  constructor() {}
  async withSignatureAndCtx(
    signature: string,
    ctx: Context
  ): Promise<Result<SwapPersistable, TaggedUnion>> {
    try {
      // first check to see if swap is already persisted
      const swapOrder = await usingDb((db) =>
        db
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.orderTxSig, signature))
          .execute()
      );
      if (swapOrder.length > 0) {
        return Err({ type: SwapPersistableError.AlreadyPersistedSwap });
      }

      const txRes = await getTransaction(signature);
      if (!txRes.success) {
        return Err({
          type: SwapPersistableError.TransactionParseError,
          value: txRes.error,
        });
      }

      const tx = txRes.ok;
      const swapIx = tx.instructions.find((ix) => ix.name === "swap");
      if (!!swapIx) {
        // sometimes we mint cond tokens for the user right before we do the swap ix
        const mintIx = tx.instructions?.find(
          (i) => i.name === "mintConditionalTokens"
        );
        const result = await this.buildOrderFromSwapIx(swapIx, tx, mintIx);
        if (!result.success) {
          return Err(result.error);
        }
        const { swapOrder, swapTake } = result.ok;

        // TODO: consider co-locating this logic so it can be shared
        // TODO doing this twice... also doing this above

        const transactionRecord: TransactionRecord = {
          txSig: signature,
          slot: BigInt(ctx.slot),
          blockTime: new Date(tx.blockTime * 1000), // TODO need to verify if this is correct
          failed: tx.err !== undefined,
          payload: serialize(tx),
          serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
          mainIxType: getMainIxTypeFromTransaction(tx),
        };

        return Ok(new SwapPersistable(swapOrder, swapTake, transactionRecord));
      }
      return Err({ type: SwapPersistableError.NonSwapTransaction });
    } catch (e: any) {
      logger.errorWithChatBotAlert(
        "swap peristable general error",
        e.message
          ? {
              message: e.message,
              stack: e.stack,
              name: e.name,
              cause: e.cause,
              fileName: e.fileName,
              lineNumber: e.lineNumber,
            }
          : e
      );
      return Err({ type: SwapPersistableError.GeneralError });
    }
  }

  async buildOrderFromSwapIx(
    swapIx: Instruction,
    tx: Transaction,
    mintIx: Instruction | undefined
  ): Promise<
    Result<{ swapOrder: OrdersRecord; swapTake: TakesRecord }, TaggedUnion>
  > {
    if (!swapIx) return Err({ type: "missing data" });

    const marketAcct = swapIx.accountsWithData.find((a) => a.name === "amm");
    if (!marketAcct) return Err({ type: "missing data" });
    const userAcct = swapIx.accountsWithData.find((a) => a.name === "user");
    if (!userAcct) return Err({ type: "missing data" });
    // TODO fix
    const userBaseAcct = swapIx.accountsWithData.find(
      (a) => a.name === "userBaseAccount"
    );
    if (!userBaseAcct) return Err({ type: "missing data" });
    const userQuoteAcct = swapIx.accountsWithData.find(
      (a) => a.name === "userQuoteAccount"
    );
    if (!userQuoteAcct) return Err({ type: "missing data" });

    if (!swapIx.args) return Err({ type: "missing data" });
    const swapArgs = swapIx.args.find((a) => a.type === "SwapArgs");
    if (!swapArgs) return Err({ type: "missing swap args" });
    const swapArgsParsed = parseFormattedInstructionArgsData<{
      swapType: string;
      inputAmount: number;
      outputAmount: number;
    }>(swapArgs?.data ?? "");

    const mintAmount = mintIx
      ? mintIx.args.find((a) => a.name === "amount")?.data ?? "0"
      : "0";
    // determine side
    const side =
      swapArgsParsed?.swapType === "Buy" ? OrderSide.BID : OrderSide.ASK;

    // get balances
    const userBaseAcctWithBalances = tx.accounts.find(
      (a) => a.pubkey === userBaseAcct.pubkey
    );

    const userBasePreBalance =
      userBaseAcctWithBalances?.preTokenBalance?.amount ?? BigInt(0);

    const userBasePreBalanceWithPotentialMint =
      side === OrderSide.ASK
        ? userBasePreBalance + BigInt(Number(mintAmount))
        : userBaseAcctWithBalances?.preTokenBalance?.amount;

    const userBasePostBalance =
      userBaseAcctWithBalances?.postTokenBalance?.amount;

    const userQuoteAcctWithBalances = tx.accounts.find(
      (a) => a.pubkey === userQuoteAcct.pubkey
    );

    const userQuotePreBalance =
      userQuoteAcctWithBalances?.preTokenBalance?.amount ?? BigInt(0);

    const userQuotePreBalanceWithPotentialMint =
      side === OrderSide.BID
        ? userQuotePreBalance + BigInt(Number(mintAmount))
        : userQuoteAcctWithBalances?.preTokenBalance?.amount;

    const userQuotePostBalance =
      userQuoteAcctWithBalances?.postTokenBalance?.amount;

    const baseAmount = new BN(
      (userBasePostBalance ?? BigInt(0)) -
        (userBasePreBalanceWithPotentialMint ?? BigInt(0))
    ).abs();
    const quoteAmount = new BN(
      (userQuotePostBalance ?? BigInt(0)) -
        (userQuotePreBalanceWithPotentialMint ?? BigInt(0))
    ).abs();

    if (
      !!tx.err &&
      quoteAmount.toNumber() === 0 &&
      baseAmount.toNumber() === 0
    ) {
      return Err({ type: AmmInstructionIndexerError.FailedSwap });
    }

    // determine price
    // NOTE: This is estimated given the output is a min expected value
    // default is input / output (buying a token with USDC or whatever)
    const marketAcctRecord = await usingDb((db) =>
      db
        .select()
        .from(schema.markets)
        .where(eq(schema.markets.marketAcct, marketAcct.pubkey))
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
        .where(eq(schema.tokens.mintAcct, marketAcctRecord[0].quoteMintAcct))
        .limit(1)
        .execute()
    );
    if (baseToken.length === 0) {
      return Err({ type: AmmInstructionIndexerError.MissingMarket });
    }

    const ammPrice =
      quoteAmount.toNumber() && baseAmount.toNumber()
        ? quoteAmount.mul(new BN(10).pow(new BN(12))).div(baseAmount)
        : new BN(0);
    const price = getHumanPrice(
      ammPrice,
      baseToken[0].decimals,
      quoteToken[0].decimals
    );
    // TODO: Need to likely handle rounding.....
    // index a swap here

    const signature = tx.signatures[0];
    const now = new Date();

    const swapOrder: OrdersRecord = {
      marketAcct: marketAcct.pubkey,
      orderBlock: BigInt(tx.slot),
      orderTime: now,
      orderTxSig: signature,
      quotePrice: price.toString(),
      actorAcct: userAcct.pubkey,
      // TODO: If and only if the transaction is SUCCESSFUL does this value equal this..
      filledBaseAmount: BigInt(baseAmount.toNumber()),
      isActive: false,
      side: side,
      // TODO: If transaction is failed then this is the output amount...
      unfilledBaseAmount: BigInt(0),
      updatedAt: now,
    };

    const swapTake: TakesRecord = {
      marketAcct: marketAcct.pubkey,
      // This will always be the DAO / proposal base token, so while it may be NICE to have a key
      // to use to reference on data aggregate, it's not directly necessary.
      baseAmount: BigInt(baseAmount.toNumber()), // NOTE: This is always the base token given we have a BASE / QUOTE relationship
      orderBlock: BigInt(tx.slot),
      orderTime: now,
      orderTxSig: signature,
      quotePrice: price.toString(),
      // TODO: this is coded into the market, in the case of our AMM, it's 1%
      // this fee is based on the INPUT value (so if we're buying its USDC, selling its TOKEN)
      takerBaseFee: BigInt(0),
      takerQuoteFee: BigInt(0),
    };

    return Ok({ swapOrder, swapTake });
  }
}
