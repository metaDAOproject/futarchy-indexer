import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import {
  rpcReadClient,
  conditionalVaultClient,
  provider,
} from "../../connection";
import {
  usingDb,
  schema,
  eq,
  or,
  gt,
  lte,
  and,
  isNull,
  sql,
  inArray,
} from "@metadaoproject/indexer-db";
import { Err, Ok } from "../../match";
import { PublicKey } from "@solana/web3.js";
import {
  ConditionalVaultRecord,
  DaoRecord,
  MarketRecord,
  MarketType,
  ProposalRecord,
  ProposalStatus,
  TokenAcctRecord,
  TokenRecord,
  UserPerformanceRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  ProposalAccountWithKey,
  enrichTokenMetadata,
} from "@metadaoproject/futarchy-sdk";
import { BN } from "@coral-xyz/anchor";
import { desc } from "drizzle-orm";
import { logger } from "../../../logger";
import { PriceMath } from "@metadaoproject/futarchy/v0.3";
import { UserPerformanceTotals } from "../../types";
import { alias } from "drizzle-orm/pg-core";

export enum AutocratDaoIndexerError {
  GeneralError = "GeneralError",
  DuplicateError = "DuplicateError",
  MissingParamError = "MissingParamError",
  MissingProtocolError = "MissingProtocolError",
  NotFoundError = "NotFoundError",
  MissingChainResponseError = "MissingChainResponseError",
  NothingToInsertError = "NothingToInsertError",
}

