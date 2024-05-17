import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import { rpcReadClient, conditionalVaultClient } from "../../connection";
import { usingDb, schema } from "@metadaoproject/indexer-db";
import { Err, Ok } from "../../match";
import { PublicKey } from "@solana/web3.js";
import {
  ConditionalVaultRecord,
  ProposalRecord,
} from "@metadaoproject/indexer-db/lib/schema";

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

      const onChainProposals = await protocolV0_3?.autocrat.account.proposal.all()!!;

      const proposalsToInsert = [];
      for (const proposal of onChainProposals) {
        if (!dbProposals.find((dbProposal) => new PublicKey(dbProposal.proposalAcct).equals(proposal.publicKey))) {
          proposalsToInsert.push(proposal);
        }
      }

      console.log("Proposals to insert");
      console.log(proposalsToInsert.map((proposal) => proposal.publicKey.toString()));

      proposalsToInsert.map(async (proposal) => {
        const storedBaseVault = await conditionalVaultClient.getVault(proposal.account.baseVault);
        const storedQuoteVault = await conditionalVaultClient.getVault(proposal.account.quoteVault);

        let baseVault: ConditionalVaultRecord = {
          condVaultAcct: proposal.account.baseVault.toString(),
          settlementAuthority: storedBaseVault.settlementAuthority.toString(),
          underlyingMintAcct: storedBaseVault.underlyingTokenMint.toString(),
          underlyingTokenAcct: storedBaseVault.underlyingTokenAccount.toString(),
          condFinalizeTokenMintAcct: storedBaseVault.conditionalOnFinalizeTokenMint.toString(),
          condRevertTokenMintAcct: storedBaseVault.conditionalOnRevertTokenMint.toString(),
          status: "active"
        };

        let quoteVault: ConditionalVaultRecord = {
          condVaultAcct: proposal.account.quoteVault.toString(),
          settlementAuthority: storedQuoteVault.settlementAuthority.toString(),
          underlyingMintAcct: storedQuoteVault.underlyingTokenMint.toString(),
          underlyingTokenAcct: storedQuoteVault.underlyingTokenAccount.toString(),
          condFinalizeTokenMintAcct: storedQuoteVault.conditionalOnFinalizeTokenMint.toString(),
          condRevertTokenMintAcct: storedQuoteVault.conditionalOnRevertTokenMint.toString(),
          status: "active"
        };

        await usingDb((db) =>
          db.insert(schema.conditionalVaults).values([baseVault, quoteVault]).onConflictDoNothing().execute()
        );
      });

      return Ok({ acct: "urmom" });
    } catch (err) {
      console.error(err);
      return Err({ type: AutocratDaoIndexerError.GeneralError });
    }
  },
};
