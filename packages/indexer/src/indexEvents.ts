import { AMM_PROGRAM_ID, AmmClient, CONDITIONAL_VAULT_PROGRAM_ID, ConditionalVaultClient } from "@metadaoproject/futarchy/v0.4";
import { schema, usingDb, eq, desc } from "@metadaoproject/indexer-db";
import * as anchor from "@coral-xyz/anchor";
import { CompiledInnerInstruction, Connection, Keypair, TransactionResponse, VersionedTransactionResponse } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { V04SwapType } from "@metadaoproject/indexer-db/lib/schema";

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
  console.log("indexAmmEvents2");
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

  events.forEach(event => {
    if (event.name === "InitializeQuestionEvent") {
      console.log(event.data);
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