export const AutocratProposalIndexer: IntervalFetchIndexer = {
  cronExpression: "5 * * * * *",
  index: async () => {
    try {
      console.log("AutocratProposalIndexer::index::starting");
      const { currentSlot, currentTime } =
        (
          await usingDb((db) =>
            db
              .select({
                currentSlot: schema.prices.updatedSlot,
                currentTime: schema.prices.createdAt,
              })
              .from(schema.prices)
              .orderBy(sql`${schema.prices.updatedSlot} DESC`)
              .limit(1)
              .execute()
          )
        )?.[0] ?? {};

      console.log("currentSlot", currentSlot);
      if (!currentSlot || !currentTime) return Err({ type: AutocratDaoIndexerError.MissingParamError });

      logger.log("Autocrat proposal indexer");
      const dbProposals: ProposalRecord[] =
        (await usingDb((db) => db.select().from(schema.proposals).execute())) ??
        [];

      const protocolV0_3 = rpcReadClient.futarchyProtocols.find(
        (protocol) => protocol.deploymentVersion == "V0.3"
      );

      const onChainProposals =
        (await protocolV0_3?.autocrat.account.proposal.all()!!) as ProposalAccountWithKey[];

      const proposalsToInsert = [];
      for (const proposal of onChainProposals) {
        if (
          !dbProposals.find((dbProposal) =>
            new PublicKey(dbProposal.proposalAcct).equals(proposal.publicKey) &&
            dbProposal.endedAt === null
          )
        ) {
          proposalsToInsert.push(proposal);
        }
      }

      logger.log("Proposals to insert");
      logger.log(
        proposalsToInsert.map((proposal) => proposal.publicKey.toString())
      );

      if(!onChainProposals.length) return Err({ type: AutocratDaoIndexerError.NothingToInsertError });

      if(!proposalsToInsert.length) return Ok({ acct: "Nothing to insert, we're okay" });

      proposalsToInsert.map(async (proposal) => {
        const storedBaseVault = await conditionalVaultClient.getVault(
          proposal.account.baseVault
        );
        const storedQuoteVault = await conditionalVaultClient.getVault(
          proposal.account.quoteVault
        );


        const basePass: PublicKey =
          storedBaseVault.conditionalOnFinalizeTokenMint;
        const baseFail: PublicKey =
          storedBaseVault.conditionalOnRevertTokenMint;
        const quotePass: PublicKey =
          storedQuoteVault.conditionalOnFinalizeTokenMint;
        const quoteFail: PublicKey =
          storedQuoteVault.conditionalOnRevertTokenMint;

        let baseVault: ConditionalVaultRecord = {
          condVaultAcct: proposal.account.baseVault.toString(),
          settlementAuthority: storedBaseVault.settlementAuthority.toString(),
          underlyingMintAcct: storedBaseVault.underlyingTokenMint.toString(),
          underlyingTokenAcct:
            storedBaseVault.underlyingTokenAccount.toString(),
          condFinalizeTokenMintAcct: basePass.toString(),
          condRevertTokenMintAcct: baseFail.toString(),
          status: "active",
        };

        let quoteVault: ConditionalVaultRecord = {
          condVaultAcct: proposal.account.quoteVault.toString(),
          settlementAuthority: storedQuoteVault.settlementAuthority.toString(),
          underlyingMintAcct: storedQuoteVault.underlyingTokenMint.toString(),
          underlyingTokenAcct:
            storedQuoteVault.underlyingTokenAccount.toString(),
          condFinalizeTokenMintAcct: quotePass.toString(),
          condRevertTokenMintAcct: quoteFail.toString(),
          status: "active",
        };

        await usingDb((db) =>
          db
            .insert(schema.conditionalVaults)
            .values([baseVault, quoteVault])
            .onConflictDoNothing()
            .execute()
        );
        
        const proposalAcct = proposal.account;
        const daoAcct = proposalAcct.dao;
        if(!daoAcct) return Err({ type: AutocratDaoIndexerError.MissingParamError });

        const passAmm = proposalAcct.passAmm;
        const failAmm = proposalAcct.failAmm;
        if(!passAmm || !failAmm) return Err({ type: AutocratDaoIndexerError.MissingParamError });
        

        const dbDao: DaoRecord | undefined = (
          await usingDb((db) =>
            db
              .select()
              .from(schema.daos)
              .where(eq(schema.daos.daoAcct, daoAcct.toBase58()))
              .execute()
          )
        )?.[0];

        if (!dbDao) return;

        const dbProposal: ProposalRecord = {
          proposalAcct: proposal.publicKey.toString(),
          proposalNum: BigInt(proposal.account.number.toString()),
          autocratVersion: 0.3,
          daoAcct: daoAcct.toString(),
          proposerAcct: proposal.account.proposer.toString(),
          status: ProposalStatus.Pending,
          descriptionURL: proposal.account.descriptionUrl,
          initialSlot: proposal.account.slotEnqueued.toString(),
          passMarketAcct: passAmm.toString(),
          failMarketAcct: failAmm.toString(),
          baseVault: proposal.account.baseVault.toString(),
          quoteVault: proposal.account.quoteVault.toString(),
          endSlot: 
            proposal.account.slotEnqueued
              .add(new BN(dbDao.slotsPerProposal?.toString()))
              .toString()
          ,
          durationInSlots: dbDao.slotsPerProposal,
          minBaseFutarchicLiquidity: dbDao.minBaseFutarchicLiquidity ?? null,
          minQuoteFutarchicLiquidity: dbDao.minQuoteFutarchicLiquidity ?? null,
          passThresholdBps: dbDao.passThresholdBps,
          twapInitialObservation: dbDao.twapInitialObservation ?? null,
          twapMaxObservationChangePerUpdate:
            dbDao.twapMaxObservationChangePerUpdate ?? null,
        };

        await insertAssociatedAccountsDataForProposal(proposal, currentTime);

        await usingDb((db) =>
          db
            .insert(schema.proposals)
            .values([dbProposal])
            .onConflictDoNothing()
            .execute()
        );

        await updateMarketsWithProposal(proposal);
        
      });

      logger.log("inserted proposals");

      for (const onChainProposal of onChainProposals) {
        if (onChainProposal.account.state.pending) {

          const daoAcct = onChainProposal.account.dao;
          if(!daoAcct) return Err({ type: AutocratDaoIndexerError.MissingParamError });

          const dbDao: DaoRecord | undefined = (
            await usingDb((db) =>
              db
                .select()
                .from(schema.daos)
                .where(
                  eq(
                    schema.daos.daoAcct,
                    daoAcct.toBase58()
                  )
                )
                .execute()
            )
          )?.[0];

          if (!dbDao) continue;

          // Setup for calculating time left
          const initialSlot = new BN(onChainProposal.account.slotEnqueued.toString());

          const slotsPerProposal = new BN(dbDao.slotsPerProposal?.toString());

          //const endSlot: BN = initialSlot.add(slotsPerProposal);
          
          const currentSlotBN = new BN(currentSlot.toString());

          const slotDifference = initialSlot
            .add(slotsPerProposal)
            .sub(currentSlotBN);

          // Setup time to add to the date..
          const timeLeftSecondsEstimate = (slotDifference.toNumber() * 400) / 1000 // MS to seconds
          // const timeLeftMinutesEstimate = timeLeftSecondsEstimate / 60 // MS to seconds to minutes
          // const timeLeftHoursEstimate = timeLeftMinutesEstimate / 60

          const endedAt = new Date(currentTime.toUTCString());
          // endedAt.setHours(endedAt.getHours() + timeLeftHoursEstimate);
          // endedAt.setMinutes(endedAt.getMinutes() + timeLeftMinutesEstimate);
          endedAt.setSeconds(endedAt.getSeconds() + timeLeftSecondsEstimate); // setSeconds accepts float and will increase to hours etc.

          await usingDb((db) =>
            db
              .update(schema.proposals)
              .set({
                endedAt,
                proposalAcct: onChainProposal.publicKey.toString(),
                proposalNum: BigInt(onChainProposal.account.number.toString()),
                autocratVersion: 0.3,
                status: ProposalStatus.Pending,
                descriptionURL: onChainProposal.account.descriptionUrl,
                initialSlot: 
                  onChainProposal.account.slotEnqueued.toString()
                ,
                endSlot: 
                  onChainProposal.account.slotEnqueued
                    .add(new BN(dbDao.slotsPerProposal?.toString()))
                    .toString()
                ,
                updatedAt: sql`NOW()`,
              })
              .where(
                and(
                  eq(
                    schema.proposals.proposalAcct,
                    onChainProposal.publicKey.toString()
                  ),
                  sql`CAST(${schema.proposals.endSlot} AS NUMERIC) >= CAST(${currentSlot.toString()} AS NUMERIC)`,
                  isNull(schema.proposals.completedAt)
                )
              )
              .execute()
          );
        }
        if (onChainProposal.account.state.passed) {
          await usingDb((db) =>
            db
              .update(schema.proposals)
              .set({ status: ProposalStatus.Passed, completedAt: currentTime })
              .where(
                and(
                  eq(
                    schema.proposals.proposalAcct,
                    onChainProposal.publicKey.toString()
                  ),
                  isNull(schema.proposals.completedAt)
                )
              )
              .execute()
          );

          await usingDb((db) =>
            db
              .update(schema.conditionalVaults)
              .set({ status: "finalized" })
              .where(
                eq(
                  schema.conditionalVaults.condVaultAcct,
                  onChainProposal.account.baseVault.toString()
                )
              )
              .execute()
          );

          await usingDb((db) =>
            db
              .update(schema.conditionalVaults)
              .set({ status: "finalized" })
              .where(
                eq(
                  schema.conditionalVaults.condVaultAcct,
                  onChainProposal.account.quoteVault.toString()
                )
              )
              .execute()
          );

          await calculateUserPerformance(onChainProposal);
        }
        if (onChainProposal.account.state.failed) {
          await usingDb((db) =>
            db
              .update(schema.proposals)
              .set({ status: ProposalStatus.Failed, completedAt: currentTime })
              .where(
                and(
                  eq(
                    schema.proposals.proposalAcct,
                    onChainProposal.publicKey.toString()
                  ),
                  isNull(schema.proposals.completedAt)
                )
              )
              .execute()
          );

          await usingDb((db) =>
            db
              .update(schema.conditionalVaults)
              .set({ status: "reverted" })
              .where(
                eq(
                  schema.conditionalVaults.condVaultAcct,
                  onChainProposal.account.baseVault.toString()
                )
              )
              .execute()
          );

          await usingDb((db) =>
            db
              .update(schema.conditionalVaults)
              .set({ status: "reverted" })
              .where(
                eq(
                  schema.conditionalVaults.condVaultAcct,
                  onChainProposal.account.quoteVault.toString()
                )
              )
              .execute()
          );
          await calculateUserPerformance(onChainProposal);
        }

        // check if markets are there, if they aren't insert them
        // Check if markets are there, if they aren't, insert them
        const passAmm = onChainProposal.account.passAmm;
        const failAmm = onChainProposal.account.failAmm;
        if(!passAmm || !failAmm) return Err({ type: AutocratDaoIndexerError.MissingParamError });

        const existingMarkets =
          (await usingDb((db) =>
            db
              .select()
              .from(schema.markets)
              .where(
                or(
                  eq(
                    schema.markets.marketAcct,
                    passAmm.toString()
                  ),
                  eq(
                    schema.markets.marketAcct,
                    failAmm.toString()
                  )
                )
              )
              .execute()
          )) ?? [];

        if (
          !existingMarkets.some(
            (market) =>
              market.marketAcct === passAmm.toString()
          ) ||
          !existingMarkets.some(
            (market) =>
              market.marketAcct === failAmm.toString()
          )
        ) {
          await insertAssociatedAccountsDataForProposal(
            onChainProposal,
            currentTime
          );
          await updateMarketsWithProposal(onChainProposal);
        }
      }

      logger.log("updated proposal and vault states");

      return Ok({ acct: "Update proposal and vault states" });
    } catch (err) {
      logger.error("error with proposal indexer:", err);
      return Err({ type: AutocratDaoIndexerError.GeneralError });
    }
  },

  indexFromLogs: async (logs: string[]) => {
    try {

      //TODO: leaving this here for now, maybe one day we will revisit and do it more efficiently.
      console.log("AutocratProposalIndexer::indexFromLogs::logs", logs);
      // Find the relevant log that contains the proposal data
      const proposalLog = logs.find(log => 
        log.includes("Instruction:") && 
        (log.includes("InitializeProposal") || 
         log.includes("FinalizeProposal") || 
         log.includes("ExecuteProposal"))
      );
      console.log("AutocratProposalIndexer::indexFromLogs::proposalLog", proposalLog);

      if (!proposalLog) {
        console.log("AutocratProposalIndexer::indexFromLogs::proposalLog not found");
        return Err({ type: AutocratDaoIndexerError.MissingParamError });
      }

      // Extract proposal account from logs
      const proposalAcctMatch = logs.find(log => log.includes("Proposal:"));
      if (!proposalAcctMatch) {
        console.log("AutocratProposalIndexer::indexFromLogs::proposalAcctMatch not found");
        return Err({ type: AutocratDaoIndexerError.MissingParamError });
      }

      const proposalAcct = new PublicKey(proposalAcctMatch.split(": ")[1]);
      console.log("AutocratProposalIndexer::indexFromLogs::proposalAcct", proposalAcct);
      
      // Fetch the proposal data since we need the full account data
      const protocolV0_3 = rpcReadClient.futarchyProtocols.find(
        (protocol) => protocol.deploymentVersion == "V0.3"
      );
      
      if (!protocolV0_3) {
        return Err({ type: AutocratDaoIndexerError.MissingProtocolError });
      }

      const proposal = await protocolV0_3.autocrat.account.proposal.fetch(proposalAcct);
      if (!proposal) {
        return Err({ type: AutocratDaoIndexerError.NotFoundError });
      }
      console.log("AutocratProposalIndexer::indexFromLogs::proposal", proposal);

      // Get current slot and time for calculations
      const { currentSlot, currentTime } = (
        await usingDb((db) =>
          db
            .select({
              currentSlot: schema.prices.updatedSlot,
              currentTime: schema.prices.createdAt,
            })
            .from(schema.prices)
            .orderBy(sql`${schema.prices.updatedSlot} DESC`)
            .limit(1)
            .execute()
        )
      )?.[0] ?? {};

      if (!currentSlot || !currentTime) {
        return Err({ type: AutocratDaoIndexerError.MissingParamError });
      }

      // If this is a new proposal, insert associated accounts data
      if (proposalLog.includes("InitializeProposal")) {
        console.log("indexFromLogs::inserting associated accounts data for proposal", proposalAcct);
        // NOTE: The relationship requirement is now  that we must have the markets before the proposal is inserted.
        await insertAssociatedAccountsDataForProposal(
          { publicKey: proposalAcct, account: proposal },
          currentTime
        );
        await upsertProposal({ publicKey: proposalAcct, account: proposal }, currentTime);
        // Once we have the proposal inserted, we go in and update the markets with the proposal.
        await updateMarketsWithProposal({ publicKey: proposalAcct, account: proposal });
      }

      // Handle different proposal states
      if (proposal.state.pending) {
        // Update proposal as pending
        if (!proposalLog.includes("InitializeProposal")) { // If this is a new proposal, we dont need to update the status
          await updateProposalStatus(proposalAcct, ProposalStatus.Pending, currentTime);
        }
      } else if (proposal.state.passed) {
        // Update proposal as passed
        await updateProposalStatus(proposalAcct, ProposalStatus.Passed, currentTime);
        await updateVaultStatuses(proposal.baseVault, proposal.quoteVault, "finalized");
        await calculateUserPerformance({ publicKey: proposalAcct, account: proposal });
      } else if (proposal.state.failed) {
        // Update proposal as failed
        await updateProposalStatus(proposalAcct, ProposalStatus.Failed, currentTime);
        await updateVaultStatuses(proposal.baseVault, proposal.quoteVault, "reverted");
        await calculateUserPerformance({ publicKey: proposalAcct, account: proposal });
      }

      console.log("AutocratProposalIndexer::indexFromLogs::done");
      return Ok({ acct: "Updated proposal from logs" });
    } catch (err) {
      logger.error("error with proposal indexer:", err);
      return Err({ type: AutocratDaoIndexerError.GeneralError });
    }
  }
};

