import { AddLiquidityEvent, AMM_PROGRAM_ID, AmmEvent, CONDITIONAL_VAULT_PROGRAM_ID, ConditionalVaultEvent, CreateAmmEvent, getVaultAddr, InitializeConditionalVaultEvent, InitializeQuestionEvent, SwapEvent, PriceMath } from "@metadaoproject/futarchy/v0.4";
import { schema, usingDb, eq, desc } from "@metadaoproject/indexer-db";
import * as anchor from "@coral-xyz/anchor";
import { CompiledInnerInstruction, PublicKey, TransactionResponse, VersionedTransactionResponse } from "@solana/web3.js";
import { PricesType, V04SwapType } from "@metadaoproject/indexer-db/lib/schema";
import * as token from "@solana/spl-token";

import { connection, ammClient, conditionalVaultClient } from "./connection";
import { Program } from "@coral-xyz/anchor";

type Market = {
  marketAcct: string;
  baseMint: string;
  quoteMint: string;
}

type DBConnection = any; // TODO: Fix typing..

const parseEvents = <T extends anchor.Idl>(program: Program<T>, transactionResponse: VersionedTransactionResponse | TransactionResponse): { name: string; data: any }[] => {
  const events: { name: string; data: any }[] = [];
  const inner: CompiledInnerInstruction[] =
    transactionResponse?.meta?.innerInstructions ?? [];
  const idlProgramId = program.programId;
  for (let i = 0; i < inner.length; i++) {
    for (let j = 0; j < inner[i].instructions.length; j++) {
      const ix = inner[i].instructions[j];
      const programPubkey =
        transactionResponse?.transaction.message.staticAccountKeys[
        ix.programIdIndex
        ];
      if (
        programPubkey === undefined ||
        !programPubkey.equals(idlProgramId)
      ) {
        // we are at instructions that does not match the linked program
        continue;
      }

      const ixData = anchor.utils.bytes.bs58.decode(
        ix.data
      );
      const eventData = anchor.utils.bytes.base64.encode(ixData.slice(8));
      const event = program.coder.events.decode(eventData);
      // console.log(event)
      if (event) {
        events.push(event);
      }
    }
  }

  return events;
}

async function fetchEligibleSignatures(programId: string, limit: number) {
  return usingDb(async (db) => {
    return db.select()
      .from(schema.signatures)
      .where(eq(schema.signatures.queriedAddr, programId))
      .orderBy(desc(schema.signatures.slot))
      .limit(limit);
  });
}

async function fetchTransactionResponses(eligibleSignatures: { signature: string }[]) {
  return connection.getTransactions(
    eligibleSignatures.map(s => s.signature),
    { commitment: "confirmed", maxSupportedTransactionVersion: 1 }
  );
}

export async function indexAmmEvents() {
  const eligibleSignatures = await fetchEligibleSignatures(AMM_PROGRAM_ID.toString(), 100);

  if (eligibleSignatures.length === 0) {
    console.log("No signatures for AMM events");
    return;
  }

  const transactionResponses = await fetchTransactionResponses(eligibleSignatures);

  for (const [index, transactionResponse] of transactionResponses.entries()) {
    if (!transactionResponse) {
      console.log("No transaction response");
      continue;
    }

    const signature = eligibleSignatures[index].signature;
    const events = parseEvents(ammClient.program, transactionResponse as VersionedTransactionResponse);

    for (const event of events) {
      try {
        await processAmmEvent(event, signature, transactionResponse);
      } catch (error) {
        console.error(`Error processing AMM event: ${error}`);
      }
    }
  }
}

async function processAmmEvent(event: { name: string; data: AmmEvent }, signature: string, transactionResponse: VersionedTransactionResponse) {
  switch (event.name) {
    case "CreateAmmEvent":
      await handleCreateAmmEvent(event.data as CreateAmmEvent);
      break;
    case "AddLiquidityEvent":
      await handleAddLiquidityEvent(event.data as AddLiquidityEvent);
      break;
    case "SwapEvent":
      await handleSwapEvent(event.data as SwapEvent, signature, transactionResponse);
      break;
    default:
      console.log("Unknown event", event);
  }
}
async function handleCreateAmmEvent(event: CreateAmmEvent) {
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
}

