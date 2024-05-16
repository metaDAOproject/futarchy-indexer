import { AUTOCRAT_VERSIONS } from "@metadaoproject/futarchy-sdk/lib/constants";
import { IDL, AutocratV1 } from "@metadaoproject/futarchy-sdk/lib/idl/autocrat_v1";
import { InstructionIndexer } from "../instruction-indexer";
import { logger } from "../../logger";
import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import { rpcReadClient, indexerReadClient, provider } from "../../connection";
import { usingDb, schema, sql } from "@metadaoproject/indexer-db";
import { Dao, DaoAggregate, Proposal } from "@metadaoproject/futarchy-sdk/lib/types";
import { enrichTokenMetadata } from "@metadaoproject/futarchy-sdk";
import { Err, Ok } from "../../match";
import { ConditionalVault } from "@metadaoproject/futarchy-ts";
import { PublicKey } from "@solana/web3.js";

const AUTOCRAT_V0_3 = AUTOCRAT_VERSIONS[AUTOCRAT_VERSIONS.length];

export enum AutocratV0_3DaoIndexerError {
  GeneralError = "GeneralError",
  DuplicateError = "DuplicateError",
  MissingParamError = "MissingParamError",
  NotFoundError = "NotFoundError",
  MissingChainResponseError = "MissingChainResponseError",
  NothingToInsertError = "NothingToInsertError",
}

if (AUTOCRAT_V0_3.label !== "V1") {
  const error = new Error(`Mistook autocrat ${AUTOCRAT_V0_3.label} for V0.3`);
  logger.error(error.message);
  throw error;
}

export const AutocratV0_1Indexer: InstructionIndexer<AutocratV1> = {
  PROGRAM_NAME: "AutocratV1.0",
  PROGRAM_ID: AUTOCRAT_V0_3.programId.toBase58(),
  PROGRAM_IDL: IDL,
  indexInstruction: async (dbTx, txIdx, txRes, ixIdx, ix) => {
    return Ok;
  },
};

// Order for indexing is as follows
// 1. Need to fetch tokens from daos and
// insert them into the database
// 2. After we have the tokens in the database
// we can insert the dao (which we fetched)
// 3. After we have the dao, we fetch conditional vaults
// to generate the p/f tokens (base, quote) and insert them
// 4. After the tokens are inserted we can then insert the vault
// 5. And from the vaults insert we can insert token accounts
// from conditional vaults
// 6. We then fetch the proposals and insert the markets
// 7. Once markets are inserted then we can insert the proposal

