import { indexAmms } from "./indexAmm";
import { indexAmmEvents } from "./indexEvents";
import { populateSignatures } from "./populateSignatures";

async function main() {
  // await populateSignatures();
  // await indexAmms();
  // console.log("indexAmmEvents");
  await indexAmmEvents();
}

main();