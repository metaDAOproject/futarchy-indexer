import { getProposals } from './proposal-indexer';
import { getTransactionHistory } from './transaction/history';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { OpenbookTwapIndexer } from './indexers/openbook-twap/openbook-twap-indexer';
import { AutocratV0_1Indexer } from './indexers/autocrat/autocrat-v0_1-indexer';
import { AutocratV0Indexer } from './indexers/autocrat/autocrat-v0-indexer';
import { startTransactionWatchers } from './transaction/watcher';
import { startIndexers } from './indexers';
import { getTransaction } from './transaction/serializer';
import { connection } from './connection';

//const proposals = await getProposals();
//console.log(`got ${proposals.length} proposals`);
//proposals.forEach(proposal => { console.log(JSON.stringify(proposal, null, 2)) });
//const proposal = proposals[0];
//const passTwapAcct = proposal.account.openbookTwapPassMarket;
const prop9PassTwapAcct = new PublicKey("GpLACVBR3DMxNDfeFMKrhNnycs7ghdCwJeXSvccL5a3Z");
const prop10PassTwapAcct = new PublicKey("EgAtJ6WXAiXEQfTL2ci8dLY2dnynLP4tsspF9u8uiiAn");

// V0 transactions (from autocrat 0.1) (metaX99LHn3A7Gr7VAcCfXhpfocvpMpqQ3eyp3PGUUq)
// z3EFh3BtGMT5Y5suVYDthUFS5v8WioxdDo8HMwMbyfvieyBBN8jazJkMSXBALRfMac2RpZJXsahdNziQfvqVU8m
// 5JcQWLykSeSY5XLb4m5fYXwaaznqYbRjR71wkA5meXLrx1ho8NJrPgLxFiSqtyG1U3fN7kfGZWYEwgU4bGwK2Y9H
// 32AvJcg5fZ48D4BZ7Tymgj7LAxqCkBKMJ4319iyN43gW5gHrWkM8WWPaaB1amZvXrSH2KcNo2dTvK9sPg16RUYi5

/*
const openbookTwapProgram = OpenbookTwapIndexer.PROGRAM_ID;
const autocratV0_1 = AutocratV0_1Indexer.PROGRAM_ID;
const autocratV0 = AutocratV0Indexer.PROGRAM_ID;
const txs = await getTransactionHistory(new PublicKey(autocratV0_1));
const chronologicalOrderTxs = txs.reverse();

for (let i = 0; i < chronologicalOrderTxs.length; ++i) {
  const sig = chronologicalOrderTxs[i].signature;
  const serializeResult = await getTransaction(sig);
  if (serializeResult.success) {
    if (serializeResult.ok.version === 0) {
      console.log(`${i}. success ${sig}`);
    }
  } else {
    console.log(`${i}.  failed ${sig}`);
    console.log(serializeResult.error);
    const txRaw = await connection.getTransaction(sig, {maxSupportedTransactionVersion: 0});
    console.log(JSON.stringify(txRaw, null, 2));
    process.exit(1);
  }
  // const result = await indexTransaction(i, sig);
  // if (!result.indexed) {
  //   switch (result.error.type) {
  //     case IndexTransactionError.NoKnownProgram:
  //       console.log(`No known program for tx ${i}`);
  //       continue;
  //   }
  //   console.log(`ERROR: ${result.error.type}`, result.error.details);
  //   console.log(`Index ${i}, Signature: ${sig}`);
  //   process.exit(1);
  // }
}
//*/

/*
const sig = "3MYba5zjgjGXCo5GfRkMnqDSiKGDYaaUg4MX91czckv3YGF3fRYhC7te6mK4uibrfdrRkg81653LLLCWicvdPK7L";
const test = await getTransaction(sig);
function print(something: any) {
  console.log(JSON.stringify(something, null, 2));
}
if (test.success) {
  console.log('ok');
  print(test.ok);
} else {
  print(test.error);
}
console.log("parsed transaction");
print(await connection.getParsedTransaction(sig, {maxSupportedTransactionVersion: 0}));
//*/

startTransactionWatchers();
//startIndexers();
