import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import {
  rpcReadClient,
  conditionalVaultClient,
  provider,
} from "../../connection";
import { usingDb, schema, eq } from "@metadaoproject/indexer-db";
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
import { enrichTokenMetadata } from "@metadaoproject/futarchy-sdk";
import { BN } from "@coral-xyz/anchor";

export enum AutocratDaoIndexerError {
  GeneralError = "GeneralError",
  DuplicateError = "DuplicateError",
  MissingParamError = "MissingParamError",
  NotFoundError = "NotFoundError",
  MissingChainResponseError = "MissingChainResponseError",
  NothingToInsertError = "NothingToInsertError",
}

const SLOTS_TO_DAYS: Record<string, number> = {
  "648000": 3,
  "2160000": 10,
  "1080000": 5,
};

//TODO we want to make an RPC call for the block time and use that as the createdAt
// then cascade that by using slots per proposal times 4000 ms
export const AutocratProposalIndexer: IntervalFetchIndexer = {
  cronExpression: "30 * * * * *",
  index: async () => {
    try {
      console.log("Autocrat proposal indexer");
      const dbProposals: ProposalRecord[] = await usingDb((db) =>
        db.select().from(schema.proposals).execute()
      );

      for (const dbProposal of dbProposals) {
        const dao = (
          await usingDb((db) =>
            db
              .select()
              .from(schema.daos)
              .where(eq(schema.daos.daoAcct, dbProposal.daoAcct))
              .execute()
          )
        )[0];
        if (
          !dbProposal.endedAt &&
          dbProposal.createdAt &&
          dao.slotsPerProposal
        ) {
          // we can update endedAt since we don't have it yet
          const endedAtDate = dbProposal.createdAt;
          endedAtDate.setDate(
            dbProposal.createdAt?.getDate() +
              SLOTS_TO_DAYS[dao.slotsPerProposal.toString()]
          );
          await usingDb((db) =>
            db
              .update(schema.proposals)
              .set({ endedAt: endedAtDate })
              .where(eq(schema.proposals.proposalAcct, dbProposal.proposalAcct))
              .execute()
          );
        }
      }

      let protocolV0_3 = rpcReadClient.futarchyProtocols.find(
        (protocol) => protocol.deploymentVersion == "V0.3"
      );

      const onChainProposals =
        await protocolV0_3?.autocrat.account.proposal.all()!!;

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

      console.log("Proposals to insert");
      console.log(
        proposalsToInsert.map((proposal) => proposal.publicKey.toString())
      );

      proposalsToInsert.map(async (proposal) => {
        // TODO: Refactor this as we only need to fetch it once if it's the same in the proposal....
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
                ? "https://imagedelivery.net/HYEnlujCFMCgj6yA728xIw/6b1ce817-861f-4980-40ca-b55f28f21400/public"
                : "https://imagedelivery.net/HYEnlujCFMCgj6yA728xIw/f236a0ca-5d7c-4f4a-ca8a-52eb9d72ef00/public";
            } else {
              // Base Token
              imageUrl = isFail
                ? daoDetails[0].fail_token_image_url
                : daoDetails[0].pass_token_image_url;
            }
          }
          let tokenToInsert: TokenRecord = {
            symbol: metadata.name ? metadata.symbol : defaultSymbol,
            name: metadata.name ? metadata.name : defaultName,
            decimals: metadata.decimals,
            mintAcct: token.toString(),
            supply: storedMint.supply,
            imageUrl: imageUrl ? imageUrl : "",
            updatedAt: new Date(),
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
            updatedAt: new Date(),
            tokenAcct: getAssociatedTokenAddressSync(
              mint,
              owner,
              true
            ).toString(),
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
        console.log("inserted token accounts");

        let dbDao: DaoRecord = (
          await usingDb((db) =>
            db
              .select()
              .from(schema.daos)
              .where(eq(schema.daos.daoAcct, proposal.account.dao.toString()))
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

        let passMarket: MarketRecord = {
          marketAcct: proposal.account.passAmm.toString(),
          proposalAcct: proposal.publicKey.toString(),
          marketType: MarketType.FUTARCHY_AMM,
          createTxSig: "",
          baseMintAcct:
            storedBaseVault.conditionalOnFinalizeTokenMint.toString(),
          quoteMintAcct:
            storedQuoteVault.conditionalOnFinalizeTokenMint.toString(),
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
          quoteMintAcct:
            storedQuoteVault.conditionalOnRevertTokenMint.toString(),
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
      });

      console.log("inserted proposals");

      for (const onChainProposal of onChainProposals) {
        if (onChainProposal.account.state.passed) {
          await usingDb((db) =>
            db
              .update(schema.proposals)
              .set({ status: ProposalStatus.Passed })
              .where(
                eq(
                  schema.proposals.proposalAcct,
                  onChainProposal.publicKey.toString()
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
              .set({ status: ProposalStatus.Failed })
              .where(
                eq(
                  schema.proposals.proposalAcct,
                  onChainProposal.publicKey.toString()
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
      }

      console.log("updated proposal and vault states");

      return Ok({ acct: "urmom" });
    } catch (err) {
      console.error(err);
      return Err({ type: AutocratDaoIndexerError.GeneralError });
    }
  },
};