// helper function to upsert proposal
async function upsertProposal(proposal: ProposalAccountWithKey, currentTime: Date) {
  const daoAcct = proposal.account.dao;
  if (!daoAcct) {
    console.log("AutocratProposalIndexer::upsertProposal::daoAcct not found");
    return Err({ type: AutocratDaoIndexerError.MissingParamError });
  }

  // Get DAO details
  const dbDao: DaoRecord | undefined = (
    await usingDb((db) =>
      db
        .select()
        .from(schema.daos)
        .where(eq(schema.daos.daoAcct, daoAcct.toBase58()))
        .execute()
    )
  )?.[0];

  if (!dbDao) return;

  // Calculate end slot
  const initialSlot = proposal.account.slotEnqueued;
  const endSlot = initialSlot.add(new BN(dbDao.slotsPerProposal?.toString()));

  // Prepare proposal record
  const dbProposal: ProposalRecord = {
    proposalAcct: proposal.publicKey.toString(),
    proposalNum: BigInt(proposal.account.number.toString()),
    autocratVersion: 0.3,
    daoAcct: daoAcct.toString(),
    proposerAcct: proposal.account.proposer.toString(),
    status: ProposalStatus.Pending,
    descriptionURL: proposal.account.descriptionUrl,
    initialSlot: initialSlot.toString(),
    passMarketAcct: proposal.account.passAmm?.toString() ?? null,
    failMarketAcct: proposal.account.failAmm?.toString() ?? null,
    baseVault: proposal.account.baseVault.toString(),
    quoteVault: proposal.account.quoteVault.toString(),
    endSlot: endSlot.toString(),
    durationInSlots: dbDao.slotsPerProposal,
    minBaseFutarchicLiquidity: dbDao.minBaseFutarchicLiquidity ?? null,
    minQuoteFutarchicLiquidity: dbDao.minQuoteFutarchicLiquidity ?? null,
    passThresholdBps: dbDao.passThresholdBps,
    twapInitialObservation: dbDao.twapInitialObservation ?? null,
    twapMaxObservationChangePerUpdate: dbDao.twapMaxObservationChangePerUpdate ?? null,
  };

  // Insert or update the proposal
  await usingDb((db) =>
    db
      .insert(schema.proposals)
      .values([dbProposal])
      .onConflictDoUpdate({
        target: [schema.proposals.proposalAcct],
        set: {
          status: dbProposal.status,
          descriptionURL: dbProposal.descriptionURL,
          initialSlot: dbProposal.initialSlot,
          endSlot: dbProposal.endSlot,
          updatedAt: sql`NOW()`,
        },
      })
      .execute()
  );

  return Ok({ acct: "Proposal upserted successfully" });
}

