import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import { rpcReadClient, indexerReadClient, connection } from "../../connection";
import { usingDb, schema } from "@metadaoproject/indexer-db";
import { Dao, DaoAggregate } from "@metadaoproject/futarchy-sdk";
import { Err, Ok } from "../../match";
import { PublicKey } from "@solana/web3.js";
import { DaoRecord, TokenRecord } from "@metadaoproject/indexer-db/lib/schema";
import { getMint } from "@solana/spl-token";

export enum AutocratV0_3DaoIndexerError {
  GeneralError = "GeneralError",
  DuplicateError = "DuplicateError",
  MissingParamError = "MissingParamError",
  NotFoundError = "NotFoundError",
  MissingChainResponseError = "MissingChainResponseError",
  NothingToInsertError = "NothingToInsertError",
}

export const AutocratV0_3DaoIndexer: IntervalFetchIndexer = {
  intervalMs: 30000,
  index: async () => {
    try {
      // Fetches all daos from the database
      const dbDaos: DaoAggregate[] = await indexerReadClient.daos.fetchAllDaos();
      const onChainDaos = await rpcReadClient.daos.fetchAllDaos();

      const dbDaoPubkeys: PublicKey[] = [];
      for (const daoAggregate of dbDaos) {
        for (const dao of daoAggregate.daos) {
          dbDaoPubkeys.push(dao.publicKey);
        }
      }

      const daosToInsert: Dao[] = [];
      for (const daoAggregate of onChainDaos) {
        for (const dao of daoAggregate.daos) {
          if (!dbDaoPubkeys.find((dbDao) => dbDao.equals(dao.publicKey))) {
            daosToInsert.push(dao);
          } 
        }
      }

      console.log("DAOS to insert");
      console.log(daosToInsert.map(dao => dao.publicKey.toString()))

      daosToInsert.map(async (dao) => {
        if (
          dao.baseToken.publicKey == null ||
          dao.quoteToken.publicKey == null
        ) {
          console.error("Unable to determine public key for dao tokens");
          return Err({ type: AutocratV0_3DaoIndexerError.MissingParamError });
        }
        // const baseTokenData = await enrichTokenMetadata(
        //   new PublicKey(dao.baseToken.publicKey),
        //   provider
        // );
        const baseTokenMint = await getMint(connection, new PublicKey(dao.baseToken.publicKey));
        // Puts the base tokens into the DB before we try to insert the dao
        let token: TokenRecord = {
          symbol: dao.baseToken.symbol,
          name: dao.baseToken.name ? dao.baseToken.name : dao.baseToken.symbol,
          decimals: dao.baseToken.decimals,
          mintAcct: dao.baseToken.publicKey,
          supply: baseTokenMint.supply,
          updatedAt: new Date(),
        };

        await usingDb((db) =>
          db
            .insert(schema.tokens)
            .values(token)
            .onConflictDoNothing()
            .execute()
        );

        let daoToInsert: DaoRecord = {
          daoAcct: dao.publicKey.toString(),
          programAcct: dao.protocol.autocrat.programId.toString(),
          baseAcct: dao.baseToken.publicKey,
          quoteAcct: dao.quoteToken.publicKey,
          slotsPerProposal: null,
        };
        // After we have the token in the DB, we can now insert the dao
        await usingDb((db) =>
          db
            .insert(schema.daos)
            .values(daoToInsert)
            .onConflictDoNothing()
            .execute()
        );
      });


      return Ok({ acct: "urmom" });
    } catch (err) {
      console.error(err);
      return Err({ type: AutocratV0_3DaoIndexerError.GeneralError });
    }
  },
};