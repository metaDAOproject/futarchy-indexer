import { IndexerImplementation } from "@metadaoproject/indexer-db/lib/schema";
import { PublicKey, RpcResponseAndContext, AccountInfo } from "@solana/web3.js";
import { rpc } from "../../rpc-wrapper";
import { IndexerWithAccountDeps } from "../types";
import { AccountInfoIndexer } from "./account-info-indexer";
import { AmmMarketAccountUpdateIndexer } from "./amm/amm-market-account-indexer";
import { logger } from "../../logger";

export async function startAccountInfoIndexer(
  indexerQueryRes: IndexerWithAccountDeps
) {
  const { indexers: indexer, indexer_account_dependencies: dependentAccount } =
    indexerQueryRes;
  if (!indexer) return;
  const implementation = getAccountInfoIndexerImplementation(
    indexer.implementation
  );
  if (implementation && dependentAccount && dependentAccount.acct) {
    const accountPubKey = new PublicKey(dependentAccount.acct);

    const accountInfo = await rpc.call(
      "getAccountInfoAndContext",
      [accountPubKey],
      "Get account info for account info indexer"
    ) as RpcResponseAndContext<AccountInfo<Buffer> | null>;

    //index refresh on startup
    if (accountInfo.value) {
      const res = await implementation.index(
        accountInfo.value,
        accountPubKey,
        accountInfo.context
      );
      if (!res.success) {
        logger.error(
          "error indexing account initial fetch",
          accountPubKey.toString()
        );
      }
    }

    // // TODO: re-enable this or delete this whole thing if not needed
    // connection.onAccountChange(accountPubKey, async (accountInfo, context) => {
    //   const res = await implementation.index(
    //     accountInfo,
    //     accountPubKey,
    //     context
    //   );
    //   if (!res.success) {
    //     logger.error("error indexing account update", accountPubKey.toString());
    //   }
    // });
  }
}
function getAccountInfoIndexerImplementation(
  implementation: IndexerImplementation
): AccountInfoIndexer | null {
  switch (implementation) {
    case IndexerImplementation.AmmMarketIndexer:
      return AmmMarketAccountUpdateIndexer;
  }
  return null;
}
