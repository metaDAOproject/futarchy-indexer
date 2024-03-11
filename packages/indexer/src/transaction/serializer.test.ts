import { serialize, deserialize, Transaction } from './serializer';
import { expect, test } from 'bun:test';

test('serialize-deserialize', async () => {

  const testTx: Transaction = {
    blockTime: 0,
    slot: 0,
    recentBlockhash: "",
    computeUnitsConsumed: BigInt(4),
    fee: BigInt(2),
    signatures: [],
    version: 'legacy',
    logMessages: [],
    accounts: [
      {
        pubkey: "BIGINT:a300n", // false flag
        isSigner: true,
        isWriteable: false,
        preBalance: BigInt(800),
        postBalance: BigInt(3000000)
      }
    ],
    instructions: []
  };

  const str = serialize(testTx);

  expect(str).toBe(
    `{"blockTime":0,"slot":0,"recentBlockhash":"",` +
    `"computeUnitsConsumed":"BIGINT:4","fee":"BIGINT:2","signatures":[],"version":"legacy","logMessages":[],`+
    `"accounts":[{"pubkey":"BIGINT:a300n","isSigner":true,"isWriteable":false,"preBalance":"BIGINT:800","postBalance":"BIGINT:3000000"}],`+
    `"instructions":[]}`
  );

  const deserialized = deserialize(str) as any;

  expect(deserialized).toEqual({success: true, ok: testTx});
});
