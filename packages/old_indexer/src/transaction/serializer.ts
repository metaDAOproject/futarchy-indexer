import {
  AccountMeta,
  CompiledInstruction,
  ConfirmedTransactionMeta,
  Message,
  MessageAccountKeys,
  PublicKey,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import { Ok, Err, Result } from "../match";
import { z } from "zod";
import { resolveAccounts, ResolveAccountsError } from "./account-resolver";
import * as base58 from "bs58";
import { connection, provider } from "../connection";
import { BorshInstructionCoder, Idl, Program } from "@coral-xyz/anchor";
import { PROGRAM_ID_TO_IDL_MAP } from "../constants";
import {
  InstructionDisplay,
  Instruction as AnchorInstruction,
} from "@coral-xyz/anchor/dist/cjs/coder/borsh/instruction";
import { logger } from "../logger";

/**
 * This version should be bumped every time we update this file.
 * It will reset all the transaction watchers to slot 0
 * TODO: it should also create new indexers
 */
export const SERIALIZED_TRANSACTION_LOGIC_VERSION = 0;

// bigint isn't JSON serializable
// https://github.com/GoogleChromeLabs/jsbi/issues/30#issuecomment-1006088574
export function serialize(transaction: Transaction, pretty = false): string {
  return JSON.stringify(
    transaction,
    (_, value) =>
      typeof value === "bigint" ? `BIGINT:${value.toString()}` : value,
    pretty ? 2 : 0
  );
}

const bigintEncodingPattern = /^BIGINT:[0-9]+$/;
export function deserialize(
  json: string
): Result<Transaction, { type: "ZodError"; error: z.ZodError }> {
  const deserialized = JSON.parse(json, (_, value) =>
    typeof value === "string" && bigintEncodingPattern.test(value)
      ? BigInt(value.split(":")[1])
      : value
  );
  const parsed = SerializableTransaction.safeParse(deserialized);
  if (parsed.success) {
    return Ok(parsed.data);
  } else {
    return Err({ type: "ZodError", error: parsed.error });
  }
}

export const SerializableTokenMeta = z.strictObject({
  mint: z.string(),
  owner: z.string(),
  amount: z.bigint(),
  decimals: z.number(),
});

/**
 * on the transaction level this will not have a name, but it will have the pre and post balances.
 * At the instruction level, we WILL see the name, but we will not have pre and post balances.
 */
export const SerializableAccountMeta = z.strictObject({
  name: z.string().optional(),
  pubkey: z.string(),
  isSigner: z.boolean().optional(),
  isWriteable: z.boolean().optional(),
  // lamport balances (rent)
  preBalance: z.bigint().optional(),
  postBalance: z.bigint().optional(),
  // if the account was an ATA
  preTokenBalance: SerializableTokenMeta.optional(),
  postTokenBalance: SerializableTokenMeta.optional(),
});

export const SerializableInstructionArg = z.strictObject({
  name: z.string(),
  type: z.string(),
  data: z.string(),
});

export const SerializableInstruction = z.strictObject({
  name: z.string(),
  stackHeight: z.number(),
  programIdIndex: z.number(),
  data: z.string(),
  accounts: z.array(z.number()),
  accountsWithData: z.array(SerializableAccountMeta),
  args: z.array(SerializableInstructionArg),
});

export const SerializableTransactionError = z
  .strictObject({
    InstructionError: z
      .tuple([
        z.number(),
        z.union([z.string(), z.strictObject({ Custom: z.number() })]),
      ])
      .optional(),
    InsufficientFundsForRent: z
      .strictObject({
        account_index: z.number(),
      })
      .optional(),
  })
  .optional();

export const SerializableTransaction = z.strictObject({
  blockTime: z.number(),
  slot: z.number(),
  recentBlockhash: z.string(),
  computeUnitsConsumed: z.bigint(),
  err: SerializableTransactionError,
  fee: z.bigint(),
  signatures: z.array(z.string()),
  version: z.union([z.literal("legacy"), z.literal(0)]),
  logMessages: z.array(z.string()),
  accounts: z.array(SerializableAccountMeta),
  instructions: z.array(SerializableInstruction),
});

export type Transaction = z.infer<typeof SerializableTransaction>;
export type Account = z.infer<typeof SerializableAccountMeta>;
export type TokenBalance = z.infer<typeof SerializableTokenMeta>;
export type Instruction = z.infer<typeof SerializableInstruction>;

export enum GetTransactionErrorType {
  NullGetTransactionResponse = "NullGetTransactionResponse",
  ZodError = "ZodError",
  ResolveAccountError = "ResolveAccountError", // problem getting account list from transaction
  DuplicateTokenAccounts = "DuplicateTokenAccounts", // if multiple items in pre or post token balances reference the same account
  OuterIxStackHeightNonNull = "OuterIxStackHeightNonNull", // it's expected that all outer instructions have a null stackHeight (even though it's really 1)
  RepeatOuterIndicesForInnerIx = "RepeatOuterIndicesForInnerIx", // if multiple items in innerInstructions reference same outer instruction
  InvalidStackHeightTransition = "InvalidStackHeightTransition", // if next instruction item in an inner instruction list increases by more than 1, or if it goes to less than 2 (only outers can have stack height 1)
}

export type GetTransactionError =
  | {
      type: GetTransactionErrorType.NullGetTransactionResponse;
    }
  | {
      type: GetTransactionErrorType.ZodError;
      error: z.ZodError;
    }
  | {
      type: GetTransactionErrorType.ResolveAccountError;
      error: ResolveAccountsError;
    }
  | {
      type: GetTransactionErrorType.DuplicateTokenAccounts;
      balanceType: "pre" | "post";
      duplicates: Record<string, TokenBalanceResponse[]>;
    }
  | {
      type: GetTransactionErrorType.OuterIxStackHeightNonNull;
      outerInstruction: Message["compiledInstructions"][number];
    }
  | {
      type: GetTransactionErrorType.RepeatOuterIndicesForInnerIx;
      repeatedIndex: number;
    }
  | {
      type: GetTransactionErrorType.InvalidStackHeightTransition;
      outerInstructionIndex: number;
      innerInstructionIndex: number;
      priorStackHeight: number;
      innerStackHeight: number;
    };

type TokenBalanceResponse = NonNullable<
  NonNullable<VersionedTransactionResponse["meta"]>["postTokenBalances"]
>[number];

function parseTokenBalances(
  tokenBalanceResponses: TokenBalanceResponse[],
  accountsRaw: MessageAccountKeys
): Result<
  Record<string, TokenBalance>,
  { type: "duplicates"; duplicates: Record<string, TokenBalanceResponse[]> }
> {
  const duplicates: Record<string, TokenBalanceResponse[]> = {};
  const parsed: Record<string, [TokenBalanceResponse, TokenBalance]> = {};
  for (let i = 0; i < tokenBalanceResponses.length; ++i) {
    const cur = tokenBalanceResponses[i];
    const {
      accountIndex,
      mint,
      owner,
      uiTokenAmount: { amount, decimals },
    } = cur;
    const accountPubkey = accountsRaw.get(accountIndex)!.toBase58();
    if (parsed[accountPubkey] !== undefined) {
      if (duplicates[accountPubkey] === undefined) {
        duplicates[accountPubkey] = [parsed[accountPubkey][0]];
      }
      duplicates[accountPubkey].push(cur);
    }
    parsed[accountPubkey] = [
      cur,
      {
        mint,
        owner: owner!,
        amount: BigInt(amount),
        decimals,
      },
    ];
  }
  if (Object.keys(duplicates).length > 0) {
    return Err({ type: "duplicates", duplicates });
  }
  return Ok(
    Object.fromEntries(
      Object.entries(parsed).map(([account, [_response, balance]]) => [
        account,
        balance,
      ])
    )
  );
}

async function parseInstructions(
  outer: Message["compiledInstructions"],
  inner: NonNullable<ConfirmedTransactionMeta["innerInstructions"]>,
  accounts: AccountMeta[]
): Promise<Result<Instruction[], GetTransactionError>> {
  const innerInstructionMap: Record<number, CompiledInstruction[]> = {};
  for (let i = 0; i < inner.length; ++i) {
    const { index, instructions } = inner[i];
    if (index in innerInstructionMap) {
      return Err({
        type: GetTransactionErrorType.RepeatOuterIndicesForInnerIx,
        repeatedIndex: index,
      });
    }
    innerInstructionMap[index] = instructions;
  }
  const instructions: Instruction[] = [];
  for (let outerI = 0; outerI < outer.length; ++outerI) {
    const curOuter = outer[outerI];
    // TODO: figure out why the outer and inner instruction types don't have a stackHeight member even though the rpc always returns this.
    //       perhaps we need to patch web3 libs or there's some edge case we aren't aware of.
    if ("stackHeight" in curOuter) {
      return Err({
        type: GetTransactionErrorType.OuterIxStackHeightNonNull,
        outerInstruction: curOuter,
      });
    }
    const programAccount = accounts[curOuter.programIdIndex].pubkey;
    const idl = await getIdlForProgram(programAccount);
    const outerIxWithDisplay = getIxWithDisplay(
      {
        ...curOuter,
        data: Buffer.from(curOuter.data),
        accounts: curOuter.accountKeyIndexes,
      },
      idl,
      accounts
    );

    const outerName = outerIxWithDisplay?.instruction.name ?? "unknown";
    const outerArgs = outerIxWithDisplay?.instructionDisplay?.args ?? [];
    const outerAccountsWithData =
      outerIxWithDisplay?.instructionDisplay?.accounts ?? [];
    instructions.push({
      stackHeight: 1,
      programIdIndex: curOuter.programIdIndex,
      data: base58.encode(curOuter.data),
      accounts: curOuter.accountKeyIndexes,
      name: outerName,
      args: outerArgs,
      // we do not have balances here
      accountsWithData: outerAccountsWithData.map(({ isWritable, ...a }) => ({
        ...a,
        isWriteable: isWritable,
        pubkey: a.pubkey.toBase58(),
      })),
    });
    let curStackHeight = 1;
    const curInnerInstructions = innerInstructionMap[outerI] ?? [];
    for (let innerI = 0; innerI < curInnerInstructions.length; ++innerI) {
      const curInner = curInnerInstructions[innerI];
      const innerStackHeight: number = (curInner as any).stackHeight;
      const isInvalidStackHeight =
        typeof innerStackHeight !== "number" ||
        (innerStackHeight > curStackHeight &&
          curStackHeight + 1 !== innerStackHeight) ||
        innerStackHeight < 2;
      if (isInvalidStackHeight) {
        return Err({
          type: GetTransactionErrorType.InvalidStackHeightTransition,
          outerInstructionIndex: outerI,
          innerInstructionIndex: innerI,
          priorStackHeight: curStackHeight,
          innerStackHeight,
        });
      }
      const programAccount = accounts[curInner.programIdIndex].pubkey;
      const idl = await getIdlForProgram(programAccount);
      const innerIxWithDisplay = getIxWithDisplay(
        {
          ...curOuter,
          data: Buffer.from(curOuter.data),
          accounts: curOuter.accountKeyIndexes,
        },
        idl,
        accounts
      );

      const innerName = innerIxWithDisplay?.instruction.name ?? "unknown";
      const innerArgs = innerIxWithDisplay?.instructionDisplay?.args ?? [];
      const innerAccountsWithData =
        innerIxWithDisplay?.instructionDisplay?.accounts ?? [];

      instructions.push({
        stackHeight: innerStackHeight,
        programIdIndex: curInner.programIdIndex,
        data: curInner.data,
        accounts: curInner.accounts,
        name: innerName,
        args: innerArgs,
        // we do not have balances here
        accountsWithData: innerAccountsWithData.map(({ isWritable, ...a }) => ({
          ...a,
          isWriteable: isWritable,
          pubkey: a.pubkey.toBase58(),
        })),
      });
      curStackHeight = innerStackHeight;
    }
  }
  return Ok(instructions);
}

async function getIdlForProgram(
  programAccount: PublicKey
): Promise<Idl | null> {
  try {
    let idl: Idl | null = PROGRAM_ID_TO_IDL_MAP[programAccount.toBase58()];
    if (!idl) {
      idl = await Program.fetchIdl(programAccount, provider);
    }
    return idl;
  } catch (e) {
    return null;
  }
}

export type IdlAccount = {
  name: string;
  isMut: boolean;
  isSigner: boolean;
};

export type IdlAccounts = {
  name: string;
  accounts: IdlAccount[];
};

/**
 * @private
 */
export type IdlAccountItem = IdlAccounts | IdlAccount;

function getIxWithDisplay(
  instruction: { accounts: number[]; data: Buffer },
  idl: Idl | null,
  accountMetas: AccountMeta[]
): {
  instruction: AnchorInstruction;
  instructionDisplay: InstructionDisplay | null;
} | null {
  if (!idl) {
    return null;
  }
  let coder: BorshInstructionCoder | null = null;
  let decodedIx: AnchorInstruction | null = null;

  // Added because of this error:
  // User defined types not provided
  // TypeError: field.type is not an Object. (evaluating '"vec" in field.type')
  try {
    coder = new BorshInstructionCoder(idl);
  } catch (e) {
    logger.error("error with initializing coder", e);
    return null;
  }

  if (!coder) {
    logger.error("no coder can't continue");
    return null;
  }

  try {
    decodedIx = coder.decode(Buffer.from(instruction.data));
  } catch (e) {
    logger.error("error with coder decoding of instruction:", e);
    return null;
  }

  if (!decodedIx) {
    return null;
  }

  const ix = idl.instructions.find((instr) => instr.name === decodedIx.name);
  const flatIdlAccounts = flattenIdlAccounts(<IdlAccountItem[]>ix?.accounts);
  const accounts = instruction.accounts.map((number, idx) => {
    const meta = accountMetas[number];
    if (idx < flatIdlAccounts.length) {
      return {
        name: flatIdlAccounts[idx].name,
        ...meta,
      };
    }
    // "Remaining accounts" are unnamed in Anchor.
    else {
      return {
        name: `Remaining ${idx - flatIdlAccounts.length}`,
        ...meta,
      };
    }
  });
  try {
    const ixDisplay = coder.format(decodedIx, accounts);

    return {
      instruction: decodedIx,
      instructionDisplay: ixDisplay,
    };
  } catch (e) {
    logger.error("error with coder formatting of decodedIx:", e);
    return null;
  }
}

function flattenIdlAccounts(
  accounts: IdlAccountItem[],
  prefix?: string
): IdlAccount[] {
  return accounts
    .map((account) => {
      const accName = account.name;
      if (Object.prototype.hasOwnProperty.call(account, "accounts")) {
        const newPrefix = prefix ? `${prefix} > ${accName}` : accName;

        return flattenIdlAccounts((<IdlAccounts>account).accounts, newPrefix);
      } else {
        return {
          ...(<IdlAccount>account),
          name: prefix ? `${prefix} > ${accName}` : accName,
        };
      }
    })
    .flat();
}

export async function getTransaction(
  signature: string
): Promise<Result<Transaction, GetTransactionError>> {
  const txResponse = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  });
  if (!txResponse) {
    return Err({
      type: GetTransactionErrorType.NullGetTransactionResponse,
    });
  }
  const accountsResponse = await resolveAccounts(txResponse);
  if (!accountsResponse.success) {
    return Err({
      type: GetTransactionErrorType.ResolveAccountError,
      error: accountsResponse.error,
    });
  }
  const { ok: accountsRaw } = accountsResponse;
  const accounts: Account[] = [];
  // Index to token balance
  const preTokenBalances = parseTokenBalances(
    txResponse.meta?.preTokenBalances ?? [],
    accountsRaw
  );
  if (!preTokenBalances.success) {
    return Err({
      type: GetTransactionErrorType.DuplicateTokenAccounts,
      duplicates: preTokenBalances.error.duplicates,
      balanceType: "pre",
    });
  }
  const postTokenBalances = parseTokenBalances(
    txResponse.meta?.postTokenBalances ?? [],
    accountsRaw
  );
  if (!postTokenBalances.success) {
    return Err({
      type: GetTransactionErrorType.DuplicateTokenAccounts,
      duplicates: postTokenBalances.error.duplicates,
      balanceType: "post",
    });
  }

  for (let i = 0; i < accountsRaw.length; ++i) {
    const cur = accountsRaw.get(i);
    const pubkey = cur!.toBase58();
    accounts.push({
      name: "",
      pubkey,
      isSigner: txResponse.transaction.message.isAccountSigner(i),
      isWriteable: txResponse.transaction.message.isAccountWritable(i),
      preBalance: BigInt(txResponse.meta?.preBalances[i]!),
      postBalance: BigInt(txResponse.meta?.postBalances[i]!),
      preTokenBalance: preTokenBalances.ok[pubkey],
      postTokenBalance: postTokenBalances.ok[pubkey],
    });
  }

  const accountMetas: AccountMeta[] = accounts.map((a) => ({
    pubkey: new PublicKey(a.pubkey),
    isWritable: a.isWriteable ?? false,
    isSigner: a.isSigner ?? false,
  }));

  const instructionsResult = await parseInstructions(
    txResponse.transaction.message.compiledInstructions,
    txResponse.meta?.innerInstructions!,
    accountMetas
  );
  if (!instructionsResult.success) {
    return instructionsResult;
  }
  const instructions = instructionsResult.ok;

  const parseResult = SerializableTransaction.safeParse({
    blockTime: txResponse.blockTime,
    slot: txResponse.slot,
    recentBlockhash: txResponse.transaction.message.recentBlockhash,
    computeUnitsConsumed: BigInt(txResponse.meta?.computeUnitsConsumed!),
    err: txResponse.meta?.err ?? undefined,
    fee: BigInt(txResponse.meta?.fee!),
    signatures: txResponse.transaction.signatures,
    version: txResponse.version,
    logMessages: txResponse.meta?.logMessages,
    accounts,
    instructions,
  });
  if (parseResult.success) {
    return Ok(parseResult.data);
  } else {
    return Err({
      type: GetTransactionErrorType.ZodError,
      error: parseResult.error,
    });
  }
}

