import { BN } from "@coral-xyz/anchor";
import { enrichTokenMetadata } from "@metadaoproject/futarchy-sdk";
import { PriceMath } from "@metadaoproject/futarchy/v0.4";
import { schema, usingDb, eq, inArray } from "@metadaoproject/indexer-db";
import { TokenRecord } from "@metadaoproject/indexer-db/lib/schema";
import { PricesType } from "@metadaoproject/indexer-db/lib/schema";
import {
  TwapRecord,
  PricesRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import { AccountInfo, Context, PublicKey } from "@solana/web3.js";
import { provider, rpcReadClient } from "../../connection";
import { Err, Ok, Result, TaggedUnion } from "../../match";
import { logger } from "../../../logger";
import { getHumanPrice } from "../../usecases/math";
import { getMint } from "@solana/spl-token";
import { connection } from "../../../connection";


async function main() {
let baseToken;
let quoteToken;


const accountInfo = await connection.getAccountInfo(new PublicKey("Q8sMdszTYMxhg44Zgc1Ev2EHXrjJS5eBPkQKcRYVnDX"));
console.log("accountInfo", accountInfo);
const ammMarketAccount = await rpcReadClient.markets.amm.decodeMarket(
  accountInfo!!
);

//get base and quote decimals from db
console.log("utils::indexAmmMarketAccountWithContext::getting tokens from db", ammMarketAccount.baseMint.toString(), ammMarketAccount.quoteMint.toString());
const tokens = await usingDb((db) =>
  db
    .select()
    .from(schema.tokens)
    .where(inArray(schema.tokens.mintAcct, [ammMarketAccount.baseMint.toString(), ammMarketAccount.quoteMint.toString()]))
    .execute()
);
console.log("utils::indexAmmMarketAccountWithContext::tokens", tokens);

// if (!tokens || tokens.length < 2) {
// fallback if we don't have the tokens in the db for some reason
console.log("utils::indexAmmMarketAccountWithContext::no tokens in db, fetching from rpc");
baseToken = await enrichTokenMetadata(
  ammMarketAccount.baseMint,
  provider
);
quoteToken = await enrichTokenMetadata(
  ammMarketAccount.quoteMint,
  provider
)
console.log("utils::indexAmmMarketAccountWithContext::baseToken", baseToken);
console.log("utils::indexAmmMarketAccountWithContext::quoteToken", quoteToken);
}

main().catch(console.error);