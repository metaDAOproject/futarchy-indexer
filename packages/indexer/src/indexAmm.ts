import { Amm, AMM_PROGRAM_ID } from "@metadaoproject/futarchy/v0.4";
import { usingDb, schema, eq, asc, desc } from "@metadaoproject/indexer-db";
import { SolanaParser, ParsedInstruction } from "@debridge-finance/solana-transaction-parser";
import { AmmIDL, AmmClient } from "@metadaoproject/futarchy/v0.4";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;

if (!RPC_ENDPOINT) {
  throw new Error("RPC_ENDPOINT is not set");
}

const connection = new Connection(RPC_ENDPOINT);


export const indexAmms = async () => {
  const eligibleSignatures = await usingDb(async (db) => {
    const tx = await db.select()
      .from(schema.signatures)
      .where(eq(schema.signatures.queried_addr, AMM_PROGRAM_ID.toString()))
      .orderBy(desc(schema.signatures.slot))
      .limit(100)
    return tx;
  });

  const highestSequenceNum = eligibleSignatures.reduce((max, signature) => signature.sequence_num > max ? signature.sequence_num : max, 0n);

  const txParser = new SolanaParser([{ idl: AmmIDL, programId: AMM_PROGRAM_ID }]);

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

  const ammClient = AmmClient.createClient({ provider: new AnchorProvider(connection, new Wallet(Keypair.generate()), {}) });

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