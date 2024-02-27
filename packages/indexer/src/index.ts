import { dontDie } from './keep-alive';
import { IndexTransactionError, indexTransaction } from './instruction-dispatch';
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
const autocratV0_1 = new PublicKey("metaX99LHn3A7Gr7VAcCfXhpfocvpMpqQ3eyp3PGUUq");
const autocratV0 = new PublicKey("meta3cxKzFBmWYgCVozmvCQAS3y9b3fGxrG9HkHL7Wi");
const txs = await getTransactionHistory(autocratV0);
const chronologicalOrderTxs = txs.reverse();
for (let i = 0; i < Math.min(100, chronologicalOrderTxs.length); ++i) {
  const sig = chronologicalOrderTxs[i].signature;
  const result = await indexTransaction(i, sig);
  if (!result.indexed) {
    switch (result.error.type) {
      case IndexTransactionError.NoKnownProgram:
        console.log(`No known program for tx ${i}`);
        continue;
    }
    // "Instruction: IdlCreateAccount"
    // "Instruction: IdlWrite"
    console.log(`ERROR: ${result.error.type}`, result.error.details);
    console.log(`OG sig: ${sig}`);
    process.exit(1);
  }
}

dontDie();
