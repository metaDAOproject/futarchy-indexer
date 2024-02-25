import { VersionedTransactionResponse } from "@solana/web3.js";
import { IDL } from "@themetadao/futarchy-ts/lib/idl/openbook_twap";
import { Program, BorshCoder } from '@coral-xyz/anchor';
import { provider } from "../connection";
//import base58 from "bs58";

export const PROGRAM_ID = "TWAPrdhADy2aTKN5iFZtNnkQYXERD9NvKjPFVPMSCNN";

const program = new Program(IDL, PROGRAM_ID, provider);
const coder = new BorshCoder(IDL);

export async function indexTwapMarketInstruction(transaction: VersionedTransactionResponse, instructionIndex: number) {
  const instruction = transaction.transaction.message.compiledInstructions[instructionIndex];
  const decoded = coder.instruction.decode(Buffer.from(instruction.data));
  console.log(decoded);
}
