import { dontDie } from './keep-alive';
import { IndexTransactionError, indexTransaction } from './instruction-dispatch';
import { getProposals } from './proposal-indexer';
import { getTransactionHistory } from './transaction-history';
import { PublicKey } from '@solana/web3.js';
import { OpenbookTwapIndexer } from './indexers/openbook-twap/openbook-twap-indexer';
import { AutocratV0_1Indexer } from './indexers/autocrat/autocrat-v0_1-indexer';
import { AutocratV0Indexer } from './indexers/autocrat/autocrat-v0-indexer';
import { connection } from './connection';

//const proposals = await getProposals();
//console.log(`got ${proposals.length} proposals`);
//proposals.forEach(proposal => { console.log(JSON.stringify(proposal, null, 2)) });
//const proposal = proposals[0];
//const passTwapAcct = proposal.account.openbookTwapPassMarket;
//const prop9PassTwapAcct = new PublicKey("GpLACVBR3DMxNDfeFMKrhNnycs7ghdCwJeXSvccL5a3Z");
//const prop10PassTwapAcct = new PublicKey("EgAtJ6WXAiXEQfTL2ci8dLY2dnynLP4tsspF9u8uiiAn");

const openbookTwapProgram = OpenbookTwapIndexer.PROGRAM_ID;
const autocratV0_1 = AutocratV0_1Indexer.PROGRAM_ID;
const autocratV0 = AutocratV0Indexer.PROGRAM_ID;
const txs = await getTransactionHistory(new PublicKey(openbookTwapProgram));
const chronologicalOrderTxs = txs.reverse();
for (let i = 0; i < Math.min(50, chronologicalOrderTxs.length); ++i) {
  const sig = chronologicalOrderTxs[i].signature;
  const result = await indexTransaction(i, sig);
  if (!result.indexed) {
    switch (result.error.type) {
      case IndexTransactionError.NoKnownProgram:
        console.log(`No known program for tx ${i}`);
        continue;
    }
    console.log(`ERROR: ${result.error.type}`, result.error.details);
    console.log(`Index ${i}, Signature: ${sig}`);
    process.exit(1);
  }
}


dontDie();
