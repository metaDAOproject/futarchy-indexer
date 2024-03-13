import { 
  bigint, doublePrecision, integer, numeric, smallint,
  index, pgTable, primaryKey,
  boolean, timestamp, varchar, text
} from 'drizzle-orm/pg-core';

// Implementation discussed here https://github.com/metaDAOproject/futarchy-indexer/pull/1
// Incorporated ideas from 0xNallok's version
// https://github.com/R-K-H/openbook-v2-datastore/blob/master/timescale/models/001_tables.up.sql

// https://docs.rs/solana-program/latest/src/solana_program/pubkey.rs.html#24
const MAX_PUBKEY_B58_STR_LEN = 44;
const pubkey = (columnName: string) => varchar(columnName, {length: MAX_PUBKEY_B58_STR_LEN});

const MAX_TRANSACTION_B58_STR_LEN = 88;
const transaction = (columnName: string) => varchar(columnName, {length: MAX_TRANSACTION_B58_STR_LEN});

const tokenAmount = (columnName: string) => bigint(columnName, {mode: 'bigint'});

const block = (columnName: string) => bigint(columnName, {mode: 'bigint'});
const slot = (columnName: string) => bigint(columnName, {mode: 'bigint'});

export enum MarketType {
  OPEN_BOOK_V2 = 'OPEN_BOOK_V2',
  ORCA_WHIRLPOOL = 'ORCA_WHIRLPOOL',
  METEORA = 'METEORA',
  JOE_BUILD_AMM = 'JOE_BUILD_AMM' // MetaDAO's custom hybrid Clob/AMM impl (see proposal 4)
}

export enum ProposalOutcome {
  Pending = 'Pending',
  Passed = 'Passed',
  Failed = 'Failed'
}

type NonEmptyList<E> = [E, ...E[]];

function pgEnum<T extends string>(columnName: string, enumObj: Record<any, T>) {
  return varchar(columnName, {enum: Object.values(enumObj) as NonEmptyList<T>});
}

export const proposals = pgTable('proposals', {
  proposalAcct: pubkey('proposal_acct').primaryKey(),
  proposalNum: bigint('proposal_num', {mode: 'bigint'}).notNull(),
  autocratVersion: doublePrecision('autocrat_version').notNull(),
  proposerAcct: pubkey('proposer_acct').notNull(),
  initialSlot: slot('initial_slot').notNull(),
  outcome: pgEnum('outcome', ProposalOutcome).notNull(),
  descriptionURL: varchar('description_url'),
  updatedAt: timestamp('updated_at').notNull()
});

export const markets = pgTable('markets', {
  marketAcct: pubkey('market_acct').primaryKey(),
  marketType: pgEnum('market_type', MarketType).notNull(),
  createTxSig: transaction('create_tx_sig').notNull(),

  // proposal-specific fields may be null as market might not be tied to any one proposal 
  // (ex: the META spot market)
  proposalAcct: pubkey('proposal_acct').references(() => proposals.proposalAcct),

  baseMintAcct: pubkey('base_mint_acct').references(() => tokens.mintAcct).notNull(),
  quoteMintAcct: pubkey('quote_mint_acct').references(() => tokens.mintAcct).notNull(),

  baseLotSize: tokenAmount('base_lot_size').notNull(),
  quoteLotSize: tokenAmount('quote_lot_size').notNull(),
  quoteTickSize: tokenAmount('quote_tick_size').notNull(),

  // Monitoring the total supply on either side of the market
  // (helpful in case of AMMs where LPs are not tracked in the makes table)
  bidsTokenAcct: pubkey('bids_token_acct').references(() => tokenAccts.tokenAcct).notNull(),
  asksTokenAcct: pubkey('asks_token_acct').references(() => tokenAccts.tokenAcct).notNull(),

  // Fees are in bips
  baseMakerFee: smallint('base_maker_fee').notNull(),
  baseTakerFee: smallint('base_taker_fee').notNull(),
  quoteMakerFee: smallint('quote_maker_fee').notNull(),
  quoteTakerFee: smallint('quote_taker_fee').notNull(),

  // When market becomes active or inactive
  activeSlot: slot('active_slot'),
  inactiveSlot: slot('inactive_slot')
});

