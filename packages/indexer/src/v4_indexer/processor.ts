import { AddLiquidityEvent, AmmEvent, ConditionalVaultEvent, CreateAmmEvent, getVaultAddr, InitializeConditionalVaultEvent, InitializeQuestionEvent, SwapEvent, PriceMath, SplitTokensEvent, MergeTokensEvent, RemoveLiquidityEvent } from "@metadaoproject/futarchy/v0.4";
import { schema, usingDb, eq, and, desc, gt } from "@metadaoproject/indexer-db";
import { PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { PricesType, V04SwapType } from "@metadaoproject/indexer-db/lib/schema";
import * as token from "@solana/spl-token";

import { connection, conditionalVaultClient } from "./connection";

import { TelegramBotAPI } from "./adapters/telegram-bot";
import { Logger } from "./logger";

const logger = new Logger(new TelegramBotAPI({token: process.env.TELEGRAM_BOT_API_KEY ?? ''}));

type Market = {
  marketAcct: string;
  baseMint: string;
  quoteMint: string;
}

type DBConnection = any; // TODO: Fix typing..


export async function processAmmEvent(event: { name: string; data: AmmEvent }, signature: string, transactionResponse: VersionedTransactionResponse) {
  switch (event.name) {
    case "CreateAmmEvent":
      await handleCreateAmmEvent(event.data as CreateAmmEvent);
      break;
    case "AddLiquidityEvent":
      await handleAddLiquidityEvent(event.data as AddLiquidityEvent);
      break;
    case "RemoveLiquidityEvent":
      await handleRemoveLiquidityEvent(event.data as RemoveLiquidityEvent);
      break;
    case "SwapEvent":
      await handleSwapEvent(event.data as SwapEvent, signature, transactionResponse);
      break;
    default:
      console.log("Unknown event", event);
  }
}

async function handleCreateAmmEvent(event: CreateAmmEvent) {
  try {
    await usingDb(async (db: DBConnection) => {
      await insertTokenIfNotExists(db, event.lpMint);
      await insertTokenIfNotExists(db, event.baseMint);
      await insertTokenIfNotExists(db, event.quoteMint);
      await insertMarketIfNotExists(db, {
        marketAcct: event.common.amm.toBase58(),
        baseMint: event.baseMint.toString(),
        quoteMint: event.quoteMint.toString(),
      });

      await db.insert(schema.v0_4_amms).values({
        ammAddr: event.common.amm.toString(),
        lpMintAddr: event.lpMint.toString(),
        createdAtSlot: BigInt(event.common.slot.toString()),
        baseMintAddr: event.baseMint.toString(),
        quoteMintAddr: event.quoteMint.toString(),
        latestAmmSeqNumApplied: 0n,
        baseReserves: 0n,
        quoteReserves: 0n,
      }).onConflictDoNothing();
    });
  } catch (error) {
    logger.errorWithChatBotAlert([
      error instanceof Error
        ? `Error in handleCreateAmmEvent: ${error.message}`
        : "Unknown error in handleCreateAmmEvent"
    ]);
  }
}

async function handleAddLiquidityEvent(event: AddLiquidityEvent) {
  try {
    await usingDb(async (db: DBConnection) => {
      const amm = await db.select().from(schema.v0_4_amms).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString())).limit(1);

      if (amm.length === 0) {
        console.log("AMM not found", event.common.amm.toString());
        return;
      }

      if (amm[0].latestAmmSeqNumApplied >= BigInt(event.common.seqNum.toString())) {
        console.log("Already applied", event.common.seqNum.toString());
        return;
      }

      await insertPriceIfNotDuplicate(db, amm, event);

      await db.update(schema.v0_4_amms).set({
        baseReserves: BigInt(event.common.postBaseReserves.toString()),
        quoteReserves: BigInt(event.common.postQuoteReserves.toString()),
        latestAmmSeqNumApplied: BigInt(event.common.seqNum.toString()),
      }).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString()));

      console.log("Updated AMM", event.common.amm.toString());
    });
  } catch (error) {
    logger.errorWithChatBotAlert([
      error instanceof Error
        ? `Error in handleAddLiquidityEvent: ${error.message}`
        : "Unknown error in handleAddLiquidityEvent"
    ]);
  }
}

