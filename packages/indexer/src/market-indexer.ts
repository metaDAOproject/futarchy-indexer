type Pubkey = string;
type Make = {};
type Take = {};

export interface MarketIndexer {
  fetchMakes(market: Pubkey, block: BigInt): Promise<Make[]>;
  fetchTakes(market: Pubkey, startBlock: BigInt, endBlock: BigInt): Promise<Take[]>;
}