export const twaps = pgTable('twaps', {
  marketAcct: pubkey('market_acct').references(() => markets.marketAcct).notNull(),
  proposalAcct: pubkey('proposal_acct').references(() => proposals.proposalAcct).notNull(),
  updatedSlot: slot('updated_slot').notNull(),
  // max u128 value is 340282366920938463463374607431768211455 (39 digits)
  // the account field is u128 https://github.com/metaDAOproject/openbook-twap/blob/82690c33a091b82e908843a14ad1a571dfba12b1/programs/openbook-twap/src/lib.rs#L52
  observationAgg: numeric('observation_agg', {precision: 40, scale: 0}).notNull(),
  curTwap: tokenAmount('token_amount').notNull(),
}, table => ({
  pk: primaryKey(table.marketAcct, table.updatedSlot)
}));

export const transactions = pgTable('transactions', {
  txSig: transaction('tx_sig').primaryKey(),
  slot: slot('slot').notNull(),
  blockTime: timestamp('block_time').notNull(),
  failed: boolean('failed').notNull(),
  payload: text('payload').notNull(),
  serializerLogicVersion: smallint('serializer_logic_version').notNull(),
}, table => ({
  slotIdx: index('slot_index').on(table.slot)
}));

// These are responsible for getting all signatures involving an account
// historically and real time, and writing them to the transactions table for processing.
// Each proposal / spot market / autocrat version upgrade will result in another entry.
export const transactionWatchers = pgTable('transaction_watchers', {
  acct: pubkey('acct').primaryKey(),
  latestTxSig: transaction('latest_tx_sig').references(() => transactions.txSig),
  /**
   * We can use this to monitor if the transaction history is being cleared by the rpc. 
   * Ideally this should not change once set.
   */
  firstTxSig: transaction('first_tx_sig').references(() => transactions.txSig),
  /**
   * This may be significantly higher than the slot of the latest signature. The invariant here
   * is that no new transaction observed by the watcher may be less than or equal to the checkedUpToSlot
   */
  checkedUpToSlot: slot('checked_up_to_slot').notNull(),
  serializerLogicVersion: smallint('serializer_logic_version').notNull(),
  description: text('description').notNull()
});

export const transactionWatcherTransactions = pgTable('transaction_watcher_transactions', {
  watcherAcct: pubkey('watcher_acct').references(() => transactionWatchers.acct).notNull(),
  txSig: transaction('tx_sig').references(() => transactions.txSig).notNull(),
  slot: slot('slot').notNull()
}, table => ({
  pk: primaryKey(table.watcherAcct, table.txSig),
  slotIdx: index('slot_index').on(table.watcherAcct, table.slot)
}));

enum IndexerImplementation {
  AutocratV0OpenbookV2 = 'AutocratV0OpenbookV2'
}

export const indexers = pgTable('indexers', {
  name: varchar('name', {length: 100}).primaryKey(),
  implementation: pgEnum('implementation', IndexerImplementation).notNull(),
  latestSlotProcessed: slot('latest_slot_processed').notNull()
});

export const indexerAccountDependencies = pgTable('indexer_account_dependencies', {
  name: varchar('name', {length: 100}).references(() => indexers.name).notNull(),
  acct: pubkey('acct').references(() => transactionWatchers.acct).notNull(),
  latestTxSigProcessed: transaction('latest_tx_sig_processed').references(() => transactions.txSig)
}, table => ({
  pk: primaryKey(table.name, table.acct)
}));

// By indexing specific ATAs, we can track things like market liquidity over time
// or META circulating supply by taking total META supply minus the treasury's account
export const tokenAccts = pgTable('token_accts', {
  // ATA PGA
  tokenAcct: pubkey('token_acct').primaryKey(),
  mintAcct: pubkey('mint_acct').references(() => tokens.mintAcct).notNull(),
  ownerAcct: pubkey('owner_acct').notNull(),
  amount: tokenAmount('amount').notNull(),
  updatedAt: timestamp('updated_at').notNull()
});

export const tokens = pgTable('tokens', {
  mintAcct: pubkey('mint_acct').primaryKey(),
  name: varchar('name', {length: 30}).notNull(),
  symbol: varchar('symbol', {length: 10}).notNull(),
  supply: tokenAmount('supply').notNull(),
  decimals: smallint('decimals').notNull(),
  updatedAt: timestamp('updated_at').notNull()
});

