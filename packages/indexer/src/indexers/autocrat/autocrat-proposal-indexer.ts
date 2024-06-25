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
  and,
  isNull,
  sql,
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
import { gte } from "drizzle-orm";
import { desc } from "drizzle-orm/sql";
import { logger } from "../../logger";

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
      const { currentSlot, currentTime } = (
        await usingDb((db) =>
          db
            .select({
              currentSlot: schema.prices.updatedSlot,
              currentTime: schema.prices.createdAt,
            })
            .from(schema.prices)
            .orderBy(desc(schema.prices.updatedSlot))
            .limit(1)
            .execute()
        )
      )[0];

      logger.log("Autocrat proposal indexer");
      const dbProposals: ProposalRecord[] = await usingDb((db) =>
        db.select().from(schema.proposals).execute()
      );

      const protocolV0_3 = rpcReadClient.futarchyProtocols.find(
        (protocol) => protocol.deploymentVersion == "V0.3"
      );

      const onChainProposals =
        (await protocolV0_3?.autocrat.account.proposal.all()!!) as ProposalAccountWithKey[];

      const proposalsToInsert = [];
      for (const proposal of onChainProposals) {
        if (
          !dbProposals.find((dbProposal) =>
            new PublicKey(dbProposal.proposalAcct).equals(proposal.publicKey)
          )
        ) {
          proposalsToInsert.push(proposal);
        }
      }

      logger.log("Proposals to insert");
      logger.log(
        proposalsToInsert.map((proposal) => proposal.publicKey.toString())
      );

      proposalsToInsert.map(async (proposal) => {
        const dbDao: DaoRecord = (
          await usingDb((db) =>
            db
              .select()
              .from(schema.daos)
              .where(eq(schema.daos.daoAcct, proposal.account.dao.toBase58()))
              .execute()
          )
        )[0];
        const dbProposal: ProposalRecord = {
          proposalAcct: proposal.publicKey.toString(),
          proposalNum: BigInt(proposal.account.number.toString()),
          autocratVersion: 0.3,
          daoAcct: proposal.account.dao.toString(),
          proposerAcct: proposal.account.proposer.toString(),
          status: ProposalStatus.Pending,
          descriptionURL: proposal.account.descriptionUrl,
          initialSlot: BigInt(proposal.account.slotEnqueued.toString()),
          passMarketAcct: proposal.account.passAmm.toString(),
          failMarketAcct: proposal.account.failAmm.toString(),
          baseVault: proposal.account.baseVault.toString(),
          quoteVault: proposal.account.quoteVault.toString(),
          endSlot: BigInt(
            proposal.account.slotEnqueued
              .add(new BN(dbDao.slotsPerProposal?.toString()))
              .toString()
          ),
        };

        await usingDb((db) =>
          db
            .insert(schema.proposals)
            .values([dbProposal])
            .onConflictDoNothing()
            .execute()
        );
        await insertAssociatedAccountsDataForProposal(proposal, currentTime);
      });

      logger.log("inserted proposals");

      for (const onChainProposal of onChainProposals) {
        if (onChainProposal.account.state.pending) {
          const dbDao: DaoRecord = (
            await usingDb((db) =>
              db
                .select()
                .from(schema.daos)
                .where(
                  eq(
                    schema.daos.daoAcct,
                    onChainProposal.account.dao.toBase58()
                  )
                )
                .execute()
            )
          )[0];

          const slotDifference = onChainProposal.account.slotEnqueued
            .add(new BN(dbDao.slotsPerProposal?.toString()))
            .sub(new BN(currentSlot));

          const lowHoursEstimate = Math.floor(
            (slotDifference.toNumber() * 400) / 1000 / 60 / 60
          );

          const endedAt = new Date(currentTime.toLocaleString());
          endedAt.setHours(endedAt.getHours() + lowHoursEstimate);

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
                initialSlot: BigInt(
                  onChainProposal.account.slotEnqueued.toString()
                ),
                endSlot: BigInt(
                  onChainProposal.account.slotEnqueued
                    .add(new BN(dbDao.slotsPerProposal?.toString()))
                    .toString()
                ),
                updatedAt: sql`NOW()`,
              })
              .where(
                and(
                  eq(
                    schema.proposals.proposalAcct,
                    onChainProposal.publicKey.toString()
                  ),
                  gte(schema.proposals.endSlot, currentSlot),
                  isNull(schema.proposals.endedAt)
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
        }

        // check if markets are there, if they aren't insert them
        // Check if markets are there, if they aren't, insert them
        const existingMarkets = await usingDb((db) =>
          db
            .select()
            .from(schema.markets)
            .where(
              or(
                eq(
                  schema.markets.marketAcct,
                  onChainProposal.account.passAmm.toString()
                ),
                eq(
                  schema.markets.marketAcct,
                  onChainProposal.account.failAmm.toString()
                )
              )
            )
            .execute()
        );

        if (
          !existingMarkets.some(
            (market) =>
              market.marketAcct === onChainProposal.account.passAmm.toString()
          ) ||
          !existingMarkets.some(
            (market) =>
              market.marketAcct === onChainProposal.account.failAmm.toString()
          )
        ) {
          await insertAssociatedAccountsDataForProposal(
            onChainProposal,
            currentTime
          );
        }
      }

      logger.log("updated proposal and vault states");

      return Ok({ acct: "urmom" });
    } catch (err) {
      logger.error("error with proposal indexer:", err);
      return Err({ type: AutocratDaoIndexerError.GeneralError });
    }
  },
};

