import { dontDie } from './keep-alive';
import { indexTransaction } from './instruction-dispatch';
import { getProposals } from './proposal-indexer';
import { getTransactionHistory } from './transaction-history';
import { PublicKey } from '@solana/web3.js';

//const proposals = await getProposals();
//console.log(`got ${proposals.length} proposals`);
//proposals.forEach(proposal => { console.log(JSON.stringify(proposal, null, 2)) });
//const proposal = proposals[0];
//const passTwapAcct = proposal.account.openbookTwapPassMarket;
const prop9PassTwapAcct = new PublicKey("GpLACVBR3DMxNDfeFMKrhNnycs7ghdCwJeXSvccL5a3Z");
const prop10PassTwapAcct = new PublicKey("EgAtJ6WXAiXEQfTL2ci8dLY2dnynLP4tsspF9u8uiiAn");
const txs = await getTransactionHistory(prop9PassTwapAcct);
const chronologicalOrderTxs = txs.reverse();
for (let i = 0; i < 10; ++i) {
  const sig = chronologicalOrderTxs[i].signature;
  const result = await indexTransaction(i, sig);
  if (!result.indexed) {
    console.log(`ERROR: ${result.error.type}`, result.error.details);
    console.log(`OG sig: ${sig}`);
    process.exit(1);
  }
}

dontDie();
