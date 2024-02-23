import { MarketIndexer } from '../market-indexer';

export class OrcaWhirlpools implements MarketIndexer {
  public async fetchMakes(market: string, block: BigInt): Promise<{}[]> {
    return []
  }

  public async fetchTakes(market: string, startBlock: BigInt, endBlock: BigInt): Promise<{}[]> {
    return [];
  }
}