async function insertAssociatedAccountsDataForProposal(
  proposal: ProposalAccountWithKey,
  currentTime: Date
) {
  const dao = await usingDb((db) =>
    db
      .select()
      .from(schema.daos)
      .where(eq(schema.daos.daoAcct, proposal.account.dao.toBase58()))
      .execute()
  );

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
        imageUrl = isFail
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
      supply: storedMint.supply,
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
    let tokenAcct: TokenAcctRecord = {
      mintAcct: mint.toString(),
      updatedAt: currentTime,
      tokenAcct: getAssociatedTokenAddressSync(mint, owner, true).toString(),
      ownerAcct: owner.toString(),
      amount: await getAccount(
        provider.connection,
        getAssociatedTokenAddressSync(mint, owner, true)
      ).then((account) => account.amount),
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

  for (const [mint, owner] of [
    [basePass, proposal.account.passAmm],
    [baseFail, proposal.account.failAmm],
    [quotePass, proposal.account.passAmm],
    [quoteFail, proposal.account.failAmm],
  ]) {
    let tokenAcct: TokenAcctRecord = {
      mintAcct: mint.toString(),
      updatedAt: currentTime,
      tokenAcct: getAssociatedTokenAddressSync(mint, owner, true).toString(),
      ownerAcct: owner.toString(),
      amount: await getAccount(
        provider.connection,
        getAssociatedTokenAddressSync(mint, owner, true)
      ).then((account) => account.amount),
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

  let passMarket: MarketRecord = {
    marketAcct: proposal.account.passAmm.toString(),
    proposalAcct: proposal.publicKey.toString(),
    marketType: MarketType.FUTARCHY_AMM,
    createTxSig: "",
    baseMintAcct: storedBaseVault.conditionalOnFinalizeTokenMint.toString(),
    quoteMintAcct: storedQuoteVault.conditionalOnFinalizeTokenMint.toString(),
    baseLotSize: 1n,
    quoteLotSize: 1n,
    quoteTickSize: 1n,
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
    proposalAcct: proposal.publicKey.toString(),
    marketType: MarketType.FUTARCHY_AMM,
    createTxSig: "",
    baseMintAcct: storedBaseVault.conditionalOnRevertTokenMint.toString(),
    quoteMintAcct: storedQuoteVault.conditionalOnRevertTokenMint.toString(),
    baseLotSize: 1n,
    quoteLotSize: 1n,
    quoteTickSize: 1n,
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