// Helper function to update proposal status
async function updateProposalStatus(
  proposalAcct: PublicKey,
  status: ProposalStatus,
  currentTime: Date
) {
  await usingDb((db) =>
    db
      .update(schema.proposals)
      .set({ 
        status,
        completedAt: status !== ProposalStatus.Pending ? currentTime : null,
        updatedAt: sql`NOW()`
      })
      .where(
        eq(schema.proposals.proposalAcct, proposalAcct.toString())
      )
      .execute()
  );
}

// Helper function to update vault statuses
async function updateVaultStatuses(
  baseVault: PublicKey,
  quoteVault: PublicKey,
  status: "finalized" | "reverted"
) {
  await usingDb((db) =>
    db
      .update(schema.conditionalVaults)
      .set({ status })
      .where(
        or(
          eq(schema.conditionalVaults.condVaultAcct, baseVault.toString()),
          eq(schema.conditionalVaults.condVaultAcct, quoteVault.toString())
        )
      )
      .execute()
  );
}

async function updateMarketsWithProposal(
  proposal: ProposalAccountWithKey,
) {

  if(!proposal.account.passAmm || !proposal.account.failAmm) return Err({ type: AutocratDaoIndexerError.MissingParamError });

  await usingDb((db) =>
    db
      .update(schema.markets)
      .set({
        proposalAcct: proposal.publicKey.toString(),
      })
      .where(
        or(
          eq(schema.markets.marketAcct, proposal.account.passAmm.toString()),
          eq(schema.markets.marketAcct, proposal.account.failAmm.toString())
        )
      )
      .execute()
  );

}