export function parseFormattedInstructionArgsData<T>(data: string) {
  let jsonString = data.replace(/'/g, '"');

  jsonString = jsonString.replace(/(\w+):/g, '"$1":');

  jsonString = jsonString.replace(/:\s*(\w+)(?=,|})/g, (match, p1) => {
    return isNaN(p1) ? `: "${p1}"` : `: ${p1}`;
  });

  return JSON.parse(jsonString) as T;
}

/*
// from txResponse.transaction.message.serialize()
// 22RoFnkikwwiZ1Tw47mqEQL2oSKD4xJBRDr1xxyayvyoghQ73TtM16tRW8a8d1Ue9tQ5FroTCAMoQALhjXbLh7E8
const sampleTransaction = {
  "blockTime":1708392365,
  "meta":{
    "computeUnitsConsumed":115351,
    "err":null,
    "fee":25080,
    "innerInstructions":[
      {
        "index":3,
        "instructions":[
          {
            "accounts":[0,1],
            "data":"111112PhCZ6LAeHDFtvbyHvk1VQAu373K5bsDc7zGtGftewwNJhnARLbzL3VyendLazkiH",
            "programIdIndex":7,
            "stackHeight":2
          },
          {
            "accounts":[0,6,8,11,7,17],
            "data":"1",
            "programIdIndex":12,
            "stackHeight":2
          },
          {
            "accounts":[11],
            "data":"84eT",
            "programIdIndex":17,
            "stackHeight":3
          },
          {
            "accounts":[0,6],
            "data":"11119os1e9qSs2u7TsThXqkBSRVFxhmYaFKFZ1waB2X7armDmvK3p5GmLdUxYdg3h7QSrL",
            "programIdIndex":7,
            "stackHeight":3
          },
          {
            "accounts":[6],
            "data":"P",
            "programIdIndex":17,
            "stackHeight":3
          },
          {
            "accounts":[6,11],
            "data":"6Pq53B79epzehHA633bmpuCS2h6Y3kdWX4if2ingmWebA",
            "programIdIndex":17,
            "stackHeight":3
          },
          {
            "accounts":[0,5,8,15,7,17],
            "data":"1",
            "programIdIndex":12,
            "stackHeight":2
          },
          {
            "accounts":[15],
            "data":"84eT",
            "programIdIndex":17,
            "stackHeight":3
          },
          {
            "accounts":[0,5],
            "data":"11119os1e9qSs2u7TsThXqkBSRVFxhmYaFKFZ1waB2X7armDmvK3p5GmLdUxYdg3h7QSrL",
            "programIdIndex":7,
            "stackHeight":3
          },
          {
            "accounts":[5],
            "data":"P",
            "programIdIndex":17,
            "stackHeight":3
          },
          {
            "accounts":[5,15],
            "data":"6Pq53B79epzehHA633bmpuCS2h6Y3kdWX4if2ingmWebA",
            "programIdIndex":17,
            "stackHeight":3
          },
          {
            "accounts":[9],
            "data":"5H2mQahfhqnGk5qEg5kSeUZ6U33HdY2UUShDuG4tURrKyhVyQznphqNTE1Tksz6t982WMdCEKTYSyde8zX8FGJ3dHBb4iB1cQatoccDG7p9WgNtkujuu9qwZyFXnXHjzG4ycF9xUaqd2vy3J8qVLkJpLXGHWTHaXscazUWZhPyx7qVHbBtuWG512LZUWXNefRhTzwUum",
            "programIdIndex":16,
            "stackHeight":2
          }
        ]
      }
    ],
    "loadedAddresses":{
      "readonly":[],
      "writable":[]
    },
    "logMessages":[
      "Program 11111111111111111111111111111111 invoke [1]",
      "Program 11111111111111111111111111111111 success",
      "Program 11111111111111111111111111111111 invoke [1]",
      "Program 11111111111111111111111111111111 success",
      "Program 11111111111111111111111111111111 invoke [1]",
      "Program 11111111111111111111111111111111 success",
      "Program opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb invoke [1]",
      "Program log: Instruction: CreateMarket",
      "Program 11111111111111111111111111111111 invoke [2]",
      "Program 11111111111111111111111111111111 success",
      "Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL invoke [2]",
      "Program log: Create","Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [3]",
      "Program log: Instruction: GetAccountDataSize",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 1622 of 752557 compute units",
      "Program return: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA pQAAAAAAAAA=",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success",
      "Program 11111111111111111111111111111111 invoke [3]",
      "Program 11111111111111111111111111111111 success",
      "Program log: Initialize the associated token account",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [3]",
      "Program log: Instruction: InitializeImmutableOwner",
      "Program log: Please upgrade to SPL Token 2022 for immutable owner support",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 1405 of 745917 compute units",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [3]",
      "Program log: Instruction: InitializeAccount3",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 4241 of 742033 compute units",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success",
      "Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL consumed 29544 of 767032 compute units",
      "Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL success",
      "Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL invoke [2]",
      "Program log: Create",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [3]",
      "Program log: Instruction: GetAccountDataSize",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 1622 of 723500 compute units",
      "Program return: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA pQAAAAAAAAA=",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success",
      "Program 11111111111111111111111111111111 invoke [3]",
      "Program 11111111111111111111111111111111 success",
      "Program log: Initialize the associated token account",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [3]",
      "Program log: Instruction: InitializeImmutableOwner",
      "Program log: Please upgrade to SPL Token 2022 for immutable owner support",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 1405 of 716860 compute units",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [3]",
      "Program log: Instruction: InitializeAccount3",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 4241 of 712976 compute units",
      "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success",
      "Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL consumed 20544 of 728975 compute units",
      "Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL success",
      "Program opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb invoke [2]",
      "Program opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb consumed 2126 of 688925 compute units",
      "Program opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb success",
      "Program opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb consumed 114751 of 799550 compute units",
      "Program opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb success",
      "Program ComputeBudget111111111111111111111111111111 invoke [1]",
      "Program ComputeBudget111111111111111111111111111111 success"
    ],
    "postBalances":[
      4068672160,6792960,633916800,636255360,633916800,2039280,2039280,1,0,0,10290359120,1461600,731913600,1,0,1461600,1141440,934087680
    ],
    "postTokenBalances":[
      {
        "accountIndex":5,
        "mint":"GrV2aGFHGtwNUiDWHRY6oP4DGf23PY4iNJWcV5ZgEKf",
        "owner":"3hNNEucrY9Ns1fzWxSaVRDzeCCxELtEpMoVBECzxDWAC",
        "programId":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "uiTokenAmount":{
          "amount":"0","decimals":6,"uiAmount":null,"uiAmountString":"0"
        }
      },  
      {
        "accountIndex":6,
        "mint":"ADwCAfmY6FdkFHqdv3Qw4pBoVYNhEZLW3wcwr41sGx8E",
        "owner":"3hNNEucrY9Ns1fzWxSaVRDzeCCxELtEpMoVBECzxDWAC",
        "programId":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "uiTokenAmount":{
          "amount":"0",
          "decimals":9,
          "uiAmount":null,
          "uiAmountString":"0"
        }
      }
    ],
    "preBalances":[
      5983657720,0,0,0,0,0,0,1,0,0,10290359120,1461600,731913600,1,0,1461600,1141440,934087680
    ],
    "preTokenBalances":[],
    "rewards":[],
    "status":{"Ok":null}
  },
  "slot":249251231,
  "transaction":{
    "message":{
      "header":{
        "numReadonlySignedAccounts":0,
        "numReadonlyUnsignedAccounts":11,
        "numRequiredSignatures":5
      },
      "accountKeys":[
        "99dZcXhrYgEmHeMKAb9ezPaBqgMdg1RjCGSfHa7BeQEX",
        "4yoswUWGJ2s7Wio2tVeD7dvEEuHWxyaYTXUW5yELwX4M",
        "6GLWiqsUzXV1NJDcPkbrVq51aJmSmvZwpJTBkMmKaaaA",
        "6HiwCD32ErrLbDogWtTB2zxE6GLzypTpK4QuPDRjFpjr",
        "D9Ew92TMULsVDERnMLUjpNpCKRnDQWptS4rFYSVSjT1B",
        "2ZLJaGWXZk1279w1zp3y3m2bTaKdwE4VaZQns8FfpooJ",
        "69KYjQpYokoBXctmnedNgeed1qxeTJCaXjazojdH2Rs9",
        "11111111111111111111111111111111",
        "3hNNEucrY9Ns1fzWxSaVRDzeCCxELtEpMoVBECzxDWAC",
        "8rDvL1qM41mYVNYS6oKLfGXyBGov3jLtbELToxjSwShj",
        "ADCCEAbH8eixGj5t73vb4sKecSKo7ndgDSuWGvER4Loy",
        "ADwCAfmY6FdkFHqdv3Qw4pBoVYNhEZLW3wcwr41sGx8E",
        "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
        "ComputeBudget111111111111111111111111111111",
        "GpLACVBR3DMxNDfeFMKrhNnycs7ghdCwJeXSvccL5a3Z",
        "GrV2aGFHGtwNUiDWHRY6oP4DGf23PY4iNJWcV5ZgEKf",
        "opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb",
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      ],
      "recentBlockhash":"GkH5dBDtp4uqx7ScQuJVYMyCgXsnx9Z6JTi61mKM873V",
      "instructions":[
        {
          "accounts":[0,4],
          "data":"11115j3Nzc8Ljr4BPxH9a4EThoPhhCp8WzdyQ2E9yALd9XKwvnkJgCxCLttsb6Ld85UTMw",
          "programIdIndex":7,
          "stackHeight":null
        },
        {
          "accounts":[0,2],
          "data":"11115j3Nzc8Ljr4BPxH9a4EThoPhhCp8WzdyQ2E9yALd9XKwvnkJgCxCLttsb6Ld85UTMw",
          "programIdIndex":7,
          "stackHeight":null
        },
        {
          "accounts":[0,3],
          "data":"11115iNQLx57j4ojPNAEtHcpGMqznSwVj6ZfVtARVE5WcRCiw5qLa6a3oiZ7sf8CSJgs8R",
          "programIdIndex":7,
          "stackHeight":null
        },
        {
          "accounts":[1,8,4,2,3,0,6,5,11,15,7,17,12,16,16,10,14,16,14,9,16],
          "data":"7mYL3pfoBAM6CMTKWMvUkm2Kpvg7a6h6gU4wo2KewGc1B8WaokBjSkXJ5qpRv7LmEziCcpQhpjt6G5X15GBXtbPHzAxUg1NEGC3y",
          "programIdIndex":16,
          "stackHeight":null
        },
        {
          "accounts":[],
          "data":"3WBgs5fm8oDy",
          "programIdIndex":13,
          "stackHeight":null
        }
      ],
      "indexToProgramIds":{}
    },
    "signatures":[
      "22RoFnkikwwiZ1Tw47mqEQL2oSKD4xJBRDr1xxyayvyoghQ73TtM16tRW8a8d1Ue9tQ5FroTCAMoQALhjXbLh7E8",
      "2w26krC3MgYd2J8HrRtdTx6ifd8FTdYmrWKQwcF4qDUgrWGViareC1wCgP4XvvDixXggJ2CJZvtVRkehRCH3G1N7",
      "rBq7JkrEsFqW4jP5mo4RYYg2DdfLNTQxFtmXiyA7b1Bww7Bmz3fHWua6zhMruUHKfw1apjSsgGaPUtpVTRDR6rt",
      "2nf8UFdpwr4wm3KFD3HjCQuNcAhYFgvKt4KhjhZ4mbuu6WJEWuCGEqyypZB6XkkGdsRdmkKod4PBSmRVKZ12cMpC",
      "3D7YMtEzisFjkxeAuXFtFesYi3FAfruX4h9TeVQAb2yxnLexif6NK3oMAko5ohX5p6fLNEVm5jRgqizjkBvaHhbC"
    ]
  },
  "version":"legacy"
}
*/

/*
// console.logged txResponse
// 3ggvCQ979T5gRV56bUU4YGtYYJruAZypgTxgnrw4eoVP9ARKK8VT8j7Dy7TnBQ6r4j511yqYZM7mdkk8fJ363s9P
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