async function handleAddLiquidityEvent(event: AddLiquidityEvent) {
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

    await insertPrice(db, amm, event);

    await db.update(schema.v0_4_amms).set({
      baseReserves: BigInt(event.common.postBaseReserves.toString()),
      quoteReserves: BigInt(event.common.postQuoteReserves.toString()),
      latestAmmSeqNumApplied: BigInt(event.common.seqNum.toString()),
    }).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString()));

    console.log("Updated AMM", event.common.amm.toString());
  });
}

async function handleSwapEvent(event: SwapEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  if (transactionResponse.blockTime === null || transactionResponse.blockTime === undefined) {
    console.error('Block time is undefined', transactionResponse)
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

    await insertPrice(db, amm, event);

    await db.update(schema.v0_4_amms).set({
      baseReserves: BigInt(event.common.postBaseReserves.toString()),
      quoteReserves: BigInt(event.common.postQuoteReserves.toString()),
      latestAmmSeqNumApplied: BigInt(event.common.seqNum.toString()),
    }).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString()));
  });
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

export async function indexVaultEvents() {
  const eligibleSignatures = await fetchEligibleSignatures(CONDITIONAL_VAULT_PROGRAM_ID.toString(), 100);

  if (eligibleSignatures.length === 0) {
    console.log("No signatures for Vault events");
    return;
  }

  const transactionResponses = await fetchTransactionResponses(eligibleSignatures);

  const events = transactionResponses.flatMap(r => r ? parseEvents(conditionalVaultClient.vaultProgram, r) : []);

  for (const event of events) {
    try {
      await processVaultEvent(event);
    } catch (error) {
      console.error(`Error processing Vault event: ${error}`);
    }
  }
}

async function processVaultEvent(event: { name: string; data: ConditionalVaultEvent }) {
  switch (event.name) {
    case "InitializeQuestionEvent":
      await handleInitializeQuestionEvent(event.data as InitializeQuestionEvent);
      break;
    case "InitializeConditionalVaultEvent":
      await handleInitializeConditionalVaultEvent(event.data as InitializeConditionalVaultEvent);
      break;
    default:
      console.log("Unknown Vault event", event);
  }
}

async function handleInitializeQuestionEvent(event: InitializeQuestionEvent) {
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
}

async function handleInitializeConditionalVaultEvent(event: InitializeConditionalVaultEvent) {
  const vaultAddr = getVaultAddr(conditionalVaultClient.vaultProgram.programId, event.question, event.underlyingTokenMint)[0];
  await usingDb(async (db) => {
    await db.transaction(async (trx) => {
      // await doesQuestionExist(trx, event);
      if (!await doesQuestionExist(trx, event)) {
        return;
      }
      await insertTokenIfNotExists(trx, event.underlyingTokenMint);
      await insertTokenAccountIfNotExists(trx, event);
      await insertConditionalVault(trx, event, vaultAddr);
    });
  });
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
  const existingTokenAcct = await db.select().from(schema.tokenAccts).where(eq(schema.tokenAccts.tokenAcct, event.vaultUnderlyingTokenAccount.toString())).limit(1);
  if (existingTokenAcct.length === 0) {
    await db.insert(schema.tokenAccts).values({
      tokenAcct: event.vaultUnderlyingTokenAccount.toString(),
      mintAcct: event.underlyingTokenMint.toString(),
      ownerAcct: event.vaultUnderlyingTokenAccount.toString(),
      amount: 0n,
      // Add other required fields for token_accts table
    });
  }
}

async function insertMarketIfNotExists(db: DBConnection, market: Market) {
  const existingMarket = await db.select().from(schema.markets).where(eq(schema.markets.marketAcct, market.marketAcct)).limit(1);
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
    // TODO: I don't like this on Conflict....
  }
}

async function insertPrice(db: DBConnection, amm: any[], event: AddLiquidityEvent | SwapEvent) {
  // Get's the AMM details for the current price from liquidity event or swap event
  const ammPrice = PriceMath.getAmmPriceFromReserves(event.common.postBaseReserves, event.common.postQuoteReserves);
  const baseToken = await db.select().from(schema.tokens).where(eq(schema.tokens.mintAcct, amm[0].baseMintAddr)).limit(1);
  const quoteToken = await db.select().from(schema.tokens).where(eq(schema.tokens.mintAcct, amm[0].quoteMintAddr)).limit(1);
  const humanPrice = PriceMath.getHumanPrice(ammPrice, baseToken[0].decimals, quoteToken[0].decimals);

  // Inserts the price into the prices table
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