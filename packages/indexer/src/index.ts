import { getProposals } from './proposal-indexer';
import { getTransactionHistory } from './transaction-history';

const proposals = await getProposals();
console.log(`got ${proposals.length} proposals`);
//proposals.forEach(proposal => { console.log(JSON.stringify(proposal, null, 2)) });
const proposal = proposals[0];
const passTwapAcct = proposal.account.openbookTwapPassMarket;
const txs = await getTransactionHistory(passTwapAcct);

function dontDie() {
  const startTime = Date.now();
  setInterval(() => {
    const aliveForSeconds = Math.round((Date.now() - startTime) / 1000);
    const aliveForMinutes = Math.floor(aliveForSeconds / 60);
    const aliveForHours = Math.floor(aliveForMinutes / 60);
    const aliveForDays = Math.floor(aliveForHours / 24);
    const aliveFor = 
      (aliveForDays ? `${aliveForDays}d`: '') +
      (aliveForHours ? `${aliveForHours % 24}h`.padStart(4, ' ') : '') + 
      (aliveForMinutes ? `${aliveForMinutes % 60}m`.padStart(4, ' ') : '') + 
      `${aliveForSeconds % 60}s`.padStart(4, ' ');
    console.log(`Service alive for ${aliveFor.trimStart()}`);
  }, 60000);
}

dontDie();
