import { AUTOCRAT_VERSIONS } from "@metadaoproject/futarchy-sdk/lib/constants";
import { IDL, AutocratV1 } from "@metadaoproject/futarchy-sdk/lib/idl/autocrat_v1";
import { InstructionIndexer, Ok } from "../instruction-indexer";
import { logger } from "../../logger";
import { AccountInfoIndexer } from "../account-info-indexer";
import { rpcReadClient } from "../../connection";
import { usingDb, schema } from "@metadaoproject/indexer-db";
import { FutarchyIndexerDaoClient } from "@metadaoproject/futarchy-sdk/lib/client/indexer/dao";
import { FutarchyRPCDaoClient } from "@metadaoproject/futarchy-sdk/lib/client/rpc";

const AUTOCRAT_V1_0 = AUTOCRAT_VERSIONS[AUTOCRAT_VERSIONS.length];

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

export const AutocratV0_1AccountIndexer: AccountInfoIndexer = {
  index: async (
    accountInfo: AccountInfo<Buffer>,
    account: PublicKey,
    context?: Context
  ) => {
    try {
      // Fetch our onchain daos
      const onChainDaos: Dao[] = await rpcReadClient.daos.all()
      // Fetch the daos we have in the DB
      // TODO: We likely can just use the SDK for this...
      new FutarchyRPCDaoClient(Provider)
      const client = new FutarchyIndexerDaoClient(
        FutarchyRPCDaoClient,
        Client,
        protocolMap: ,
      )
      //const databaseDaos = await client.fetchAllDaos()
      const databaseDaos: DaoAggregate[] = await usingDb((db) => {
        db
          .select()
          .from(schema.daos)
          .execute()
      })
      // Check to see if we have a new onChainDao
      onChainDaos.map((onChainDao: Dao) => {
        if(databaseDaos.find((dao) => dao.daos.find((dao) => {}) == onChainDao.publicKey.toString()))
      })
    }
  }
};
