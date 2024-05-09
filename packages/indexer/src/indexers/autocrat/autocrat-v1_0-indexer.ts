import { AUTOCRAT_VERSIONS } from "@metadaoproject/futarchy-sdk/lib/constants";
import { IDL, AutocratV1 } from "@metadaoproject/futarchy-sdk/lib/idl/autocrat_v1";
import { InstructionIndexer } from "../instruction-indexer";
import { logger } from "../../logger";
import { ConditionalVaultIndexer, DaoIndexer, MarketIndexer, ProposalIndexer } from "../program-idl-data-indexer";
import { rpcReadClient, indexerReadClient } from "../../connection";
import { usingDb, schema } from "@metadaoproject/indexer-db";
import { Dao, DaoAggregate } from "@metadaoproject/futarchy-sdk/lib/types";
import { Err, Ok } from "../../match";

const AUTOCRAT_V1_0 = AUTOCRAT_VERSIONS[AUTOCRAT_VERSIONS.length];

export enum AutocratV1_0DaoIndexerError {
  GeneralError = "GeneralError",
}

if (AUTOCRAT_V1_0.label !== "V1") {
  const error = new Error(`Mistook autocrat ${AUTOCRAT_V1_0.label} for V1`);
  logger.error(error.message);
  throw error;
}

export const AutocratV0_1Indexer: InstructionIndexer<AutocratV1> = {
  PROGRAM_NAME: "AutocratV1.0",
  PROGRAM_ID: AUTOCRAT_V1_0.programId.toBase58(),
  PROGRAM_IDL: IDL,
  indexInstruction: async (dbTx, txIdx, txRes, ixIdx, ix) => {
    return Ok;
  },
};

export const AutocratV1_0DaoIndexer: DaoIndexer = {
  index: async() => {
    try {
      // Fetches all daos from the database
      const daos: DaoAggregate[] = await indexerReadClient.fetchAllDaos();

      // Check to see if we have database values
      if(daos == undefined || !daos.length){
        console.warn(`Database seems to be empty, working off chain exclusively.`);
      }
      // Map the database dao keys (TODO: We could argue a simple query is better than leveraging the sdk...)
      const daoKeys: string[] = daos.flatMap((dao) => dao.daos.flatMap((daoKey) => daoKey.publicKey.toString()))

      // Only working for this version (v1.0)
      const onChainDaos = await rpcReadClient.fetchAllDaos();

      // Check to see if the on chain data returns
      if(onChainDaos == undefined || !onChainDaos.length){
        console.error(`No on chain data discovered for program, discontinuing.`);
        // TODO: Throw but we want to keep cycling
        return;
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

      if(!onChainDaosToInsert.length){
        console.log(`Nothing to insert`);
        return;
      };

      // Insert into database
      const insertedDaos = onChainDaosToInsert.map(async (dao) => {
        if(!dao.baseToken.publicKey || !dao.quoteToken.publicKey){
          console.error("Unable to determine public key for dao tokens")
          return;
        }
        return await usingDb((db) => 
          db
            .insert(schema.daos)
            .values({
              //daoId: 20 , // TODO: We need to Serial this or somethings...
              daoAcct: dao.daoAccount.toString(),
              programAcct: AUTOCRAT_V1_0.programId.toString(),
              // No idea with the above seems like it shoudn't be caring about lint (2x lines)
              baseAcct: dao.baseToken.publicKey.toString(),
              quoteAcct: dao.quoteToken.publicKey.toString(),
              treasuryAcct: dao.daoAccount.treasury,
            })
            .onConflictDoNothing()
            .returning({ daoId: schema.daos.daoId })
        );
      });
      
      // TODO: Should we actually check if the data is consistent
      // TODO: Don't know about this or what we should return.
      return Ok({ acct: insertedDaos });
    } catch (err) {
      console.error(err);
      return Err({ type: AutocratV1_0DaoIndexerError.GeneralError });
    }
  }
};

export const AutocratV1_0ProposalIndexer: ProposalIndexer = {
  index: async() => {
    try {
      // Fetches all proposals from the database
      const proposals = await indexerReadClient.fetchAllProposals();
      return proposals;
    } catch (err) {
      console.error(err);
    }
  }
};

export const AutocratV1_0ConditionalVaultIndexer: ConditionalVaultIndexer = {
  index: async() => {
    try {
      // Fetches all conditional vaults from the database
      const vaults = await indexerReadClient.fetchAllConditionalVaults();
      return vaults;
    } catch (err) {
      console.error(err);
    }
  }
};

export const AutocratV1_0MarketIndexer: MarketIndexer = {
  index: async() => {
    try {
      // Fetches all markets from the database
      const markets = await indexerReadClient.fetchAllMarkets();
      return markets;
    } catch (err) {
      console.error(err);
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
