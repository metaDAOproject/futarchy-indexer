import { AMM_PROGRAM_ID, AmmClient, CONDITIONAL_VAULT_PROGRAM_ID, ConditionalVaultClient, getVaultAddr } from "@metadaoproject/futarchy/v0.4";
import { schema, usingDb, eq, desc } from "@metadaoproject/indexer-db";
import * as anchor from "@coral-xyz/anchor";
import { CompiledInnerInstruction, Connection, Keypair, TransactionResponse, VersionedTransactionResponse } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { V04SwapType } from "@metadaoproject/indexer-db/lib/schema";
import * as token from "@solana/spl-token";

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;

if (!RPC_ENDPOINT) {
  throw new Error("RPC_ENDPOINT is not set");
}

const connection = new Connection(RPC_ENDPOINT);

const ammClient = AmmClient.createClient({ provider: new AnchorProvider(connection, new Wallet(Keypair.generate()), {}) });
const conditionalVaultClient = ConditionalVaultClient.createClient({ provider: new AnchorProvider(connection, new Wallet(Keypair.generate()), {}) });

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

export const indexAmmEvents = async () => {
  const eligibleSignatures = await usingDb(async (db) => {
    const tx = await db.select()
      .from(schema.signatures)
      .where(eq(schema.signatures.queried_addr, AMM_PROGRAM_ID.toString()))
      .orderBy(desc(schema.signatures.slot))
      .limit(100)
    return tx;
  });

  const signature = eligibleSignatures[0].signature;

  console.log("signature", signature);

  const transactionResponses = await connection.getTransactions(eligibleSignatures.map(s => s.signature), { commitment: "confirmed", maxSupportedTransactionVersion: 1 });

  if (!transactionResponses || transactionResponses.length === 0) {
    console.log("No transaction response");
    return;
  }

  const events = transactionResponses.flatMap(r => r ? parseEvents(ammClient.program, r) : []);

  events.forEach(async event => {
    if (event.name === "CreateAmmEvent") {
      console.log(event.data);
      await usingDb(async (db) => {
        const existingToken = await db.select().from(schema.tokens).where(eq(schema.tokens.mintAcct, event.data.lpMint.toString())).limit(1);
        if (existingToken.length === 0) {
          console.log("inserting token", event.data.lpMint.toString());
          // const mint: token.Mint = await token.getMint(connection, event.data.lpMint);
          await db.insert(schema.tokens).values({
            mintAcct: event.data.lpMint.toString(),
            symbol: event.data.lpMint.toString().slice(0, 3),
            name: event.data.lpMint.toString().slice(0, 3),
            decimals: 9,
            supply: 0n,
            updatedAt: new Date(),
          }).onConflictDoNothing();
        }

        const existingBaseToken = await db.select().from(schema.tokens).where(eq(schema.tokens.mintAcct, event.data.baseMint.toString())).limit(1);
        if (existingBaseToken.length === 0) {
          console.log("inserting token", event.data.baseMint.toString());
          const mint: token.Mint = await token.getMint(connection, event.data.baseMint);
          await db.insert(schema.tokens).values({
            mintAcct: event.data.baseMint.toString(),
            symbol: event.data.baseMint.toString().slice(0, 3),
            name: event.data.baseMint.toString().slice(0, 3),
            decimals: mint.decimals,
            supply: mint.supply,
            updatedAt: new Date(),
          }).onConflictDoNothing();
        }

        const existingQuoteToken = await db.select().from(schema.tokens).where(eq(schema.tokens.mintAcct, event.data.quoteMint.toString())).limit(1);
        if (existingQuoteToken.length === 0) {
          console.log("inserting token", event.data.quoteMint.toString());
          const mint: token.Mint = await token.getMint(connection, event.data.quoteMint);
          await db.insert(schema.tokens).values({
            mintAcct: event.data.quoteMint.toString(),
            symbol: event.data.quoteMint.toString().slice(0, 3),
            name: event.data.quoteMint.toString().slice(0, 3),
            decimals: mint.decimals,
            supply: mint.supply,
            updatedAt: new Date(),
          }).onConflictDoNothing();
        }

        await db.insert(schema.v0_4_amms).values({
          amm_addr: event.data.common.amm.toString(),
          lp_mint_addr: event.data.lpMint.toString(),
          created_at_slot: BigInt(event.data.common.slot.toString()),
          base_mint_addr: event.data.baseMint.toString(),
          quote_mint_addr: event.data.quoteMint.toString(),
          base_reserves: 0n,
          quote_reserves: 0n,
        });
      });
    }
  });
}



