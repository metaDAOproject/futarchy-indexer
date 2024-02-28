import { VersionedTransactionResponse } from "@solana/web3.js";
import { DBTransaction } from '@themetadao/indexer-db';
import { Idl } from '@coral-xyz/anchor';

export const Ok = {indexed: true};
export const Err = {indexed: false};

export type InstructionIndexer<IDL extends Idl> = {
  readonly PROGRAM_NAME: string;
  readonly PROGRAM_ID: string;
  readonly PROGRAM_IDL: IDL;

  indexInstruction(
    databaseTransaction: DBTransaction,
    transactionIndex: number,
    transactionResponse: VersionedTransactionResponse,
    instructionIndex: number,
    decodedInstruction: IDL['instructions'][number]
  ): Promise<{indexed: boolean}>;
}
