import { IDL, OpenbookTwap } from "@metadaoproject/futarchy-sdk/lib/idl/openbook_twap";
import { OPENBOOK_TWAP_PROGRAM_ID } from "@metadaoproject/futarchy-sdk/lib/constants";
import { Err, InstructionIndexer, Ok } from "../instruction-indexer";

// Doing this rather than class implements pattern due to
// https://github.com/microsoft/TypeScript/issues/41399
export const OpenbookTwapIndexer: InstructionIndexer<OpenbookTwap> = {
  PROGRAM_NAME: "OpenbookTwap",
  PROGRAM_ID: OPENBOOK_TWAP_PROGRAM_ID.toBase58(),
  PROGRAM_IDL: IDL,
  indexInstruction: async (dbTx, txIdx, txRes, ixIdx, ix) => {
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
