import { eq, usingDb } from "@metadaoproject/indexer-db";
import { schema } from "@metadaoproject/indexer-db";
import { inArray } from "drizzle-orm/expressions";
import { BN } from "@coral-xyz/anchor";
import { PriceMath } from "@metadaoproject/futarchy";

export default async () => {
  //console.log("HERE WE GO AGAIN")

  const proposalID = "GwDTdh3CmxuRjSjvtYAaifdquS1Zwm34W2MiBVAAV4CF";

  const [ proposal ] = await usingDb(db => {
    return db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.proposalAcct, proposalID))
      .leftJoin(schema.daos, eq(schema.proposals.daoAcct, schema.daos.daoAcct))
      .leftJoin(schema.tokens, eq(schema.daos.baseAcct, schema.tokens.mintAcct))
      .limit(1)
      .execute()
  })

  const { proposals, tokens } = proposal

  const orders = await usingDb(db => {
    return db
      .select()
      .from(schema.orders)
      .where(inArray(schema.orders.marketAcct, [proposals.passMarketAcct, proposals.failMarketAcct]))
      .execute()
  })

  let actors = {}
  
  orders.forEach(o => {
    const actor = o.actorAcct
    if (!actors[actor]) {
      actors[actor] = {
        tokensBought: 0,
        tokensSold: 0,
        volumeBought: 0,
        volumeSold: 0
      }
    }

    const totals = actors[actor]
    const orderAmount = PriceMath.getHumanAmount(new BN(o.filledBaseAmount), tokens?.decimals)
    const price = o.quotePrice * orderAmount

    if (o.side === "BID") {
      totals.tokensBought += orderAmount
      totals.volumeBought += price
    } else if (o.side === "ASK") {
      totals.tokensSold += orderAmount;
      totals.volumeSold += price;
    }
  })

  console.log("actors", actors)
}