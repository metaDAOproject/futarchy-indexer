import { VersionedTransactionResponse } from "@solana/web3.js";
import { Idl } from "@coral-xyz/anchor";
import { Result, TaggedUnion } from "../utils/match";
import { IDL } from "../indexers/common";

export const Ok = { indexed: true };
export const Err = { indexed: false };

type InstructionIDL = Idl | IDL;

export type InstructionIndexer<IDL extends InstructionIDL> = {
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
        txSig: string;
      },
      TaggedUnion
    >
  >;
  indexTransactionSig(transaction: {
    txSig: string;
    slot: string;
    blockTime: Date;
    failed: boolean;
    payload: string;
    serializerLogicVersion: number;
  }): Promise<
    Result<
      {
        txSig: string;
      },
      TaggedUnion
    >
  >;
};
