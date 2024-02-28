import { connection } from "./connection";
import { InstructionIndexer } from './indexers/instruction-indexer';
import { BorshCoder } from '@coral-xyz/anchor';
import { OpenbookTwapIndexer } from "./indexers/openbook-twap/openbook-twap-indexer";
import { OpenbookV2Indexer } from "./indexers/openbook-v2/openbook-v2-indexer";
import { AutocratV0Indexer } from "./indexers/autocrat/autocrat-v0-indexer";
import { AutocratV0_1Indexer } from "./indexers/autocrat/autocrat-v0_1-indexer";
import { red, yellow } from 'ansicolor';
import { AddressLookupTableAccount, Message, MessageAccountKeys } from "@solana/web3.js";

export type IndexTransactionResult<E extends IndexTransactionError> = 
  {indexed: true} |
  {indexed: false; error: {type: E; details: ErrorDetails[E]}}

export enum IndexTransactionError {
  NoTxReturned = 'NoTxReturned',
  NoKnownProgram = 'NoKnownProgram',
  MoreSignaturesThanExpected = 'MoreSignaturesThanExpected',
  WrongSignature = 'WrongSignature',
  FailedToIndexInstruction = 'FailedToIndexInstruction',
  InvalidVersion = 'InvalidVersion',
  VersionLookupTableMismatch = 'VersionLookupTableMismatch',
  InvalidLookupTable = 'InvalidLookupTable'
}

export type MessageAddressTableLookup = Message['addressTableLookups'][0];

export type ErrorDetails = {
  [IndexTransactionError.NoTxReturned]: undefined;
  [IndexTransactionError.NoKnownProgram]: {programs: string[]};
  [IndexTransactionError.MoreSignaturesThanExpected]: {signatures: string[]};
  [IndexTransactionError.WrongSignature]: {signature: string};
  [IndexTransactionError.FailedToIndexInstruction]: undefined;
  [IndexTransactionError.InvalidVersion]: {version: any};
  [IndexTransactionError.VersionLookupTableMismatch]: {version: any; addressTableLookups: MessageAddressTableLookup[]};
  [IndexTransactionError.InvalidLookupTable]: {accountKey: string;};
}

const indexers: InstructionIndexer<any>[] = [
  AutocratV0Indexer,
  AutocratV0_1Indexer,
  OpenbookTwapIndexer,
  OpenbookV2Indexer
];

enum TransactionVersionType {
  Legacy = 'Legacy',
  V0 = 'V0'
}

const programToIndexer: Record<string, {indexer: InstructionIndexer<any>, coder: BorshCoder}> = 
  Object.fromEntries(indexers.map(indexer => [indexer.PROGRAM_ID, {indexer, coder: new BorshCoder(indexer.PROGRAM_IDL)}]));

function error<E extends IndexTransactionError>(e: E, details: ErrorDetails[E]): IndexTransactionResult<E> {
  return {indexed: false, error: { type: e, details }};
}

const ok = {indexed: true} as const;

