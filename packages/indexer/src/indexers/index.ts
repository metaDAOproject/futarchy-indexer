
export enum IndexerImplementation {

}

class Indexer {
  private name: string;
  private implementation: IndexerImplementation;
  private latestSlotProcessed: BigInt;
  private dependencies: string[];
  
  public constructor(
    name: string,
    implementation: IndexerImplementation,
    latestSlotPorcessed: BigInt,
    dependencies: string[]) {
    this.name = name;
    this.implementation = implementation;
    this.latestSlotProcessed = latestSlotPorcessed;
    this.dependencies = dependencies;
  }

  public stop() {

  }
  
  public start() {
    
  }
}


export async function startIndexers() {
  // Get indexers

  // Create indexers that are new, shut down those that are old
}