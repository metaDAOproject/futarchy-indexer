export enum AmmInstructionIndexerError {
  GeneralError = "GeneralError",
  MissingMarket = "MissingMarket",
  FailedSwap = "FailedSwap",
}

export enum SwapPersistableError {
  GeneralError = "GeneralError",
  AlreadyPersistedSwap = "AlreadyPersistedSwap",
  NonSwapTransaction = "NonSwapTransaction",
  TransactionParseError = "TransactionParseError",
  ArbTransactionError = "ArbTransactionError",
}
