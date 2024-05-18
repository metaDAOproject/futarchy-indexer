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

export const AutocratProposalIndexer: IntervalFetchIndexer = {
  intervalMs: 30000,
  index: async () => {
    try {
      console.log("Autocrat proposal indexer");
      const dbProposals: ProposalRecord[] = await usingDb((db) =>
        db.select().from(schema.proposals).execute()
      );

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

          let tokenToInsert: TokenRecord = {
            symbol: metadata.symbol,
            name: metadata.name ? metadata.name : metadata.symbol,
            decimals: metadata.decimals,
            mintAcct: token.toString(),
            supply: storedMint.supply,
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
        console.log('inserted token accounts');

        let dbDao: DaoRecord = (await usingDb((db) =>
          db.select().from(schema.daos).where(eq(schema.daos.daoAcct, proposal.account.dao.toString())).execute()
        ))[0];

        let dbProposal: ProposalRecord = {
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
          endSlot: BigInt(proposal.account.slotEnqueued.add(new BN(dbDao.slotsPerProposal?.toString())).toString()),
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

      return Ok({ acct: "urmom" });
    } catch (err) {
      console.error(err);
      return Err({ type: AutocratDaoIndexerError.GeneralError });
    }
  },
};
