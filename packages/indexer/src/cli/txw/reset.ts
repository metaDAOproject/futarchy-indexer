import { getDBConnection, schema, eq } from "@themetadao/indexer-db";
import inquirer from 'inquirer';
import { getTransaction } from "../../transaction/serializer";

export async function reset() {
  const db = await getDBConnection();
  try {
    const accounts = (await db.con.select().from(schema.transactionWatchers)).map(({acct}) => acct);
    const prompt = inquirer.createPromptModule();
    const ACCOUNT_ANSWER = 'account';
    const account: string = (await prompt([
      {
        type: 'list',
        name: ACCOUNT_ANSWER,
        message: 'Select account to reset:',
        choices: accounts
      }
    ]))[ACCOUNT_ANSWER];
    const TX_ANSWER = 'tx';
    const transaction: string = (await prompt([
      {
        type: 'input',
        name: TX_ANSWER,
        message: `Reset ${account} back to transaction (empty for full reset):`
      }
    ]))[TX_ANSWER];
    const fullReset = !transaction;
    let slotToResetTo = 0;
    let txToResetTo = fullReset ? null : transaction;
    if (fullReset) {
      console.log(`Full reset for tx watcher on ${account}`);
      const updateResult = await db.con.update(schema.transactionWatchers)
        .set({
          latestTxSig: null,
          firstTxSig: null,
          checkedUpToSlot: BigInt(slotToResetTo)
        })
        .where(eq(schema.transactionWatchers.acct, account))
        .returning({acct: schema.transactionWatchers.acct});
      if (updateResult.length !== 1) {
        console.log('Failed to update record');
        console.log(JSON.stringify(updateResult));
        return;
      }
    } else {
      const txResult = await getTransaction(transaction);
      if (!txResult.success) {
        console.log(`Transaction ${transaction} is invalid`);
        console.log(JSON.stringify(txResult.error));
        return;
      }
      if (!txResult.ok.accounts.map(({pubkey}) => pubkey).includes(account)) {
        console.log(`Transaction ${transaction} does not reference account ${account}`);
        return;
      }
      // TODO: another edge case is the supplied transaction is after the progress of the watcher. That should also not be allowed.
      // Until that's solved it'll probably just require another reset operation but with a valid transaction
      slotToResetTo = txResult.ok.slot;
      console.log(`Resetting tx watcher on ${account} to tx ${transaction} (slot ${slotToResetTo})`);
      txToResetTo = transaction;
      const updateResult = await db.con.update(schema.transactionWatchers)
        .set({
          latestTxSig: txToResetTo,
          checkedUpToSlot: BigInt(slotToResetTo)
        })
        .where(eq(schema.transactionWatchers.acct, account))
        .returning({acct: schema.transactionWatchers.acct});
      if (updateResult.length !== 1) {
        console.log('Failed to update record');
        console.log(JSON.stringify(updateResult));
        return;
      }
    }
    console.log(`Successfully reset`);
  } finally {
    db.client.release();
    process.exit(0);
  }
}