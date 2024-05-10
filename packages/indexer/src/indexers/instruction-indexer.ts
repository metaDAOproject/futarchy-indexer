import { VersionedTransactionResponse } from "@solana/web3.js";
import { Idl } from "@coral-xyz/anchor";
import { Result, TaggedUnion } from "../match";

export const Ok = { indexed: true };
export const Err = { indexed: false };

export type InstructionIndexer<IDL extends Idl> = {
  readonly PROGRAM_NAME: string;
  readonly PROGRAM_ID: string;
  readonly PROGRAM_IDL: IDL;

  indexInstruction(
    transactionIndex: number,
    transactionResponse: VersionedTransactionResponse,
    instructionIndex: number,
    decodedInstruction?: IDL["instructions"][number]
  ): Promise<
    Result<
      {
        acct: string;
      },
      TaggedUnion
    >
  >;
  indexTransactionSig(transactionSignature: string): Promise<
    Result<
      {
        acct: string;
      },
      TaggedUnion
    >
  >;
};
