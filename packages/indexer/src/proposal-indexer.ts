import { AUTOCRAT_VERSIONS, OPENBOOK_PROGRAM_ID } from '@themetadao/futarchy-ts/lib/constants';
import { AutocratProgram, DaoState, ProgramVersion, Proposal } from '@themetadao/futarchy-ts/lib/types';
import { AccountMeta, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { OpenbookV2, IDL as OPENBOOK_IDL } from '@openbook-dex/openbook-v2';
import { Program, utils } from '@coral-xyz/anchor';
import { connection, provider } from './connection';
import { ProposalOutcome, MarketType } from '@themetadao/indexer-db/lib/schema';

const SUPPORTED_AUTOCRAT_VERSIONS = ['V0.1', 'V0'];

type ProposalDto = {
  autocratVersion: number;
  proposalNumber: number;
  proposalAccount: string;
  proposerAccount: string;
  descriptionUrl: string;
  createdAtSlot: string;
  marketType: MarketType;
  passMarket: string;
  failMarket: string;
  outcome: ProposalOutcome;
}

// TODO: send this to monitoring
function emitErrorMetric(msg: String) {
  console.log(msg);
}

async function getDAOProposals({label, programId, idl}: ProgramVersion) {
  console.log(`fetching ${label} proposals`);

  if (!SUPPORTED_AUTOCRAT_VERSIONS.includes(label)) {
    // TODO: Emit error metric 
    emitErrorMetric(`Unable to parse proposals with label ${label}`);
    return [];
  }

  const dao = PublicKey.findProgramAddressSync(
    [utils.bytes.utf8.encode('WWCACOTMICMIBMHAFTTWYGHMB')],
    programId,
  )[0];

  const daoTreasury = PublicKey.findProgramAddressSync([dao.toBuffer()], programId)[0];

  const autocratProgram = new Program<AutocratProgram>(idl as AutocratProgram, programId, provider);

  const openbook = new Program<OpenbookV2>(OPENBOOK_IDL, OPENBOOK_PROGRAM_ID, provider);

  const daoState = await autocratProgram.account.dao.fetch(dao);

  const proposals: ProposalDto[] = [];
  
  (await autocratProgram.account.proposal.all())
    .sort((a, b) => b.account.number - a.account.number) // descending order
    .forEach(proposal => {
      const outcomeStr = Object.keys(proposal.account.state)[0];
      const outcome = (outcomeStr[0].toUpperCase() + outcomeStr.slice(1)) as ProposalOutcome;
      if (!Object.values(ProposalOutcome).includes(outcome)) {
        emitErrorMetric(`Skipping proposal ${proposal.publicKey.toBase58()} due to invalid outcome value `);
        return;
      }
      proposals.push({
        autocratVersion: parseFloat(label.slice(1)),
        proposalNumber: proposal.account.number,
        proposalAccount: proposal.publicKey.toBase58(),
        proposerAccount: proposal.account.proposer.toBase58(),
        descriptionUrl: proposal.account.descriptionUrl,
        createdAtSlot: proposal.account.slotEnqueued,
        marketType: MarketType.OPEN_BOOK_V2,
        passMarket: proposal.account.openbookPassMarket.toBase58(),
        failMarket: proposal.account.openbookFailMarket.toBase58(),

        // TODO: do I need to index these? I don't understand why there are separate "markets" for the twaps
        // twapPassMarket: proposal.account.openbookTwapPassMarket.toBase58(),
        // twapFailMarket: proposal.account.openbookFailMarket.toBase58(),
        
        // TODO: index vault accounts. could be a useful stat to see in UI
        // baseVault: proposal.account.baseVault.toBase58(),
        // quoteVault: proposal.account.quoteVault.toBase58(),

        outcome
      });
    });

  return proposals;
}

export async function getProposals() {
  return (await Promise.all(AUTOCRAT_VERSIONS.map(getDAOProposals))).flat();
}