import { dontDie } from './keep-alive';
import { indexTransaction } from './instruction-dispatch';
import { getProposals } from './proposal-indexer';
import { getTransactionHistory } from './transaction-history';

const proposals = await getProposals();
console.log(`got ${proposals.length} proposals`);
//proposals.forEach(proposal => { console.log(JSON.stringify(proposal, null, 2)) });
const proposal = proposals[0];
const passTwapAcct = proposal.account.openbookTwapPassMarket;
const txs = await getTransactionHistory(passTwapAcct);
const sig = txs[txs.length - 2].signature;
const result = await indexTransaction(sig);
if (!result.indexed) {
  console.log(`ERROR: ${result.error.type}`, result.error.details);
  console.log(`OG sig: ${sig}`);
  process.exit(1);
}

dontDie();
