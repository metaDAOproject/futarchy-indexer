import { connection } from "./connection";
import { InstructionIndexer } from './indexers/instruction-indexer';
import { BorshCoder } from '@coral-xyz/anchor';
import { OpenbookTwapIndexer } from "./indexers/openbook-twap/openbook-twap-indexer";
import { OpenbookV2Indexer } from "./indexers/openbook-v2/openbook-v2-indexer";
import { AutocratV0Indexer } from "./indexers/autocrat/autocrat-v0-indexer";
import { AutocratV0_1Indexer } from "./indexers/autocrat/autocrat-v0_1-indexer";
import { red, yellow } from 'ansicolor';

export type IndexTransactionResult<E extends IndexTransactionError> = 
  {indexed: true} |
  {indexed: false; error: {type: E; details: ErrorDetails[E]}}

export enum IndexTransactionError {
  NoTxReturned = 'NoTxReturned',
  NoKnownProgram = 'NoKnownProgram',
  MoreSignaturesThanExpected = 'MoreSignaturesThanExpected',
  WrongSignature = 'WrongSignature',
  FailedToIndexInstruction = 'FailedToIndexInstruction'
}

export type ErrorDetails = {
  [IndexTransactionError.NoTxReturned]: undefined;
  [IndexTransactionError.NoKnownProgram]: {programs: string[]};
  [IndexTransactionError.MoreSignaturesThanExpected]: {signatures: string[]};
  [IndexTransactionError.WrongSignature]: {signature: string};
  [IndexTransactionError.FailedToIndexInstruction]: undefined;
}

const indexers: InstructionIndexer<any>[] = [
  AutocratV0Indexer,
  AutocratV0_1Indexer,
  OpenbookTwapIndexer,
  OpenbookV2Indexer
];

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

  /*
  type CachedTransactionResponse = {
    blockTime?: number;
    slot: number;
    version: number | string;
    meta?: {
      computeUnitsConsumed?: number;
      err?: {} | string;
      fee: number;
      innerInstructions: {
        index: number;
        instructions: [

        ]
      }[]
    }
  }


  const thing = tx.meta!.innerInstructions![0];
  const innerIx = thing.instructions[0]
  innerIx.
  const meta = tx.meta!;
  meta?.innerInstructions
  */

  // TODO: maybe do something with inner instructions
  // tx.meta?.innerInstructions

  // console.log(JSON.stringify(tx));

  const { transaction } = tx;
  const { signatures } = transaction;
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

  const accountKeys = transaction.message.getAccountKeys();
  const instructions = transaction.message.compiledInstructions;
  const programs: string[] = [];
  let matchingProgramFound = false;
  for (let i = 0; i < instructions.length; ++i) {
    const ix = instructions[i];
    const program = accountKeys.staticAccountKeys[ix.programIdIndex].toBase58();
    programs.push(program);
    if (program in programToIndexer) {
      matchingProgramFound = true;
      const {indexer, coder} = programToIndexer[program];
      const ixIdx = i;
      const prefix = `[${new Date(tx.blockTime! * 1000).toISOString()}] ${txIdx}.${ixIdx}. ${indexer.PROGRAM_IDL.name}`;
      const secondLogMessage = (tx.meta?.logMessages ?? [])[1];
      switch (secondLogMessage) {
        case "Program log: Instruction: IdlCreateAccount":
          console.log(yellow(`${prefix} skipping IdlCreateAccount transaction ${signature}`));
          continue;
        case "Program log: Instruction: IdlWrite":
          console.log(yellow(`${prefix} skipping IdlWrite transaction ${signature}`));
          continue;
      }
      const decoded = coder.instruction.decode(Buffer.from(ix.data));
      if (decoded == null) {
        console.log(`${prefix} Cannot decode instruction ${i} of transaction ${signature}`);
        console.log(tx.meta?.logMessages)
        continue;
      }
      let ixLine = `${prefix} ${decoded.name} ${signature}`;
      if (tx.meta?.err) {
        ixLine = red(ixLine);
      }
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


