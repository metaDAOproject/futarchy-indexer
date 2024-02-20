import { Connection } from '@solana/web3.js';

const HELIUS_API_KEY = process.env.FUTARCHY_HELIUS_API_KEY;
export const RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
export const connection = new Connection(RPC_ENDPOINT);