export const AutocratV0_3DaoIndexer: IntervalFetchIndexer = {
  intervalMs: 6000,
  index: async() => {
    try {
      // Fetches all daos from the database
      const daos: DaoAggregate[] = await indexerReadClient.daos.fetchAllDaos();

      // Check to see if we have database values
      if(daos == undefined || !daos.length){
        console.warn(`Database seems to be empty, working off chain exclusively.`);
      }
      // Map the database dao keys (TODO: We could argue a simple query is better than leveraging the sdk...)
      const daoKeys: string[] = daos.flatMap((dao) => dao.daos.flatMap((daoKey) => daoKey.publicKey.toString()))

      // Only working for this version (v1.0)
      // TODO: Review this so we match on the correct key or it has the f=ing key so we're good
      const onChainDaos = await rpcReadClient.daos.fetchAllDaos();

      // Check to see if the on chain data returns
      if(onChainDaos == undefined || !onChainDaos.length){
        console.error(`No on chain data discovered for program, discontinuing.`);
        // TODO: Throw but we want to keep cycling
        return Err({ type: AutocratV0_3DaoIndexerError.MissingChainResponseError });
      }
      // Map the on chain dao keys
      const onChainDaoKeys: string[] = onChainDaos.daos.map((dao) => dao.publicKey.toString());

      // Get the keys and compare / exclusion filter
      const daosForEntry = onChainDaoKeys.map((onChainDaoKey) => {
        const isFound = !daoKeys.find((dbDaoKey) => onChainDaoKey === dbDaoKey)
        if(isFound){
          return onChainDaoKey
        }
      }).filter((Boolean));
      
      // Filter on the remaining keys we have
      const onChainDaosToInsert: Dao[] = onChainDaos.daos.filter((dao) => {
        daosForEntry.includes(dao.publicKey.toString());
      });

      // TODO: Handle update???
      if(!onChainDaosToInsert.length){
        console.log(`Nothing to insert`);
        return Err({ type: AutocratV0_3DaoIndexerError.NothingToInsertError });
      };

      // Insert into database
      // TODO: Do I return this?
      const insertedDaos = onChainDaosToInsert.map(async (dao) => {
        if(dao.baseToken.publicKey == null || dao.quoteToken.publicKey == null){
          console.error("Unable to determine public key for dao tokens");
          return Err({ type: AutocratV0_3DaoIndexerError.MissingParamError });
        }
        const baseTokenData = await enrichTokenMetadata(dao.baseToken.publicKey, provider)
        // Puts the base tokens into the DB before we try to insert the dao
        await usingDb((db) => 
          db
            .insert(schema.tokens)
            .values({
              mintAcct: dao.baseToken.publicKey.toString(),
              name: dao.baseToken.name,
              symbol: dao.baseToken.name.toUpperCase(),
              supply: BigInt(1),
              decimals: baseTokenData.decimals, // Need to fetch the token decimals from the sdkkkkkk
              updatedAt: sql`now()`,
              imageUrl: "", // TODO: Solve how to map the token image from cloudflare
            })
            .onConflictDoNothing()
            .execute()
        );
        // After we have the token in the DB, we can now insert the dao
        await usingDb((db) => 
          db
            .insert(schema.daos)
            .values({
              daoAcct: dao.daoAccount.toString(),
              programAcct: dao.protocol.autocrat.programId.toString(),
              // No idea with the above seems like it shoudn't be caring about lint (2x lines)
              baseAcct: dao.baseToken.publicKey.toString(),
              quoteAcct: dao.quoteToken.publicKey.toString(),
              treasuryAcct: dao.daoAccount.treasury,
            })
            .onConflictDoNothing()
            .execute()
        );
      });
      
      // TODO: Should we actually check if the data is consistent
      // TODO: Don't know about this or what we should return.
      return Ok({ acct: 'string' });
    } catch (err) {
      console.error(err);
      return Err({ type: AutocratV0_3DaoIndexerError.GeneralError });
    }
  }
};

export const AutocratV0_3ConditionalVaultIndexer: IntervalFetchIndexer = {
  intervalMs: 6000,
  index: async() => {
    try {
      // Fetches all conditional vaults from the database
      const dbVaults: ConditionalVault[] = await indexerReadClient.fetchAllConditionalVaults();

      if (dbVaults == undefined || !dbVaults.length){
        console.warn('No vaults in the database, using only chain data');
      }

      // const dbVaultKeys = dbVaults.map((dbVault) => dbVault.accounts)
      // Fetches all conditional vaults from the rpc
      const onChainVaults = await rpcReadClient.fetchAllConditionalVaults();

      return Ok({ acct: 'string' });
    } catch (err) {
      console.error(err);
      return Err({ type: AutocratV0_3DaoIndexerError.GeneralError });
    }
  }
};

export const AutocratV0_3MarketIndexer: IntervalFetchIndexer = {
  intervalMs: 6000,
  index: async() => {
    try {
      // Fetches all markets from the database
      const markets = await indexerReadClient.fetchAllMarkets();
      return Ok({ acct: 'string' });
    } catch (err) {
      console.error(err);
      return Err({ type: AutocratV0_3DaoIndexerError.GeneralError });
    }
  }
};

