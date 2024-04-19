import { usingDb, schema } from "@themetadao/indexer-db";
import inquirer from 'inquirer';

export async function selectAccount(): Promise<string> {
  const accounts = (await usingDb(db => db.select().from(schema.transactionWatchers))).map(({acct}) => acct);
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
  return account;
}
