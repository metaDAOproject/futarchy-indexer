import { connection } from './connection';

const latestBlockHash = await connection.getLatestBlockhash();
console.log(latestBlockHash);

setInterval(() => {
    console.log(new Date().toISOString());
}, 5000);