async function handleRemoveLiquidityEvent(event: RemoveLiquidityEvent) {
  try {
    await usingDb(async (db: DBConnection) => {
      const amm = await db.select().from(schema.v0_4_amms).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString())).limit(1);

      if (amm.length === 0) {
        console.log("AMM not found", event.common.amm.toString());
        return;
      }

      if (amm[0].latestAmmSeqNumApplied >= BigInt(event.common.seqNum.toString())) {
        console.log("Already applied", event.common.seqNum.toString());
        return;
      }

      await insertPriceIfNotDuplicate(db, amm, event);

      await db.update(schema.v0_4_amms).set({
        baseReserves: BigInt(event.common.postBaseReserves.toString()),
        quoteReserves: BigInt(event.common.postQuoteReserves.toString()),
        latestAmmSeqNumApplied: BigInt(event.common.seqNum.toString()),
      }).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString()));

      console.log("Updated AMM", event.common.amm.toString());
    });
  } catch (error) {
    logger.errorWithChatBotAlert([
      error instanceof Error
        ? `Error in handleRemoveLiquidityEvent: ${error.message}`
        : "Unknown error in handleRemoveLiquidityEvent"
    ]);
  }
}

async function handleSwapEvent(event: SwapEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    if (transactionResponse.blockTime === null || transactionResponse.blockTime === undefined) {
      return;
    };
    await usingDb(async (db: DBConnection) => {
      await db.insert(schema.v0_4_swaps).values({
        signature: signature,
        slot: BigInt(transactionResponse.slot),
        // @ts-ignore - fixed above in the if statement
        blockTime: new Date(transactionResponse.blockTime * 1000),
        swapType: event.swapType.buy ? V04SwapType.Buy : V04SwapType.Sell,
        ammAddr: event.common.amm.toString(),
        userAddr: event.common.user.toString(),
        inputAmount: event.inputAmount.toString(),
        outputAmount: event.outputAmount.toString(),
        ammSeqNum: BigInt(event.common.seqNum.toString())
      }).onConflictDoNothing();

      const amm = await db.select().from(schema.v0_4_amms).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString())).limit(1);

      if (amm.length === 0) {
        console.log("AMM not found", event.common.amm.toString());
        return;
      }

      if (amm[0].latestAmmSeqNumApplied >= BigInt(event.common.seqNum.toString())) {
        console.log("Already applied", event.common.seqNum.toString());
        return;
      }

      await insertPriceIfNotDuplicate(db, amm, event);

      await db.update(schema.v0_4_amms).set({
        baseReserves: BigInt(event.common.postBaseReserves.toString()),
        quoteReserves: BigInt(event.common.postQuoteReserves.toString()),
        latestAmmSeqNumApplied: BigInt(event.common.seqNum.toString()),
      }).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString()));
    });
  } catch (error) {
    logger.errorWithChatBotAlert([
      error instanceof Error
        ? `Error in handleSwapEvent: ${error.message}`
        : "Unknown error in handleSwapEvent"
    ]);
  }
}

async function handleSplitEvent(event: SplitTokensEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    await usingDb(async (db: DBConnection) => {
      await db.insert(schema.v0_4_splits).values({
        vaultAddr: event.vault.toString(),
        vaultSeqNum: BigInt(event.seqNum.toString()),
        signature: signature,
        slot: BigInt(transactionResponse.slot),
        amount: BigInt(event.amount.toString())
      }).onConflictDoNothing();
    });
  } catch (error) {
    logger.errorWithChatBotAlert([
      error instanceof Error
        ? `Error in handleSplitEvent: ${error.message}`
        : "Unknown error in handleSplitEvent"
    ]);
  }
}

async function handleMergeEvent(event: MergeTokensEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    await usingDb(async (db: DBConnection) => {
      await db.insert(schema.v0_4_merges).values({
        vaultAddr: event.vault.toString(),
        vaultSeqNum: BigInt(event.seqNum.toString()),
        signature: signature,
        slot: BigInt(transactionResponse.slot),
        amount: BigInt(event.amount.toString())
      }).onConflictDoNothing();
    });
  } catch (error) {
    logger.errorWithChatBotAlert([
      error instanceof Error
        ? `Error in handleMergeEvent: ${error.message}`
        : "Unknown error in handleMergeEvent"
    ]);
  }
}

