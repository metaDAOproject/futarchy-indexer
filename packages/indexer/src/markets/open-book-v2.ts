import { MarketIndexer } from '../market-indexer';

export class OpenBookV2 implements MarketIndexer {
  public async fetchMakes(market: string, block: BigInt): Promise<{}[]> {
    return []
  }

  public async fetchTakes(market: string, startBlock: BigInt, endBlock: BigInt): Promise<{}[]> {
    return [];
  }
}