async function insertAssociatedAccountsDataForProposal(
  proposal: ProposalAccountWithKey,
  currentTime: Date
) {

  const daoAcct = proposal.account.dao;
  if(!daoAcct) return Err({ type: AutocratDaoIndexerError.MissingParamError });

  const dao =
    (await usingDb((db) =>
      db
        .select()
        .from(schema.daos)
        .where(eq(schema.daos.daoAcct, daoAcct.toBase58()))
        .execute()
    )) ?? [];

  let daoDetails;
  if (dao.length > 0) {
    const daoId = dao[0].daoId;
    if (daoId) {
      daoDetails = await usingDb((db) =>
        db
          .select()
          .from(schema.daoDetails)
          .where(eq(schema.daoDetails.daoId, daoId))
          .execute()
      );
    }
  }

  const baseTokenMetadata = await enrichTokenMetadata(
    new PublicKey(dao[0].baseAcct),
    provider
  );

  const storedBaseVault = await conditionalVaultClient.getVault(
    proposal.account.baseVault
  );
  const storedQuoteVault = await conditionalVaultClient.getVault(
    proposal.account.quoteVault
  );

  const basePass: PublicKey = storedBaseVault.conditionalOnFinalizeTokenMint;
  const baseFail: PublicKey = storedBaseVault.conditionalOnRevertTokenMint;
  const quotePass: PublicKey = storedQuoteVault.conditionalOnFinalizeTokenMint;
  const quoteFail: PublicKey = storedQuoteVault.conditionalOnRevertTokenMint;

  let baseVault: ConditionalVaultRecord = {
    condVaultAcct: proposal.account.baseVault.toString(),
    settlementAuthority: storedBaseVault.settlementAuthority.toString(),
    underlyingMintAcct: storedBaseVault.underlyingTokenMint.toString(),
    underlyingTokenAcct: storedBaseVault.underlyingTokenAccount.toString(),
    condFinalizeTokenMintAcct: basePass.toString(),
    condRevertTokenMintAcct: baseFail.toString(),
    status: "active",
  };

  let quoteVault: ConditionalVaultRecord = {
    condVaultAcct: proposal.account.quoteVault.toString(),
    settlementAuthority: storedQuoteVault.settlementAuthority.toString(),
    underlyingMintAcct: storedQuoteVault.underlyingTokenMint.toString(),
    underlyingTokenAcct: storedQuoteVault.underlyingTokenAccount.toString(),
    condFinalizeTokenMintAcct: quotePass.toString(),
    condRevertTokenMintAcct: quoteFail.toString(),
    status: "active",
  };

  await usingDb((db) =>
    db
      .insert(schema.conditionalVaults)
      .values([baseVault, quoteVault])
      .onConflictDoNothing()
      .execute()
  );

  let tokensToInsert: TokenRecord[] = [];
  for (const token of [basePass, baseFail, quotePass, quoteFail]) {
    const metadata = await enrichTokenMetadata(token, provider);
    const storedMint = await getMint(provider.connection, token);

    // NOTE: THIS IS ONLY FOR PROPOSALS AND ONLY FOR BASE / QUOTE CONDITIONAL
    const isQuote = [quoteFail, quotePass].includes(token);
    const isFail = [quoteFail, baseFail].includes(token);
    let imageUrl, defaultSymbol, defaultName;

    let passOrFailPrefix = isFail ? "f" : "p";
    // TODO: This MAY have issue with devnet...
    let baseSymbol = isQuote ? "USDC" : baseTokenMetadata.symbol;
    defaultSymbol = passOrFailPrefix + baseSymbol;
    defaultName = `Proposal ${proposal.account.number}: ${defaultSymbol}`;

    if (dao && daoDetails) {
      if (isQuote) {
        // Fail / Pass USDC
        imageUrl = !isFail
          ? "https://imagedelivery.net/HYEnlujCFMCgj6yA728xIw/f38677ab-8ec6-4706-6606-7d4e0a3cfc00/public"
          : "https://imagedelivery.net/HYEnlujCFMCgj6yA728xIw/d9bfd8de-2937-419a-96f6-8d6a3a76d200/public";
      } else {
        // Base Token
        imageUrl = isFail
          ? daoDetails[0].fail_token_image_url
          : daoDetails[0].pass_token_image_url;
      }
    }
    let tokenToInsert: TokenRecord = {
      symbol:
        metadata.name && !metadata.isFallback ? metadata.symbol : defaultSymbol,
      name: metadata.name && !metadata.isFallback ? metadata.name : defaultName,
      decimals: metadata.decimals,
      mintAcct: token.toString(),
      supply: storedMint.supply.toString(),
      imageUrl: imageUrl ? imageUrl : "",
      updatedAt: currentTime,
    };
    tokensToInsert.push(tokenToInsert);
  }

  await usingDb((db) =>
    db
      .insert(schema.tokens)
      .values(tokensToInsert)
      .onConflictDoNothing()
      .execute()
  );

  let tokenAcctsToInsert: TokenAcctRecord[] = [];
  for (const [mint, owner] of [
    [basePass, proposal.account.passAmm],
    [baseFail, proposal.account.failAmm],
    [quotePass, proposal.account.passAmm],
    [quoteFail, proposal.account.failAmm],
  ]) {
    if(!mint || !owner) continue;
    let tokenAcct: TokenAcctRecord = {
      mintAcct: mint.toString(),
      updatedAt: currentTime,
      tokenAcct: getAssociatedTokenAddressSync(mint, owner, true).toString(),
      ownerAcct: owner.toString(),
      amount: await getAccount(
        provider.connection,
        getAssociatedTokenAddressSync(mint, owner, true)
      ).then((account) => account.amount.toString()),
    };
    tokenAcctsToInsert.push(tokenAcct);
  }

  await usingDb((db) =>
    db
      .insert(schema.tokenAccts)
      .values(tokenAcctsToInsert)
      .onConflictDoNothing()
      .execute()
  );

  if(!proposal.account.passAmm || !proposal.account.failAmm) return Err({ type: AutocratDaoIndexerError.MissingParamError });

  // NOTE: Took out the proposalAcct from the market record as it is now a foreign key
  let passMarket: MarketRecord = {
    marketAcct: proposal.account.passAmm.toString(),
    marketType: MarketType.FUTARCHY_AMM,
    createTxSig: "",
    baseMintAcct: storedBaseVault.conditionalOnFinalizeTokenMint.toString(),
    quoteMintAcct: storedQuoteVault.conditionalOnFinalizeTokenMint.toString(),
    baseLotSize: "1",
    quoteLotSize: "1",
    quoteTickSize: "1",
    bidsTokenAcct: getAssociatedTokenAddressSync(
      quotePass,
      proposal.account.passAmm,
      true
    ).toString(),
    asksTokenAcct: getAssociatedTokenAddressSync(
      basePass,
      proposal.account.passAmm,
      true
    ).toString(),
    baseMakerFee: 0,
    baseTakerFee: 100,
    quoteMakerFee: 0,
    quoteTakerFee: 100,
  };

  let failMarket: MarketRecord = {
    marketAcct: proposal.account.failAmm.toString(),
    marketType: MarketType.FUTARCHY_AMM,
    createTxSig: "",
    baseMintAcct: storedBaseVault.conditionalOnRevertTokenMint.toString(),
    quoteMintAcct: storedQuoteVault.conditionalOnRevertTokenMint.toString(),
    baseLotSize: "1",
    quoteLotSize: "1",
    quoteTickSize: "1",
    bidsTokenAcct: getAssociatedTokenAddressSync(
      quoteFail,
      proposal.account.failAmm,
      true
    ).toString(),
    asksTokenAcct: getAssociatedTokenAddressSync(
      baseFail,
      proposal.account.failAmm,
      true
    ).toString(),
    baseMakerFee: 0,
    baseTakerFee: 100,
    quoteMakerFee: 0,
    quoteTakerFee: 100,
  };

  await usingDb((db) =>
    db
      .insert(schema.markets)
      .values([passMarket, failMarket])
      .onConflictDoNothing()
      .execute()
  );
}