async function insertTokenIfNotExists(db: DBConnection, mintAcct: PublicKey) {
  const existingToken = await db.select().from(schema.tokens).where(eq(schema.tokens.mintAcct, mintAcct.toString())).limit(1);
  if (existingToken.length === 0) {
    console.log("Inserting token", mintAcct.toString());
    const mint: token.Mint = await token.getMint(connection, mintAcct);
    await db.insert(schema.tokens).values({
      mintAcct: mintAcct.toString(),
      symbol: mintAcct.toString().slice(0, 3),
      name: mintAcct.toString().slice(0, 3),
      decimals: mint.decimals,
      supply: mint.supply,
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
}


export async function processVaultEvent(event: { name: string; data: ConditionalVaultEvent }, signature: string, transactionResponse: VersionedTransactionResponse) {
  switch (event.name) {
    case "InitializeQuestionEvent":
      await handleInitializeQuestionEvent(event.data as InitializeQuestionEvent);
      break;
    case "InitializeConditionalVaultEvent":
      await handleInitializeConditionalVaultEvent(event.data as InitializeConditionalVaultEvent);
      break;
    case "SplitTokensEvent":
      await handleSplitEvent(event.data as SplitTokensEvent, signature, transactionResponse);
      break;
    case "MergeTokensEvent":
      await handleMergeEvent(event.data as MergeTokensEvent, signature, transactionResponse);
      break;
    default:
      console.log("Unknown Vault event", event.name);
  }
}

async function handleInitializeQuestionEvent(event: InitializeQuestionEvent) {
  try {
      await usingDb(async (db) => {
      await db.insert(schema.v0_4_questions).values({
        questionAddr: event.question.toString(),
        isResolved: false,
        oracleAddr: event.oracle.toString(),
        numOutcomes: event.numOutcomes,
        payoutNumerators: Array(event.numOutcomes).fill(0),
        payoutDenominator: 0n,
        questionId: event.questionId,
      }).onConflictDoNothing();
    });
  } catch (error) {
    logger.errorWithChatBotAlert([
      error instanceof Error
        ? `Error in handleInitializeQuestionEvent: ${error.message}`
        : "Unknown error in handleInitializeQuestionEvent"
    ]);
  }
}

async function handleInitializeConditionalVaultEvent(event: InitializeConditionalVaultEvent) {
  try {
    const vaultAddr = getVaultAddr(conditionalVaultClient.vaultProgram.programId, event.question, event.underlyingTokenMint)[0];
    await usingDb(async (db) => {
      await db.transaction(async (trx) => {
        if (!await doesQuestionExist(trx, event)) {
          return;
        }
        await insertTokenIfNotExists(trx, event.underlyingTokenMint);
        await insertTokenAccountIfNotExists(trx, event);
        await insertConditionalVault(trx, event, vaultAddr);
      });
    });
  } catch (error) {
    logger.errorWithChatBotAlert([
      error instanceof Error
        ? `Error in handleInitializeConditionalVaultEvent: ${error.message}`
        : "Unknown error in handleInitializeConditionalVaultEvent"
    ]);
  }
}

async function doesQuestionExist(db: DBConnection, event: InitializeConditionalVaultEvent): Promise<boolean> {
  const existingQuestion = await db.select().from(schema.v0_4_questions).where(eq(schema.v0_4_questions.questionAddr, event.question.toString())).limit(1);
  return existingQuestion.length > 0;
  // if (existingQuestion.length === 0) {
  //   await trx.insert(schema.v0_4_questions).values({
  //     questionAddr: event.question.toString(),
  //     isResolved: false,
  //     oracleAddr: event.oracle.toString(),
  //     numOutcomes: event.numOutcomes,
  //     payoutNumerators: Array(event.numOutcomes).fill(0),
  //     payoutDenominator: 0n,
  //     questionId: event.questionId,
  //   });
  // }
}

async function insertTokenAccountIfNotExists(db: DBConnection, event: InitializeConditionalVaultEvent) {
  const existingTokenAcct = await db.select()
    .from(schema.tokenAccts)
    .where(eq(schema.tokenAccts.tokenAcct, event.vaultUnderlyingTokenAccount.toString()))
    .limit(1);
  
  if (existingTokenAcct.length === 0) {
    await db.insert(schema.tokenAccts).values({
      tokenAcct: event.vaultUnderlyingTokenAccount.toString(),
      mintAcct: event.underlyingTokenMint.toString(),
      ownerAcct: event.vaultUnderlyingTokenAccount.toString(),
      amount: 0n,
    });
  }
}

async function insertMarketIfNotExists(db: DBConnection, market: Market) {
  const existingMarket = await db.select()
    .from(schema.markets)
    .where(eq(schema.markets.marketAcct, market.marketAcct))
    .limit(1);
  
  if (existingMarket.length === 0) {
    await db.insert(schema.markets).values({
      marketAcct: market.marketAcct,
      baseMintAcct: market.baseMint,
      quoteMintAcct: market.quoteMint,
      marketType: 'amm',
      createTxSig: '',
      baseLotSize: 0n,
      quoteLotSize: 0n,
      quoteTickSize: 0n,
      baseMakerFee: 0,
      quoteMakerFee: 0,
      baseTakerFee: 0,
      quoteTakerFee: 0
    }).onConflictDoNothing();
  }
}

async function insertPriceIfNotDuplicate(db: DBConnection, amm: any[], event: AddLiquidityEvent | SwapEvent | RemoveLiquidityEvent) {
  const existingPrice = await db.select()
    .from(schema.prices)
    .where(and(
      eq(schema.prices.marketAcct, event.common.amm.toBase58()),
      eq(schema.prices.updatedSlot, BigInt(event.common.slot.toString()))
    ))
    .limit(1);

  if (existingPrice.length > 0) {
    console.log("Price already exists", event.common.amm.toBase58(), BigInt(event.common.slot.toString()));
    return;
  }

  const ammPrice = PriceMath.getAmmPriceFromReserves(event.common.postBaseReserves, event.common.postQuoteReserves);
  const baseToken = await db.select()
    .from(schema.tokens)
    .where(eq(schema.tokens.mintAcct, amm[0].baseMintAddr))
    .limit(1);
  const quoteToken = await db.select()
    .from(schema.tokens)
    .where(eq(schema.tokens.mintAcct, amm[0].quoteMintAddr))
    .limit(1);

  if (!baseToken.length || !quoteToken.length) {
    throw new Error(`Token not found: base=${!!baseToken.length}, quote=${!!quoteToken.length}`);
  }

  const humanPrice = PriceMath.getHumanPrice(ammPrice, baseToken[0].decimals, quoteToken[0].decimals);

  await db.insert(schema.prices).values({
    marketAcct: event.common.amm.toBase58(),
    baseAmount: BigInt(event.common.postBaseReserves.toString()),
    quoteAmount: BigInt(event.common.postQuoteReserves.toString()),
    price: humanPrice.toString(),
    updatedSlot: BigInt(event.common.slot.toString()),
    createdBy: 'amm-market-indexer',
    pricesType: PricesType.Conditional,
  }).onConflictDoNothing();
}

async function insertConditionalVault(db: DBConnection, event: InitializeConditionalVaultEvent, vaultAddr: PublicKey) {
  await db.insert(schema.v0_4_conditional_vaults).values({
    conditionalVaultAddr: vaultAddr.toString(),
    questionAddr: event.question.toString(),
    underlyingMintAcct: event.underlyingTokenMint.toString(),
    underlyingTokenAcct: event.vaultUnderlyingTokenAccount.toString(),
    pdaBump: event.pdaBump,
    latestVaultSeqNumApplied: 0n,
  }).onConflictDoNothing();
}


async function fetchTransactionResponses(eligibleSignatures: { signature: string }[]) {
  try {
    return await connection.getTransactions(
      eligibleSignatures.map(s => s.signature),
      { commitment: "confirmed", maxSupportedTransactionVersion: 1 }
    );
  } catch (error: unknown) {
    logger.errorWithChatBotAlert([
      error instanceof Error
        ? `Error fetching transaction responses: ${error.message}`
        : "Unknown error fetching transaction responses"
    ]);
    return [];
  }
}

//set latestProcessedSlot in db
async function setLatestProcessedSlot(slot: number) {
  try {
    await usingDb(async (db) => {
      await db.update(schema.indexers)
        .set({ latestSlotProcessed: BigInt(slot) })
        .where(eq(schema.indexers.name, "v0_4_amm_indexer"))
        .execute();
    });
  } catch (error: unknown) {
    logger.errorWithChatBotAlert([
      error instanceof Error
        ? `Error setting latest processed slot: ${error.message}`
        : "Unknown error setting latest processed slot"
    ]);
  }
}