import { Result, Ok, Err } from '../match';
import { VersionedTransactionResponse, AddressLookupTableAccount, MessageAccountKeys, MessageAddressTableLookup, RpcResponseAndContext, PublicKey } from "@solana/web3.js";
import { connection } from '../connection';

export enum ResolveAccountsErrorType {
  AddressTableLookupsInLegacy = 'AddressTableLookupsInLegacy',
  NoLookupTablesInV0 = 'NoLookupTablesInV0',
  MissingLookupTableResponse = 'MissingLookupTableResponse',
  UnsupportedTransactionVersion = 'UnsupportedTransactionVersion'
}

export type ResolveAccountsError = 
  {
    type: ResolveAccountsErrorType.AddressTableLookupsInLegacy;
    lookups: MessageAddressTableLookup[];
  } |
  {
    type: ResolveAccountsErrorType.NoLookupTablesInV0;
  } |
  {
    type: ResolveAccountsErrorType.MissingLookupTableResponse;
    response: RpcResponseAndContext<AddressLookupTableAccount | null>;
    accountKey: PublicKey;
  } |
  {
    type: ResolveAccountsErrorType.UnsupportedTransactionVersion;
    version: any;
  };

export async function resolveAccounts({transaction, version}: VersionedTransactionResponse): Promise<Result<MessageAccountKeys, ResolveAccountsError>> {
  let accountKeys: MessageAccountKeys;
  switch (version) {
    case 'legacy':
      if (transaction.message.addressTableLookups.length > 0) {
        return Err({type: ResolveAccountsErrorType.AddressTableLookupsInLegacy, lookups: transaction.message.addressTableLookups});
      }
      accountKeys = transaction.message.getAccountKeys();
      break;
    case 0:
      if (transaction.message.addressTableLookups.length === 0) {
        return Err({type: ResolveAccountsErrorType.NoLookupTablesInV0});
      }
      // https://solana.stackexchange.com/questions/8652/how-do-i-parse-the-accounts-in-a-versioned-transaction
      const lookupTables: AddressLookupTableAccount[] = [];
      for (const {accountKey} of transaction.message.addressTableLookups) {
        const lookupTable = await connection.getAddressLookupTable(accountKey);
        if (!lookupTable?.value) {
          return Err({
            type: ResolveAccountsErrorType.MissingLookupTableResponse,
            response: lookupTable,
            accountKey
          });
        }
        lookupTables.push(lookupTable.value);
      }
      accountKeys = transaction.message.getAccountKeys({addressLookupTableAccounts: lookupTables});
      break;
    default:
      return Err({type: ResolveAccountsErrorType.UnsupportedTransactionVersion, version});
  }
  return Ok(accountKeys);
}
