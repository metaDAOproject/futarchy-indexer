import { AUTOCRAT_VERSIONS, OPENBOOK_PROGRAM_ID } from '@metadaoproject/futarchy-sdk/lib/constants';
import { AutocratProgram, DaoState, ProgramVersion, Proposal } from '@metadaoproject/futarchy-sdk/lib/types';
import { AccountMeta, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { OpenbookV2, IDL as OPENBOOK_IDL } from '@openbook-dex/openbook-v2';
import { Program, utils } from '@coral-xyz/anchor';
import { connection, provider } from './connection';
import { ProposalOutcome, MarketType } from '@metadaoproject/indexer-db/lib/schema';

const SUPPORTED_AUTOCRAT_VERSIONS = ['V0.1', 'V0'];

// TODO: send this to monitoring
function emitErrorMetric(msg: String) {
  console.log(msg);
}

async function getDAOProposals({label, programId, idl}: ProgramVersion) {
  //console.log(`fetching ${label} proposals`);

  if (!SUPPORTED_AUTOCRAT_VERSIONS.includes(label)) {
    // TODO: Emit error metric 
    emitErrorMetric(`Unable to parse proposals with label ${label}`);
    return [];
  }

  // const dao = PublicKey.findProgramAddressSync(
  //   [utils.bytes.utf8.encode('WWCACOTMICMIBMHAFTTWYGHMB')],
  //   programId,
  // )[0];

  // const daoTreasury = PublicKey.findProgramAddressSync([dao.toBuffer()], programId)[0];

  const autocratProgram = new Program<AutocratProgram>(idl as AutocratProgram, programId, provider);

  // const openbook = new Program<OpenbookV2>(OPENBOOK_IDL, OPENBOOK_PROGRAM_ID, provider);

  // const daoState = await autocratProgram.account.dao.fetch(dao);
  
  const proposals = (await autocratProgram.account.proposal.all())
    .sort((a, b) => b.account.number - a.account.number) // descending order

  return proposals;
}

export async function getProposals() {
  return (await Promise.all(AUTOCRAT_VERSIONS.map(getDAOProposals))).flat();
}
