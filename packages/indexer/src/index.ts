import { indexAmms } from "./indexAmm";
import { indexAmmEvents, indexVaultEvents } from "./indexEvents";
import { populateSignatures } from "./populateSignatures";

// NEW FUTARCHY INDEXER

// To minimize complexity, the indexer is split into two parts:
// 1. signature ingestion
// 2. signature processing

// SIGNATURE INGESTION
// Signature ingestion is responsible for fetching new signatures
// from the network and storing them in the `signatures` table.
// Today, this is done by the `populateSignatures` function. Under
// the hood, it uses the `getSignaturesForAddress` RPC endpoint.
// This is nice because it means that the indexer can fetch
// historical data. However, it is higher latency than subscribing
// to transactions via a websocket, like the below:
// https://docs.helius.dev/webhooks-and-websockets/enhanced-websockets
// We could use this to get real-time transaction data in the future.

// SIGNATURE PROCESSING
// Signature processing is responsible for fetching the transactions
// corresponding to the signatures and parsing them to extract event data.
// This is done by the `indexAmmEvents` and `indexVaultEvents` functions.
// Today, insertion of new accounts (questions, conditional vaults, AMMs)
// works. However, updating them (when, for example, a swap happens) doesn't.

// For it to work, we need to do the following:
// 1) Add `slot_last_applied` and `signature_last_applied` columns to the
//    `amm` and `conditional_vault` tables.
// 2) When processing a signature, fetch the account from the DB and check
//    if the signature's slot is greater than the account's `slot_last_applied`.
//    If it isn't, skip it. If it's greater, apply it. If it's equal, we need
//    to run a `getBlock` RPC call and check which transaction is latest.


async function main() {
  // await populateSignatures();
  // await indexAmms();
  // console.log("indexAmmEvents");
  // await indexVaultEvents();
  // await indexAmmEvents();

  await Promise.all([
    populateSignatures(),
    setInterval(async () => {
      await indexAmmEvents();
    }, 1000),
  ])
  // await Promise.all([
  //   populateSignatures(),
  //   indexAmmEvents(),
  // ])
}

main();