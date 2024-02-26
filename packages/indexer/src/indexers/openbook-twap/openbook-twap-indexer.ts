import { IDL, OpenbookTwap } from "@themetadao/futarchy-ts/lib/idl/openbook_twap";
import { Err, InstructionIndexer, Ok } from "../instruction-indexer";

// Doing this rather than class implements pattern due to
// https://github.com/microsoft/TypeScript/issues/41399
export const OpenbookTwapIndexer: InstructionIndexer<OpenbookTwap> = {
  PROGRAM_ID: "TWAPrdhADy2aTKN5iFZtNnkQYXERD9NvKjPFVPMSCNN",
  PROGRAM_IDL: IDL,
  indexInstruction: async (dbTx, txIdx, txRes, ixIdx, ix) => {
    console.log(`${txIdx}.${ixIdx}. OpenbookTwap ${ix.name}`);
    // TODO: in the future we want to switch on the instruction name and index the openbook program instruction
    //       build the order book, then from that deduce the twap change.

    // For now though, we're going to take a shortcut by just reading the logs. 
    // We get initial weighted observation aggregator via the createTwapMarket expected value
    // see https://github.com/metaDAOproject/openbook-twap/blob/82690c33a091b82e908843a14ad1a571dfba12b1/programs/openbook-twap/src/lib.rs#L68
    // Afterwards we can extract the log line here 
    // and use it to increment the observation aggregator 
    // https://github.com/metaDAOproject/openbook-twap/blob/82690c33a091b82e908843a14ad1a571dfba12b1/programs/openbook-twap/src/lib.rs#L120
    // we simply take difference between transaction slot and proposal enqueued slot then divide the obs agg by this
    // https://github.com/metaDAOproject/futarchy/blob/d5b91dc103e23d72900817e93b450e42274469c9/programs/autocrat_v0/src/lib.rs#L335

    return Ok;
  }
};