async function calculateUserPerformance(
  onChainProposal: ProposalAccountWithKey
) {
  const quoteTokens = alias(schema.tokens, "quote_tokens"); // NOTE: This should be USDC for now
  const baseTokens = alias(schema.tokens, "base_tokens");
  // calculate performance
  const [proposal] =
    (await usingDb((db) => {
      return db
        .select()
        .from(schema.proposals)
        .where(
          eq(
            schema.proposals.proposalAcct,
            onChainProposal.publicKey.toString()
          )
        )
        .leftJoin(
          schema.daos,
          eq(schema.proposals.daoAcct, schema.daos.daoAcct)
        )
        .leftJoin(quoteTokens, eq(schema.daos.quoteAcct, quoteTokens.mintAcct))
        .leftJoin(baseTokens, eq(schema.daos.baseAcct, baseTokens.mintAcct))
        .limit(1)
        .execute();
    })) ?? [];

  if (!proposal) return;

  const { proposals, daos, quote_tokens, base_tokens } = proposal;

  let proposalDaoAcct = daos?.daoAcct;

  if (!proposals) return;

  if (!proposalDaoAcct) {
    proposalDaoAcct = proposals.daoAcct;
  }

  if (!proposalDaoAcct) {
    console.error("No daoAcct found");
  }

  const allOrders =
    (await usingDb((db) => {
      return db
        .select()
        .from(schema.orders)
        .where(
          inArray(schema.orders.marketAcct, [
            proposals.passMarketAcct,
            proposals.failMarketAcct,
          ])
        )
        .execute();
    })) ?? [];

  // Get the time for us to search across the price space for spot
  const proposalFinalizedAt = proposals.completedAt ?? new Date();
  const proposalFinalizedAtMinus2Minutes = new Date(proposalFinalizedAt);
  proposalFinalizedAtMinus2Minutes.setMinutes(
    proposalFinalizedAt.getMinutes() - 2
  );

  const resolvingMarket =
    proposals.status === ProposalStatus.Passed
      ? proposals.passMarketAcct
      : proposals.failMarketAcct;
  // TODO: Get spot price at proposal finalization or even current spot price
  // if the proposal is still active (this would be UNREALISED P&L)
  // TODO: If this is 0 we really need to throw and error and alert someone, we shouldn't have missing spot data
  const spotPrice =
    (await usingDb((db) => {
      return db
        .select()
        .from(schema.prices)
        .where(
          and(
            eq(schema.prices.marketAcct, base_tokens.mintAcct),
            lte(schema.prices.createdAt, proposalFinalizedAt),
            gt(schema.prices.createdAt, proposalFinalizedAtMinus2Minutes)
          )
        )
        .limit(1)
        .orderBy(desc(schema.prices.createdAt))
        .execute();
    })) ?? [];

  let actors = allOrders.reduce((current, next) => {
    const actor = next.actorAcct;
    let totals = current.get(actor);

    if (!totals) {
      totals = <UserPerformanceTotals>{
        tokensBought: 0, // Aggregate value for reporting
        tokensSold: 0,
        volumeBought: 0,
        volumeSold: 0,
        tokensBoughtResolvingMarket: 0, // P/F market buy quantity
        tokensSoldResolvingMarket: 0, // P/F market sell quantity
        volumeBoughtResolvingMarket: 0, // P/F market buy volume
        volumeSoldResolvingMarket: 0, // P/F market sell volume
        buyOrderCount: 0,
        sellOrderCount: 0,
      };
    }

    // Token Decimals used for nomalizing results
    const baseTokenDecimals = base_tokens?.decimals;
    const quoteTokenDecimals = quote_tokens?.decimals ?? 6; // NOTE: Safe for now

    if (!baseTokenDecimals || !quoteTokenDecimals) {
      return current;
    }

    // Debatable size or quantity, often used interchangably
    const size = PriceMath.getHumanAmount(
      new BN(next.filledBaseAmount),
      baseTokenDecimals
    );

    // Amount or notional
    const amount = Number(next.quotePrice).valueOf() * size;

    // Buy Side
    if (next.side === "BID") {
      totals.tokensBought = totals.tokensBought + size;
      totals.volumeBought = totals.volumeBought + amount;
      totals.buyOrderCount = totals.buyOrderCount + 1;
      // If this is the resolving market then we want to keep a running tally for that for P&L
      if (next.marketAcct === resolvingMarket) {
        totals.tokensBoughtResolvingMarket =
          totals.tokensBoughtResolvingMarket + size;
        totals.volumeBoughtResolvingMarket =
          totals.volumeBoughtResolvingMarket + amount;
      }
      // Sell Side
    } else if (next.side === "ASK") {
      totals.tokensSold = totals.tokensSold + size;
      totals.volumeSold = totals.volumeSold + amount;
      totals.sellOrderCount = totals.sellOrderCount + 1;
      // If this is the resolving market then we want to keep a running tally for that for P&L
      if (next.marketAcct === resolvingMarket) {
        totals.tokensSoldResolvingMarket =
          totals.tokensSoldResolvingMarket + size;
        totals.volumeSoldResolvingMarket =
          totals.volumeSoldResolvingMarket + amount;
      }
    }

    current.set(actor, totals);

    return current;
  }, new Map<string, UserPerformanceTotals>());

  const toInsert: Array<UserPerformanceRecord> = Array.from(
    actors.entries()
  ).map<UserPerformanceRecord>((k) => {
    const [actor, values] = k;

    // NOTE: this gets us the delta, whereas we need to know the direction at the very end
    const tradeSizeDelta = Math.abs(
      values.tokensBoughtResolvingMarket - values.tokensSoldResolvingMarket
    );

    // NOTE: Directionally orients our last leg
    const needsSellToExit =
      values.tokensBoughtResolvingMarket > values.tokensSoldResolvingMarket; // boolean

    // We need to complete the round trip / final leg
    if (tradeSizeDelta !== 0) {
      // TODO: This needs to be revised given the spot price can't be null or 0 if we want to really do this
      const lastLegNotional =
        tradeSizeDelta * Number(spotPrice[0]?.price ?? "0");

      if (needsSellToExit) {
        // We've bought more than we've sold, therefore when we exit the position calulcation
        // we need to count the remaining volume as a sell at spot price when conditional
        // market is finalized.
        values.volumeSoldResolvingMarket =
          values.volumeSoldResolvingMarket + lastLegNotional;
      } else {
        values.volumeBoughtResolvingMarket =
          values.volumeBoughtResolvingMarket + lastLegNotional;
      }
    }

    return <UserPerformanceRecord>{
      proposalAcct: onChainProposal.publicKey.toString(),
      daoAcct: proposalDaoAcct,
      userAcct: actor,
      tokensBought: values.tokensBought.toString(),
      tokensSold: values.tokensSold.toString(),
      volumeBought: values.volumeBought.toString(),
      volumeSold: values.volumeSold.toString(),
      tokensBoughtResolvingMarket:
        values.tokensBoughtResolvingMarket.toString(),
      tokensSoldResolvingMarket: values.tokensSoldResolvingMarket.toString(),
      volumeBoughtResolvingMarket:
        values.volumeBoughtResolvingMarket.toString(),
      volumeSoldResolvingMarket: values.volumeSoldResolvingMarket.toString(),
      buyOrdersCount: values.buyOrderCount as unknown as bigint,
      sellOrdersCount: values.sellOrderCount as unknown as bigint,
    };
  });

  if (toInsert.length > 0) {
    await usingDb((db) => {
      return db.transaction(async (tx) => {
        await tx
          .insert(schema.users)
          .values(
            toInsert.map((i) => {
              return {
                userAcct: i.userAcct,
              };
            })
          )
          .onConflictDoNothing();

        await Promise.all(
          toInsert.map(async (insert) => {
            try {
              await tx
                .insert(schema.userPerformance)
                .values(insert)
                .onConflictDoUpdate({
                  target: [
                    schema.userPerformance.proposalAcct,
                    schema.userPerformance.userAcct,
                  ],
                  set: {
                    tokensBought: insert.tokensBought,
                    tokensSold: insert.tokensSold,
                    volumeBought: insert.volumeBought,
                    volumeSold: insert.volumeSold,
                    tokensBoughtResolvingMarket:
                      insert.tokensBoughtResolvingMarket,
                    tokensSoldResolvingMarket: insert.tokensSoldResolvingMarket,
                    volumeBoughtResolvingMarket:
                      insert.volumeBoughtResolvingMarket,
                    volumeSoldResolvingMarket: insert.volumeSoldResolvingMarket,
                    buyOrdersCount: insert.buyOrdersCount,
                    sellOrdersCount: insert.sellOrdersCount,
                  },
                });
            } catch (e) {
              logger.error("error inserting user_performance record", e);
            }
          })
        );
      });
    });
  }
}

