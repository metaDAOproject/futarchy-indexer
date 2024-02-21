import { getProposals } from './proposal-indexer';

const proposals = await getProposals();
console.log(`got ${proposals.length} proposals`);
proposals.forEach(proposal => { console.log(JSON.stringify(proposal, null, 2)) });

let startTime = Date.now();
setInterval(() => {
  const aliveForSeconds = Math.round((Date.now() - startTime) / 1000);
  const aliveForMinutes = Math.floor(aliveForSeconds / 60);
  const aliveForHours = Math.floor(aliveForMinutes / 60);
  const aliveForDays = Math.floor(aliveForHours / 24);
  let aliveFor = 
    (aliveForDays ? `${aliveForDays}d`: '') +
    (aliveForHours ? `${aliveForHours % 24}h` : '') + 
    (aliveForMinutes ? `${aliveForMinutes % 60}m` : '') + 
    `${aliveForSeconds % 60}s`;
  console.log(`Service alive for ${aliveFor}`);
}, 30000);
