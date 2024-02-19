import { clusterApiUrl } from '@solana/web3.js';

const HELIUS_API_KEY = process.env.FUTARCHY_HELIUS_API_KEY;
const heliusRPCEnpoint = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
//export const rpc = clusterApiUrl(heliusRPCEnpoint);