import { VersionedTransactionResponse } from "@solana/web3.js";
import { connection } from "./connection";
import { PROGRAM_ID, indexTwapMarketInstruction } from "./openbook-twap/openbook-twap-indexer";

export type IndexTransactionResult<E extends IndexTransactionError> = 
  {indexed: true} |
  {indexed: false; error: {type: E; details: ErrorDetails[E]}}

export enum IndexTransactionError {
  NoTxReturned = 'NoTxReturned',
  NoKnownProgream = 'NoKnownProgram',
  MoreSignaturesThanExpected = 'MoreSignaturesThanExpected',
  WrongSignature = 'WrongSignature',
}

export type ErrorDetails = {
  [IndexTransactionError.NoTxReturned]: undefined;
  [IndexTransactionError.NoKnownProgream]: {programs: string[]};
  [IndexTransactionError.MoreSignaturesThanExpected]: {signatures: string[]};
  [IndexTransactionError.WrongSignature]: {signature: string};
}

type InstructionIndexer = (transaction: VersionedTransactionResponse, instructionIndex: number) => Promise<void>;

const indexers: {[programId: string]: InstructionIndexer} = {
  [PROGRAM_ID]: indexTwapMarketInstruction
}

function error<E extends IndexTransactionError>(e: E, details: ErrorDetails[E]): IndexTransactionResult<E> {
  return {indexed: false, error: { type: e, details }};
}

const ok = {indexed: true} as const;

export async function indexTransaction(signature: string): Promise<IndexTransactionResult<any>> {
  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0
  });
  if (tx == null || tx === undefined) {
    return error(IndexTransactionError.NoTxReturned, undefined);
  }
  // TODO: maybe do something with inner instructions
  // tx.meta?.innerInstructions

  const { transaction } = tx;
  const { signatures } = transaction;
  /*
  first ix has 5 signatures. Need to investigate whether all show up in the getSignaturesForAccount response.
  We don't want to process the same tx multiple times.
  if (signatures.length > 1) {
    return error(IndexTransactionError.MoreSignaturesThanExpected, {signatures: tx.transaction.signatures})
  }
  */

  const txSig = signatures[0];
  if (txSig !== signature) {
    return error(IndexTransactionError.WrongSignature, {signature: txSig});
  }

  const accountKeys = transaction.message.getAccountKeys();
  const instructions = transaction.message.compiledInstructions;
  const programs: string[] = [];
  let matchingProgramFound = false;
  for (let i = 0; i < instructions.length; ++i) {
    const ix = instructions[i];
    const program = accountKeys.staticAccountKeys[ix.programIdIndex].toBase58();
    programs.push(program);
    if (program in indexers) {
      await indexers[program](tx, i);
      matchingProgramFound = true;
    }
  }
  if (!matchingProgramFound) {
    return error(IndexTransactionError.NoKnownProgream, {programs});
  }

  return ok;
}

/**
{
  blockTime: 1708665394,
  meta: {
    computeUnitsConsumed: 24859,
    err: null,
    fee: 7000,
    innerInstructions: [
      [Object ...]
    ],
    loadedAddresses: {
      readonly: [],
      writable: [],
    },
    logMessages: [
      "Program ComputeBudget111111111111111111111111111111 invoke [1]", "Program ComputeBudget111111111111111111111111111111 success",
      "Program TWAPrdhADy2aTKN5iFZtNnkQYXERD9NvKjPFVPMSCNN invoke [1]", "Program log: Instruction: CancelOrderByClientId",
      "Program log: Observation: 3564785", "Program log: Weighted observation: 92481217255",
      "Program opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb invoke [2]", "Program log: Instruction: CancelOrderByClientOrderId",
      "Program opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb consumed 8391 of 185296 compute units",
      "Program return: opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb AQAAAAAAAAA=", "Program opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb success",
      "Program TWAPrdhADy2aTKN5iFZtNnkQYXERD9NvKjPFVPMSCNN consumed 24709 of 199850 compute units",
      "Program return: TWAPrdhADy2aTKN5iFZtNnkQYXERD9NvKjPFVPMSCNN AQAAAAAAAAA=", "Program TWAPrdhADy2aTKN5iFZtNnkQYXERD9NvKjPFVPMSCNN success"
    ],
    postBalances: [ 250122967, 633916800, 9688320, 633916800, 1614720, 6792960, 1,
      1141440, 1141440
    ],
    postTokenBalances: [],
    preBalances: [ 250129967, 633916800, 9688320, 633916800, 1614720, 6792960, 1,
      1141440, 1141440
    ],
    preTokenBalances: [],
    returnData: {
      data: [ "AQAAAAAAAAA=", "base64" ],
      programId: "TWAPrdhADy2aTKN5iFZtNnkQYXERD9NvKjPFVPMSCNN",
    },
    rewards: [],
    status: {
      Ok: null,
    },
  },
  slot: 249891238,
  transaction: {
    message: Message {
      header: [Object ...],
      accountKeys: [
        [PublicKey(8Cwx4yR2sFAC5Pdx2NgGHxCk1gJrtSTxJoyqVonqndhq) ...], [PublicKey(6GLWiqsUzXV1NJDcPkbrVq51aJmSmvZwpJTBkMmKaaaA) ...], [PublicKey(7DFk8ZwyRzEW8ysngKhybSaVtx92g7KhTZ2iqmTs5s3W) ...], [PublicKey(D9Ew92TMULsVDERnMLUjpNpCKRnDQWptS4rFYSVSjT1B) ...], [PublicKey(GpLACVBR3DMxNDfeFMKrhNnycs7ghdCwJeXSvccL5a3Z) ...], [PublicKey(4yoswUWGJ2s7Wio2tVeD7dvEEuHWxyaYTXUW5yELwX4M) ...], [PublicKey(ComputeBudget111111111111111111111111111111) ...], [PublicKey(opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb) ...], [PublicKey(TWAPrdhADy2aTKN5iFZtNnkQYXERD9NvKjPFVPMSCNN) ...]
      ],
      recentBlockhash: "9jKYzGuvqjYwnuhJmoSb5b8MEsirdqDXR3Sjvarg5VKF",
      instructions: [
        [Object ...], [Object ...]
      ],
      indexToProgramIds: Map(2) {
        6: [PublicKey(ComputeBudget111111111111111111111111111111) ...],
        8: [PublicKey(TWAPrdhADy2aTKN5iFZtNnkQYXERD9NvKjPFVPMSCNN) ...],
      },
      version: [Getter],
      staticAccountKeys: [Getter],
      compiledInstructions: [Getter],
      addressTableLookups: [Getter],
      getAccountKeys: [Function: getAccountKeys],
      isAccountSigner: [Function: isAccountSigner],
      isAccountWritable: [Function: isAccountWritable],
      isProgramId: [Function: isProgramId],
      programIds: [Function: programIds],
      nonProgramIds: [Function: nonProgramIds],
      serialize: [Function: serialize],
    },
    signatures: [ "3ggvCQ979T5gRV56bUU4YGtYYJruAZypgTxgnrw4eoVP9ARKK8VT8j7Dy7TnBQ6r4j511yqYZM7mdkk8fJ363s9P"
    ],
  },
  version: "legacy",
}
 */