export async function indexTransaction(txIdx: number, signature: string): Promise<IndexTransactionResult<any>> {
  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0
  });

  if (tx == null || tx === undefined) {
    return error(IndexTransactionError.NoTxReturned, undefined);
  }

  if (tx.meta?.err) {
    // TODO: mark tx as processed
    return ok;
  }

  const { transaction } = tx;
  const { signatures } = transaction;

  let txVersion: TransactionVersionType;
  let accountKeys: MessageAccountKeys;
  switch (tx.version) {
    case 'legacy':
      txVersion = TransactionVersionType.Legacy;
      if (transaction.message.addressTableLookups.length > 0) {
        return error(IndexTransactionError.VersionLookupTableMismatch, {
          version: txVersion,
          addressTableLookups: transaction.message.addressTableLookups
        });
      }
      accountKeys = transaction.message.getAccountKeys();
      break;
    case 0:
      txVersion = TransactionVersionType.V0;
      if (transaction.message.addressTableLookups.length === 0) {
        return error(IndexTransactionError.VersionLookupTableMismatch, {
          version: txVersion,
          addressTableLookups: transaction.message.addressTableLookups
        });
      }
      // https://solana.stackexchange.com/questions/8652/how-do-i-parse-the-accounts-in-a-versioned-transaction
      const lookupTables: AddressLookupTableAccount[] = [];
      for (const {accountKey} of transaction.message.addressTableLookups) {
        const lookupTable = await connection.getAddressLookupTable(accountKey);
        if (lookupTable === null) {
          console.log('no response from getAddressLookupTable');
          return error(IndexTransactionError.InvalidLookupTable, {accountKey: accountKey.toBase58()});
        }
        if (lookupTable.value === null) {
          console.log('null lookup table value');
          return error(IndexTransactionError.InvalidLookupTable, {accountKey: accountKey.toBase58()});
        }
        lookupTables.push(lookupTable.value);
      }
      accountKeys = transaction.message.getAccountKeys({addressLookupTableAccounts: lookupTables});
      break;
    default:
      return error(IndexTransactionError.InvalidVersion, {version: tx.version});
  }

  // console.log('indexing', signature, tx.version, tx.transaction.message.addressTableLookups.length);

  // TODO: maybe do something with inner instructions
  // tx.meta?.innerInstructions
  // console.log(JSON.stringify(tx));
  
  /*
  first tx has 5 signatures. Need to investigate whether all show up in the getSignaturesForAccount response.
  We don't want to process the same tx multiple times.
  if (signatures.length > 1) {
    return error(IndexTransactionError.MoreSignaturesThanExpected, {signatures: tx.transaction.signatures})
  }
  */

  const txSig = signatures[0];
  if (txSig !== signature) {
    return error(IndexTransactionError.WrongSignature, {signature: txSig});
  }

  //const accountKeys = transaction.message.getAccountKeys({a});
  const instructions = transaction.message.compiledInstructions;
  const programs: string[] = [];
  let matchingProgramFound = false;
  const timeStr = new Date(tx.blockTime! * 1000).toISOString().replace("T", " ").replace(".000Z", "");
  for (let i = 0; i < instructions.length; ++i) {
    const ix = instructions[i];
    const program = accountKeys.staticAccountKeys[ix.programIdIndex].toBase58();
    programs.push(program);
    if (program in programToIndexer) {
      matchingProgramFound = true;
      const {indexer, coder} = programToIndexer[program];
      const ixIdx = i;
      const prefix = `[${timeStr}][slot ${tx.slot}][${indexer.PROGRAM_NAME}] ${txIdx}.${ixIdx}.`;
      const secondLogMessage = (tx.meta?.logMessages ?? [])[1];
      switch (secondLogMessage) {
        case "Program log: Instruction: IdlCreateAccount":
          console.log(yellow(`${prefix} skipping IdlCreateAccount ${signature}`));
          continue;
        case "Program log: Instruction: IdlWrite":
          console.log(yellow(`${prefix} skipping IdlWrite ${signature}`));
          continue;
      }
      const decoded = coder.instruction.decode(Buffer.from(ix.data));
      if (decoded == null) {
        console.log(`${prefix} Cannot decode instruction ${i} of transaction ${signature}`);
        console.log(tx.meta?.logMessages)
        continue;
      }
      let ixLine = `${prefix} ${decoded.name} ${signature}`;
      console.log(ixLine);
      const result = await indexer.indexInstruction(
        {} as any, // TODO: initialize db transaction and pass here
        txIdx, tx,
        ixIdx, decoded
      )
      if (!result.indexed) {
        return error(IndexTransactionError.FailedToIndexInstruction, undefined);
      }
    }
  }
  if (!matchingProgramFound) {
    return error(IndexTransactionError.NoKnownProgram, {programs});
  }

  return ok;
}
