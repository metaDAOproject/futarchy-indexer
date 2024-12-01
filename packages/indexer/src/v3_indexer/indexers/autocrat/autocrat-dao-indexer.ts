import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import { rpcReadClient, connection } from "../../connection";
import { usingDb, schema } from "@metadaoproject/indexer-db";
import { Dao } from "@metadaoproject/futarchy-sdk";
import { Err, Ok } from "../../utils/match";
import { PublicKey } from "@solana/web3.js";
import { DaoRecord, TokenRecord } from "@metadaoproject/indexer-db/lib/schema";
import { getMint } from "@solana/spl-token";
import { logger } from "../../../logger";

export enum AutocratDaoIndexerError {
  GeneralError = "GeneralError",
  DuplicateError = "DuplicateError",
  MissingParamError = "MissingParamError",
  NotFoundError = "NotFoundError",
  MissingChainResponseError = "MissingChainResponseError",
  NothingToInsertError = "NothingToInsertError",
}

export const AutocratDaoIndexer: IntervalFetchIndexer = {
  cronExpression: "*/20 * * * * *",
  index: async () => {
    try {
      // Fetches all daos from the database
      const dbDaos: DaoRecord[] =
        (await usingDb((db) => db.select().from(schema.daos).execute())) ?? [];
      const onChainDaos = await rpcReadClient.daos.fetchAllDaos();

      const daosToInsert: Dao[] = [];
      for (const daoAggregate of onChainDaos) {
        for (const dao of daoAggregate.daos) {
          // if (
          //   !dbDaos.find((dbDao) =>
          //     new PublicKey(dbDao.daoAcct).equals(dao.publicKey)
          //   )
          // ) {
          //   daosToInsert.push(dao);
          // }
          daosToInsert.push(dao);
        }
      }

      console.log("DAOS to insert");
      console.log(daosToInsert.map((dao) => dao.publicKey.toString()));

      daosToInsert.map(async (dao) => {
        if (
          dao.baseToken.publicKey == null ||
          dao.quoteToken.publicKey == null
        ) {
          logger.error("Unable to determine public key for dao tokens");
          return Err({ type: AutocratDaoIndexerError.MissingParamError });
        }

        const baseTokenMint = await getMint(
          connection,
          new PublicKey(dao.baseToken.publicKey)
        );

        // Puts the base tokens into the DB before we try to insert the dao
        let token: TokenRecord = {
          symbol: dao.baseToken.symbol,
          name: dao.baseToken.name ? dao.baseToken.name : dao.baseToken.symbol,
          decimals: dao.baseToken.decimals,
          mintAcct: dao.baseToken.publicKey,
          supply: baseTokenMint.supply.toString(),
          updatedAt: new Date(),
        };

        await usingDb((db) =>
          db.insert(schema.tokens).values(token).onConflictDoNothing().execute()
        );

        let daoToInsert: DaoRecord = {
          daoAcct: dao.publicKey.toBase58(),
          programAcct: dao.protocol.autocrat.programId.toString(),
          baseAcct: dao.baseToken.publicKey,
          quoteAcct: dao.quoteToken.publicKey,
          slotsPerProposal: dao.daoAccount.slotsPerProposal.toString(),
          treasuryAcct: dao.daoAccount.treasury.toBase58(),
          minBaseFutarchicLiquidity: 
            dao.daoAccount.minBaseFutarchicLiquidity
              ? dao.daoAccount.minBaseFutarchicLiquidity.toString()
              : 0
          ,
          minQuoteFutarchicLiquidity:
            dao.daoAccount.minQuoteFutarchicLiquidity
              ? dao.daoAccount.minQuoteFutarchicLiquidity.toString()
              : 0
          ,
          passThresholdBps: BigInt(dao.daoAccount.passThresholdBps),
          twapInitialObservation: 
            dao.daoAccount.twapInitialObservation
              ? dao.daoAccount.twapInitialObservation.toString()
              : 0
          ,
          twapMaxObservationChangePerUpdate: 
            dao.daoAccount.twapMaxObservationChangePerUpdate
              ? dao.daoAccount.twapMaxObservationChangePerUpdate.toString()
              : 0
          ,
        };
        // After we have the token in the DB, we can now insert the dao
        await usingDb((db) =>
          db
            .insert(schema.daos)
            .values(daoToInsert)
            .onConflictDoUpdate({
              set: {
                minBaseFutarchicLiquidity:
                  daoToInsert.minBaseFutarchicLiquidity,
                minQuoteFutarchicLiquidity:
                  daoToInsert.minQuoteFutarchicLiquidity,
                twapInitialObservation: daoToInsert.twapInitialObservation,
                twapMaxObservationChangePerUpdate:
                  daoToInsert.twapMaxObservationChangePerUpdate,
                passThresholdBps: daoToInsert.passThresholdBps,
              },
              target: schema.daos.daoAcct,
            })
            .execute()
        );
      });

      return Ok({ acct: "Updated daos" });
    } catch (err) {
      logger.errorWithChatBotAlert(err);
      return Err({ type: AutocratDaoIndexerError.GeneralError });
    }
  },

  indexFromLogs: async (logs: string[]) => {
    try {
      // Find the relevant log that contains the DAO data
      const daoLog = logs.find(log => 
        log.includes("Instruction:") && 
        (log.includes("InitializeDao") || log.includes("UpdateDao"))
      );

      if (!daoLog) {
        return Err({ type: AutocratDaoIndexerError.MissingParamError });
      }

      // Extract DAO account from logs
      const daoAcctMatch = logs.find(log => log.includes("Dao:"));
      if (!daoAcctMatch) {
        return Err({ type: AutocratDaoIndexerError.MissingParamError });
      }

      const daoAcct = new PublicKey(daoAcctMatch.split(": ")[1]);
      
      // Fetch the DAO data directly since we need the full account data
      const dao = await rpcReadClient.daos.fetchDao(daoAcct);
      if (!dao) {
        return Err({ type: AutocratDaoIndexerError.NotFoundError });
      }

      // Update database using the same logic as the main indexer
      if (dao.baseToken.publicKey == null || dao.quoteToken.publicKey == null) {
        logger.error("Unable to determine public key for dao tokens");
        return Err({ type: AutocratDaoIndexerError.MissingParamError });
      }

      const baseTokenMint = await getMint(
        connection,
        new PublicKey(dao.baseToken.publicKey)
      );

      let token: TokenRecord = {
        symbol: dao.baseToken.symbol,
        name: dao.baseToken.name ? dao.baseToken.name : dao.baseToken.symbol,
        decimals: dao.baseToken.decimals,
        mintAcct: dao.baseToken.publicKey,
        supply: baseTokenMint.supply.toString(),
        updatedAt: new Date(),
      };

      await usingDb((db) =>
        db.insert(schema.tokens).values(token).onConflictDoNothing().execute()
      );

      let daoToInsert: DaoRecord = {
        daoAcct: dao.publicKey.toBase58(),
        programAcct: dao.protocol.autocrat.programId.toString(),
        baseAcct: dao.baseToken.publicKey,
        quoteAcct: dao.quoteToken.publicKey,
        slotsPerProposal: dao.daoAccount.slotsPerProposal.toString(),
        treasuryAcct: dao.daoAccount.treasury.toBase58(),
        minBaseFutarchicLiquidity: 
          dao.daoAccount.minBaseFutarchicLiquidity
            ? dao.daoAccount.minBaseFutarchicLiquidity.toString()
            : 0,
        minQuoteFutarchicLiquidity:
          dao.daoAccount.minQuoteFutarchicLiquidity
            ? dao.daoAccount.minQuoteFutarchicLiquidity.toString()
            : 0,
        passThresholdBps: BigInt(dao.daoAccount.passThresholdBps),
        twapInitialObservation: 
          dao.daoAccount.twapInitialObservation
            ? dao.daoAccount.twapInitialObservation.toString()
            : 0,
        twapMaxObservationChangePerUpdate: 
          dao.daoAccount.twapMaxObservationChangePerUpdate
            ? dao.daoAccount.twapMaxObservationChangePerUpdate.toString()
            : 0,
      };

      await usingDb((db) =>
        db
          .insert(schema.daos)
          .values(daoToInsert)
          .onConflictDoUpdate({
            set: {
              minBaseFutarchicLiquidity: daoToInsert.minBaseFutarchicLiquidity,
              minQuoteFutarchicLiquidity: daoToInsert.minQuoteFutarchicLiquidity,
              twapInitialObservation: daoToInsert.twapInitialObservation,
              twapMaxObservationChangePerUpdate: daoToInsert.twapMaxObservationChangePerUpdate,
              passThresholdBps: daoToInsert.passThresholdBps,
            },
            target: schema.daos.daoAcct,
          })
          .execute()
      );

      return Ok({ acct: "Updated dao from logs" });
    } catch (err) {
      logger.errorWithChatBotAlert(err);
      return Err({ type: AutocratDaoIndexerError.GeneralError });
    }
  }
};
