import { indexAmms } from "./indexAmm";
import { populateSignatures } from "./populateSignatures";

async function main() {
  // await populateSignatures();
  await indexAmms();
}

main();