export const indexVaultEvents = async () => {
  const eligibleSignatures = await usingDb(async (db) => {
    const tx = await db.select()
      .from(schema.signatures)
      .where(eq(schema.signatures.queried_addr, CONDITIONAL_VAULT_PROGRAM_ID.toString()))
      .orderBy(desc(schema.signatures.slot))
      .limit(100)
    return tx;
  });

  const signature = eligibleSignatures[0].signature;

  console.log("signature", signature);

  const transactionResponses = await connection.getTransactions(eligibleSignatures.map(s => s.signature), { commitment: "confirmed", maxSupportedTransactionVersion: 1 });

  if (!transactionResponses || transactionResponses.length === 0) {
    console.log("No transaction response");
    return;
  }

  const events = transactionResponses.flatMap(r => r ? parseEvents(conditionalVaultClient.vaultProgram, r) : []);

  events.forEach(async event => {
    if (event.name === "InitializeQuestionEvent") {
      await usingDb(async (db) => {
        await db.insert(schema.v0_4_questions).values({
          question_addr: event.data.question.toString(),
          is_resolved: false,
          oracle_addr: event.data.oracle.toString(),
          num_outcomes: event.data.numOutcomes,
          payout_numerators: Array(event.data.numOutcomes).fill(0),
          payout_denominator: 0n,
          question_id: event.data.questionId,
        }).onConflictDoNothing();
      });
    } else if (event.name === "InitializeConditionalVaultEvent") {
      const vaultAddr = getVaultAddr(conditionalVaultClient.vaultProgram.programId, event.data.question, event.data.underlyingTokenMint)[0];
      await usingDb(async (db) => {
        await db.transaction(async (trx) => {
          // Check and insert question if it doesn't exist
          const existingQuestion = await trx.select().from(schema.v0_4_questions).where(eq(schema.v0_4_questions.question_addr, event.data.question.toString())).limit(1);
          if (existingQuestion.length === 0) {
            await trx.insert(schema.v0_4_questions).values({
              question_addr: event.data.question.toString(),
              is_resolved: false,
              oracle_addr: event.data.oracle.toString(),
              num_outcomes: event.data.numOutcomes,
              payout_numerators: Array(event.data.numOutcomes).fill(0n),
              payout_denominator: 0n,
              question_id: event.data.questionId,
            });
          }

          // Check and insert underlying token if it doesn't exist
          const existingToken = await trx.select().from(schema.tokens).where(eq(schema.tokens.mintAcct, event.data.underlyingTokenMint.toString())).limit(1);
          if (existingToken.length === 0) {
            console.log("inserting token", event.data.underlyingTokenMint.toString());
            const mint: token.Mint = await token.getMint(connection, event.data.underlyingTokenMint);
            await trx.insert(schema.tokens).values({
              mintAcct: event.data.underlyingTokenMint.toString(),
              symbol: event.data.underlyingTokenMint.toString().slice(0, 3),
              name: event.data.underlyingTokenMint.toString().slice(0, 3),
              decimals: mint.decimals,
              supply: mint.supply,
              updatedAt: new Date(),
            });
          }

          // Check and insert token account if it doesn't exist
          const existingTokenAcct = await trx.select().from(schema.tokenAccts).where(eq(schema.tokenAccts.tokenAcct, event.data.vaultUnderlyingTokenAccount.toString())).limit(1);
          if (existingTokenAcct.length === 0) {
            await trx.insert(schema.tokenAccts).values({
              tokenAcct: event.data.vaultUnderlyingTokenAccount.toString(),
              mintAcct: event.data.underlyingTokenMint.toString(),
              ownerAcct: event.data.vaultUnderlyingTokenAccount.toString(),
              amount: 0n,
              // Add other required fields for token_accts table
            });
          }

          // Insert the conditional vault
          await trx.insert(schema.v0_4_conditional_vaults).values({
            conditional_vault_addr: vaultAddr.toString(),
            question_addr: event.data.question.toString(),
            underlying_mint_acct: event.data.underlyingTokenMint.toString(),
            underlying_token_acct: event.data.vaultUnderlyingTokenAccount.toString(),
            pda_bump: event.data.pdaBump,
          }).onConflictDoNothing();
        });
      });
    } else {
      console.log("unknown event", event);
    }
  });

  return;

  // const events = parseEvents(transactionResponse[]);
  console.log(events);

  const before = Date.now();
  const block = await connection.getBlock(transactionResponses[0].slot, { commitment: "confirmed", maxSupportedTransactionVersion: 1 });
  const after = Date.now();
  console.log(after - before);
  // console.log(block);
  // console.log(block?.transactions);

  return;

  // const swapEvents = events.filter(event => event.name === "SwapEvent");

  console.log(swapEvents);
  console.log(signature);

  const blockTimeUnix = transactionResponse.blockTime ?? await connection.getBlockTime(transactionResponse.slot);

  // await usingDb(async (db) => {
  //   console.log("inserting swaps");
  //   await db.insert(schema.v0_4_swaps).values(swapEvents.map(event => ({
  //     signature: signature,
  //     slot: BigInt(transactionResponse.slot),
  //     // block_time: new Date(transactionResponse.blockTime * 1000),
  //     // block_time: transactionResponse.blockTime ? new Date(transactionResponse.blockTime * 1000) : null,
  //     block_time: null,
  //     swap_type: V04SwapType.Buy,
  //     amm_addr: event.data.amm.toString(),
  //     user: event.data.user.toString(),
  //     input_amount: event.data.inputAmount.toNumber(),
  //     output_amount: event.data.outputAmount.toNumber(),
  //   })));
  // });



}