export const AutocratV0_3ProposalIndexer: IntervalFetchIndexer = {
  intervalMs: 6000,
  index: async() => {
    try {
      // TODO: NOTE: This is pseudo code as for whatever reason my sdks etc are all borked
      // TODO: Do we want to build this down per DAO? So we could call it specifically?
      // TODO: Fetch all proposals from DB
      const dbProposals: Proposal[] = await indexerReadClient.proposals.fetchProposals();
      // TODO: Fetch all proposals from chain
      const onChainProposals: Proposal[] = await rpcReadClient.fetchAllProposals();
      // TODO: Compare the two
      const differentOrChangedProposals: Proposal[] = onChainProposals.filter((onChainProposal) => onChainProposal !== dbProposals);
      // TODO: Take what is missing (or has changed)
      const conditionalVaults = await rpcReadClient.fetchAllConditionalVaults();
      // TODO: Insert / Update Tokens (P/F mostly)
      const insertedOrUpdatedProposals = differentOrChangedProposals.map( async(proposal) => {
        if(proposal){
          console.error("Unable to determine public key for dao tokens");
          return Err({ type: AutocratV0_3DaoIndexerError.MissingParamError });
        }
        // NOTE: In proposal
        // Creates the conditional tokens into the DB
        const proposalVaults: PublicKey[] = [proposal.baseVault, proposal.quoteVault]
        const vaultsInserted = proposalVaults.map(async(proposalVault) => {
          // NOTE: In 1 of 2 vaults per proposal
          const conditionalVaultOnProposal = conditionalVaults.filter((conditionalVault) => {
            conditionalVault.pubkey.toBase58() === proposalVault.toBase58()
          })
          const underlyingTokenMint = conditionalVaultOnProposal.underlyingTokenMint
          const tokens: PublicKey[] = [conditionalVaultOnProposal.conditionalOnFinalizeTokenMint, conditionalVaultOnProposal.conditionalOnRevertTokenMint]
          const underlyingTokenData = await enrichTokenMetadata(underlyingTokenMint, provider);
          const insertTokens = tokens.map(async(token) => {
            // NOTE: In 1 of 2 token accounts per vault
            const tokenData = await enrichTokenMetadata(token, provider)
            // TODO: Determine pass or fail somewhere
            await usingDb((db) => 
              db
                .insert(schema.tokens)
                .values({
                  // TODO: p/f?
                  symbol: `${proposal.number} ${underlyingTokenData.symbol}`,
                  mintAcct: token.toBase58(),
                  // TODO: Naming conventions
                  name: `Proposal ${proposal.number}: `,
                  supply: BigInt(1),
                  decimals: tokenData.decimals,
                  updatedAt: sql`NOW()`,
                  // TODO: Image url
                  imageUrl: ""
                })
                .onConflictDoNothing()
                .execute()
            );
          });
          // TODO: Insert / Update Conditional Vault
          await usingDb((db) => 
            db
              .insert(schema.conditionalVaults)
              .values({})
              .onConflictDoNothing()
              .execute()
          )
          // TODO: Insert / Update Token Account For Conditional Vault (Underlying Token Account)
          await usingDb((db) => 
            db
              .insert(schema.tokenAccts)
              .values({
                // TODO: Review
                mintAcct: underlyingTokenMint.toBase58(),
                ownerAcct: conditionalVaultOnProposal.toBase58()
              })
              .onConflictDoNothing()
              .execute()
          )
        })
        // TODO: Insert / Update Markets
        const proposalMarkets: PublicKey[] = [proposal.passAMM, proposal.failAMM]
        const marketsInserted = proposalMarkets.map(async(market) => {
          // TODO: We need to map on the previously created vaults and tokens and token accounts accounts 
          await usingDb((db) =>
            db
              .insert(schema.markets)
              .values({
                // TODO: Review
                marketAcct: market.toBase58(),
                proposalAcct: proposal.publicKey.toBase58(),
                marketType: 'amm',
                createTxSig: '',
              })
              .onConflictDoNothing()
              .execute()
          )
        })
        // TODO: Insert / Update Proposal
        await usingDb((db) =>
          db
            .insert(schema.proposals)
            .values({})
            .onConflictDoNothing()
            .execute()
        )
      })
      // TODO: Need to update a core function to start building more aggregate functions
      
      // Fetches all proposals from the rpc
      
      
      return Ok({ acct: 'string' });
    } catch (err) {
      console.error(err);
      return Err({ type: AutocratV0_3DaoIndexerError.GeneralError });
    }
  }
};

// export const AutocratV0_1AccountIndexer: AccountInfoIndexer = {
//   index: async (
//     accountInfo: AccountInfo<Buffer>,
//     account: PublicKey,
//     context?: Context
//   ) => {
//     try {
//       // Fetch our onchain daos
//       const onChainDaos: Dao[] = await rpcReadClient.daos.all()
//       // Fetch the daos we have in the DB
//       // TODO: We likely can just use the SDK for this...
//       new FutarchyRPCDaoClient(Provider)
//       const client = new FutarchyIndexerDaoClient(
//         FutarchyRPCDaoClient,
//         Client,
//         protocolMap: ,
//       )
//       //const databaseDaos = await client.fetchAllDaos()
//       const databaseDaos: DaoAggregate[] = await usingDb((db) => {
//         db
//           .select()
//           .from(schema.daos)
//           .execute()
//       })
//       // Check to see if we have a new onChainDao
//       onChainDaos.map((onChainDao: Dao) => {
//         if(databaseDaos.find((dao) => dao.daos.find((dao) => {}) == onChainDao.publicKey.toString()))
//       })
//     }
//   }
// };
