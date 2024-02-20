import { connection } from './connection';

const latestBlockHash = await connection.getLatestBlockhash();
console.log(latestBlockHash);
