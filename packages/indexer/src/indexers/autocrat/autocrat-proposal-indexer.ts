import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import {
  rpcReadClient,
  conditionalVaultClient,
  provider,
  connection,
} from "../../connection";
import { usingDb, schema, eq, and, isNull } from "@metadaoproject/indexer-db";
import { Err, Ok } from "../../match";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
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
import { InstructionDecoder, enrichTokenMetadata, findFinalizeProposalTransaction, getDisplayName } from "@metadaoproject/futarchy-sdk";
import { BN } from "@coral-xyz/anchor";
import { gte } from "drizzle-orm";
import { desc } from "drizzle-orm/sql";

export enum AutocratDaoIndexerError {
  GeneralError = "GeneralError",
  DuplicateError = "DuplicateError",
  MissingParamError = "MissingParamError",
  NotFoundError = "NotFoundError",
  MissingChainResponseError = "MissingChainResponseError",
  NothingToInsertError = "NothingToInsertError",
}

export const AutocratProposalIndexer: IntervalFetchIndexer = {
  cronExpression: "30 * * * * *",
  index: async () => {

    try {
      const { currentSlot, currentTime } = (
        await usingDb((db) =>
          db
            .select({ currentSlot: schema.prices.updatedSlot, currentTime: schema.prices.createdAt })
            .from(schema.prices)
            .orderBy(desc(schema.prices.updatedSlot))
            .limit(1)
            .execute()
        )
      )[0];

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

        const formattedIx: TransactionInstruction = {
          ...proposal.account.instruction,
          keys: proposal.account.instruction.accounts,
        };
        const decoder = new InstructionDecoder(formattedIx, provider);
        const ix = await decoder.decodeInstruction();

        const dbFinalizeInstruction = {
          proposalAcct: proposal.publicKey.toString(),
          programId: proposal.account.instruction.programId.toString(),
          name: ix?.name,
          displayName: getDisplayName(ix?.name),
          rawData: formattedIx.data.toString('hex')
        };

        const ret = await usingDb((db) =>
          db.insert(schema.finalizeInstructions)
            .values([dbFinalizeInstruction])
            .onConflictDoNothing()
            .returning({ instructionId: schema.finalizeInstructions.instructionId })
            .execute()
        )
        const instructionId = ret[0].instructionId;
        const accounts = formattedIx.keys.map((account) => ({
          ...account,
          pubkey: account.pubkey.toString(),
          instructionId: instructionId
        }));

        await usingDb((db) =>
          db.insert(schema.finalizeInstructionAccounts)
            .values(accounts)
            .onConflictDoNothing()
            .execute()
        )

        if (ix?.args) {
          const args = ix.args.map((arg) => ({
            ...arg,
            instructionId: instructionId
          }))

          await usingDb((db) =>
            db.insert(schema.finalizeInstructionArgs)
              .values(args)
              .onConflictDoNothing()
              .execute()
          )
        }

        if (dbFinalizeInstruction.displayName == "Memo") {
          await usingDb((db) => db
            .insert(schema.finalizeMemoInstructionData)
            .values([{
              instructionId: instructionId,
              message: ix!!.args[0].data
            }])
            .onConflictDoNothing()
            .execute())
        }
        else if (ix?.name == "burn") {
          const account = await getAccount(connection, ix!!.accounts.find(a => a.name == "Account")?.pubkey!!)

          await usingDb((db) => db
            .insert(schema.finalizeTokenInstructionData)
            .values([{
              instructionId: instructionId,
              source: account.owner.toString(),
              mint: account.mint.toString(),
              amount: BigInt(ix.args[0].data)
            }])
            .onConflictDoNothing()
            .execute()
          )
        }
        else if (ix?.name == "transfer" || ix?.name == "transferChecked") {
          const fromAccount = await getAccount(connection, ix.accounts.find(a => a.name == "Source")?.pubkey!!)
          const toAccount = await getAccount(connection, ix.accounts.find(a => a.name == "Destination")?.pubkey!!)

          const mint = ix.accounts.find((a) => a.name == "Mint")?.pubkey.toString() || fromAccount.mint.toString()

          await usingDb((db) => db
            .insert(schema.finalizeTokenInstructionData)
            .values([{
              instructionId: instructionId,
              source: fromAccount.owner.toString(),
              destination: toAccount.owner.toString(),
              mint: mint,
              amount: BigInt(ix.args[0].data)
            }])
            .onConflictDoNothing()
            .execute()
          )
        }
        else if (ix?.name == "multiTransfer4" || ix?.name == "multiTransfer2") {
          const fromAccount0 = await getAccount(connection, ix.accounts.find(a => a.name == "From0")?.pubkey!!)
          const toAccount0 = await getAccount(connection, ix.accounts.find(a => a.name == "To0")?.pubkey!!)

          const fromAccount1 = await getAccount(connection, ix.accounts.find(a => a.name == "From1")?.pubkey!!)
          const toAccount1 = await getAccount(connection, ix.accounts.find(a => a.name == "To1")?.pubkey!!)

          await usingDb((db) => db
            .insert(schema.finalizeTokenInstructionData)
            .values([{
              instructionId: instructionId,
              source: fromAccount0.owner.toString(),
              destination: toAccount0.owner.toString(),
              mint: fromAccount0.mint.toString(),
            },
            {
              instructionId: instructionId,
              source: fromAccount1.owner.toString(),
              destination: toAccount1.owner.toString(),
              mint: fromAccount1.mint.toString(),
            },
            ])
            .onConflictDoNothing()
            .execute()
          )

          if (ix.name == "multiTransfer4") {
            const fromAccount2 = await getAccount(connection, ix.accounts.find(a => a.name == "From2")?.pubkey!!)
            const toAccount2 = await getAccount(connection, ix.accounts.find(a => a.name == "To2")?.pubkey!!)

            const fromAccount3 = await getAccount(connection, ix.accounts.find(a => a.name == "From3")?.pubkey!!)
            const toAccount3 = await getAccount(connection, ix.accounts.find(a => a.name == "To3")?.pubkey!!)

            await usingDb((db) => db
              .insert(schema.finalizeTokenInstructionData)
              .values([{
                instructionId: instructionId,
                source: fromAccount2.owner.toString(),
                destination: toAccount2.owner.toString(),
                mint: fromAccount2.mint.toString(),
              },
              {
                instructionId: instructionId,
                source: fromAccount3.owner.toString(),
                destination: toAccount3.owner.toString(),
                mint: fromAccount3.mint.toString(),
              },
              ])
              .onConflictDoNothing()
              .execute()
            )
          }
        }

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
        if (onChainProposal.account.state.pending) {
          await usingDb((db) =>
            db
              .update(schema.proposals)
              .set({ endedAt: currentTime })
              .where(
                and(
                  eq(
                    schema.proposals.proposalAcct,
                    onChainProposal.publicKey.toString()
                  ),
                  gte(schema.proposals.endSlot, BigInt(currentSlot)),
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

          const instructionHasSig = (await usingDb((db) =>
            db
              .select()
              .from(schema.finalizeInstructions)
              .where(
                and(
                  eq(schema.finalizeInstructions.proposalAcct, onChainProposal.publicKey.toString()),
                  isNull(schema.finalizeInstructions.signature)
                )
              )
              .execute()
          )).length > 0;
          
          if (!instructionHasSig) {
            const signature = await findFinalizeProposalTransaction({ connection, proposal: onChainProposal.publicKey })
            await usingDb((db) =>
              db.update(schema.finalizeInstructions)
                .set({ signature: signature })
                .where(
                  and(
                    eq(schema.finalizeInstructions.proposalAcct, onChainProposal.publicKey.toString()),
                    isNull(schema.finalizeInstructions.signature)
                  )
                )
                .execute()
            )
          }
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
      }

      console.log("updated proposal and vault states");

      return Ok({ acct: "urmom" });
    } catch (err) {
      console.error(err);
      return Err({ type: AutocratDaoIndexerError.GeneralError });
    }
  },
};
