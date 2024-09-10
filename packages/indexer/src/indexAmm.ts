import { Amm, AMM_PROGRAM_ID } from "@metadaoproject/futarchy/v0.4";
import { usingDb, schema, eq, asc, desc } from "@metadaoproject/indexer-db";
import { SolanaParser, ParsedInstruction } from "@debridge-finance/solana-transaction-parser";
import { AmmIDL, AmmClient } from "@metadaoproject/futarchy/v0.4";
import { CompiledInnerInstruction, Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;

if (!RPC_ENDPOINT) {
  throw new Error("RPC_ENDPOINT is not set");
}

const connection = new Connection(RPC_ENDPOINT);

const txParser = new SolanaParser([{ idl: AmmIDL, programId: AMM_PROGRAM_ID }]);

  const ammClient = AmmClient.createClient({ provider: new AnchorProvider(connection, new Wallet(Keypair.generate()), {}) });

export const indexAmms = async () => {
  const signature = "QKiGuARe4hsK4k6CrnGMvYfMPgxQsPbYY5QKVBXSrJt2Pd7QTEcHhxsas8ftAAjuEYFvSnz9MM2jdoqJcYg8YVg";

  // const tx = await txParser.parseTransaction(connection, signature, true);
  const transactionResponse = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 1 });

  const events: { name: string; data: any }[] = [];
  const inner: CompiledInnerInstruction[] =
    transactionResponse?.meta?.innerInstructions ?? [];
  const idlProgramId = AMM_PROGRAM_ID;
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
      const event = ammClient.program.coder.events.decode(eventData);
      // const event = program.coder.events.decode(eventData)
      // console.log(ix.data);
      console.log(event)
      if (event) {
        events.push(event);
      }
    }
  }

  console.log(ammClient.program.coder.events)

  console.log(events[0].data.swapType);

  return;
  // return events;

  console.log(tx?.meta?.innerInstructions?.[0]);
  // console.log(ammClient.program.idl.gcc)

  // ammClient.program.coder.

  // const ix = t


  // console.log(tx);

  // const log = tx.

  // ammClient.program.coder.events.decode()
  return;

  const eligibleSignatures = await usingDb(async (db) => {
    const tx = await db.select()
      .from(schema.signatures)
      .where(eq(schema.signatures.queried_addr, AMM_PROGRAM_ID.toString()))
      .orderBy(desc(schema.signatures.slot))
      .limit(100)
    return tx;
  });

  const highestSequenceNum = eligibleSignatures.reduce((max, signature) => signature.sequence_num > max ? signature.sequence_num : max, 0n);


  const txs = await Promise.all(eligibleSignatures.map(async (signature) => {
    const parsedTx = await txParser.parseTransaction(connection, signature.signature);
    return parsedTx;
  }));

  let ammIxs: ParsedInstruction<typeof AmmIDL, "swap" | "addLiquidity" | "removeLiquidity" | "createAmm" | "crankThatTwap">[] = [];

  txs.forEach(ixs => {
    if (ixs) {
      ammIxs = ammIxs.concat(ixs.filter((ix) => ix.programId.equals(AMM_PROGRAM_ID)));
    }
  });
  // console.log(ammIxs.length);
  // console.log(ammIxs[0]);

  // const ammsToUpdateOrInsert: Set<PublicKey> = new Set();
  const ammsToUpdateOrInsert: PublicKey[] = [];

  ammIxs.forEach(ix => {
    const amm = ix.accounts.find(acc => acc.name === "amm")?.pubkey;
    // should always be true because each ix has an amm
    if (amm) {
      if (!ammsToUpdateOrInsert.some(ammInArray => ammInArray.equals(amm))) {
        ammsToUpdateOrInsert.push(amm);
      }
    }
  });


  ammsToUpdateOrInsert.forEach(async amm => {
    const chainAmm = await ammClient.fetchAmm(amm) as Amm;

    if (chainAmm) {
      await usingDb(async (db) => {
        await db.insert(schema.v0_4_amm).values([{
          amm_addr: amm.toString(),
          created_at_slot: chainAmm.createdAtSlot.toNumber(),
          lp_mint_addr: chainAmm.lpMint.toString(),
          base_mint_addr: chainAmm.baseMint.toString(),
          quote_mint_addr: chainAmm.quoteMint.toString(),
          base_reserves: chainAmm.baseAmount.toNumber(),
          quote_reserves: chainAmm.quoteAmount.toNumber(),
          latest_seq_num_applied: highestSequenceNum,
        }])
          .onConflictDoUpdate({
            target: schema.v0_4_amm.amm_addr,
            set: {
              base_reserves: chainAmm.baseAmount.toNumber(),
              quote_reserves: chainAmm.quoteAmount.toNumber(),
              latest_seq_num_applied: highestSequenceNum,
            }
          })
      });
    }
  });
  console.log("done");


  // const ammData = await usingDb(async (db) => {
  //   const ammData = await db.select()
  //     .from(schema.v0_4_amm)
  //     .where(eq(schema.v0_4_amm.amm_addr, amm?.toString() ?? ""));
  //   return ammData.length > 0 ? ammData[0] : null;
  // });



  // console.log(chainAmm);
  // console.log(ammData);

  // const swapIx = txs.filter(tx => tx !== null).find(tx => tx?.instructions[0].name === "swap");

  // console.log(txs[0]);

  // const parsedTransactions = txs.filter(tx => tx !== null);

  // console.log('Parsed transactions:', txs);
  // const txs = await txParser.parseTransaction(connection, )





  // const parsedTxs = 

}