export enum OrderSide {
  BID = 'BID',
  ASK = 'ASK'
}

// Can result in multiple makes and takes
export const orders = pgTable('orders', {
  orderTxSig: transaction('order_tx_sig').primaryKey(),
  marketAcct: pubkey('market_acct').references(() => markets.marketAcct).notNull(),
  actorAcct: pubkey('actor_acct').notNull(),
  side: pgEnum('side', OrderSide).notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  // Starts true, switches to false on cancellation or full fill
  isActive: boolean('is_active').notNull(),

  unfilledBaseAmount: tokenAmount('unfilled_base_amount').notNull(),
  filledBaseAmount: tokenAmount('filled_base_amount').notNull(),
  quotePrice: tokenAmount('quote_price').notNull(),

  orderBlock: block('order_block').notNull(),
  orderTime: timestamp('order_time').notNull(),

  // Only present on order cancel
  cancelTxSig: transaction('cancel_tx_sig'),
  cancelBlock: block('cancel_block'),
  cancelTime: timestamp('cancel_time'),  
}, table => ({
  // For displaying user trade history
  actorIdx: index('actor_index').on(table.marketAcct, table.actorAcct)
}));

export const makes = pgTable('makes', {
  orderTxSig: transaction('order_tx_sig').references(() => orders.orderTxSig).primaryKey(),
  // Explicitly denormalizing order for improved querying speed directly on makes
  marketAcct: pubkey('market_acct').references(() => markets.marketAcct).notNull(),
  isActive: boolean('is_active').notNull(),

  // Represents unfilled volume
  unfilledBaseAmount: tokenAmount('unfilled_base_amount').notNull(),
  // Starts at 0, increases as more is filled
  filledBaseAmount: tokenAmount('filled_base_amount').notNull(),
  quotePrice: tokenAmount('quote_price').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
}, table => ({
  // For displaying current order book
  marketIdx: index('market_index').on(table.marketAcct)
}));

// Potentially many takes for one taker order (if multiple makes are being matched)
export const takes = pgTable('takes', {
  orderTxSig: transaction('order_tx_sig').references(() => orders.orderTxSig).primaryKey(),
  baseAmount: tokenAmount('base_amount').notNull(),
  quotePrice: tokenAmount('quote_price').notNull(),
  takerBaseFee: tokenAmount('taker_base_fee').notNull(),
  takerQuoteFee: tokenAmount('maker_quote_fee').notNull(),

  // Maker fields will be NULL on pure AMMs
  makerOrderTxSig: transaction('maker_order_tx_sig').references(() => makes.orderTxSig),
  makerBaseFee: tokenAmount('maker_base_fee'),
  makerQuoteFee: tokenAmount('maker_quote_fee'),

  // Explicitly denormalizing order for improved querying speed directly on takes
  marketAcct: pubkey('market_acct').references(() => markets.marketAcct).notNull(),
  orderBlock: block('order_block').notNull(),
  orderTime: timestamp('order_time').notNull(),
}, table => ({
  // For aggregating into candles and showing latest trades
  blockIdx: index('block_index').on(table.marketAcct, table.orderBlock),
  timeIdx: index('time_index').on(table.marketAcct, table.orderTime),
  // For finding all matches related to a maker order
  makerIdx: index('maker_index').on(table.makerOrderTxSig)
}));

export const candles = pgTable('candles', {
  marketAcct: pubkey('market_acct').references(() => markets.marketAcct).notNull(),
  // In seconds
  candleDuration: integer('candle_duration').notNull(),
  // Repeats every duration
  timestamp: timestamp('timestamp').notNull(),
  // (base token amount)
  volume: tokenAmount('volume').notNull(),
  // Nullable in case where there were no trades
  // (quote token amounts)
  open: tokenAmount('open'),
  high: tokenAmount('high'),
  low: tokenAmount('low'),
  close: tokenAmount('close'),
  // time-weighted average of the candle. If candle was empty, set to prior close
  candleAverage: tokenAmount('candle_average').notNull(),
  // Nullable in case market is not a futarchy market
  condMarketTwap: tokenAmount('cond_market_twap')
}, table => ({
  pk: primaryKey(table.marketAcct, table.candleDuration, table.timestamp)
}));
