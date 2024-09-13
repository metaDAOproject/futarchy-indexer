import { indexAmms } from "./indexAmm";
import { indexAmmEvents, indexVaultEvents } from "./indexEvents";
import { populateSignatures } from "./populateSignatures";

async function main() {
  // await populateSignatures();
  // await indexAmms();
  // console.log("indexAmmEvents");
  // await indexVaultEvents();
  await indexAmmEvents();
}

main();