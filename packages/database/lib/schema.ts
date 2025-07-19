import { desc, SQL, sql } from "drizzle-orm";
import {
  bigint,
  doublePrecision,
  integer,
  numeric,
  smallint,
  index,
  pgTable,
  primaryKey,
  unique,
  boolean,
  timestamp,
  varchar,
  text,
  jsonb,
  uuid,
  pgView,
  QueryBuilder,
  bigserial,
} from "drizzle-orm/pg-core";

// Implementation discussed here https://github.com/metaDAOproject/futarchy-indexer/pull/1
// Incorporated ideas from 0xNallok's version
// https://github.com/R-K-H/openbook-v2-datastore/blob/master/timescale/models/001_tables.up.sql

// https://docs.rs/solana-program/latest/src/solana_program/pubkey.rs.html#24
const MAX_PUBKEY_B58_STR_LEN = 44;
const pubkey = (columnName: string) =>
  varchar(columnName, { length: MAX_PUBKEY_B58_STR_LEN });

const MAX_TRANSACTION_B58_STR_LEN = 88;
const transaction = (columnName: string) =>
  varchar(columnName, { length: MAX_TRANSACTION_B58_STR_LEN });

const tokenAmount = (columnName: string) =>
  bigint(columnName, { mode: "bigint" });

const biggerTokenAmount = (columnName: string) => numeric(columnName);

const block = (columnName: string) => bigint(columnName, { mode: "bigint" });
const slot = (columnName: string) => bigint(columnName, { mode: "bigint" });

const biggerBlock = (columnName: string) => numeric(columnName);

const biggerSlot = (columnName: string) => numeric(columnName);

export enum MarketType {
  OPEN_BOOK_V2 = "openbookv2",
  ORCA_WHIRLPOOL = "orca_whirlpool",
  METEORA = "meteora",
  FUTARCHY_AMM = "amm", // MetaDAO's custom hybrid Clob/AMM impl (see proposal 4)
  JUPITER_QUOTE = "jupiter_quote",
  BIRDEYE_PRICES = "birdeye_prices",
}

export enum ProposalStatus {
  Pending = "Pending",
  Passed = "Passed",
  Failed = "Failed",
}

export enum Reactions {
  ThumbsUp = "ThumbsUp",
  Rocket = "Rocket",
  Heart = "Heart",
  ThumbsDown = "ThumbsDown",
  Fire = "Fire",
  Eyes = "Eyes",
  LaughingFace = "LaughingFace",
  FrownyFace = "FrownyFace",
  Celebrate = "Celebrate",
}

export enum V04SwapType {
  Buy = "Buy",
  Sell = "Sell",
}

export enum V04ProposalState {
  Pending = "Pending",
  Passed = "Passed",
  Failed = "Failed",
  Executed = "Executed",
}

export enum V04LaunchState {
  Initialized = "Initialized",
  Live = "Live",
  Complete = "Complete",
  Refunding = "Refunding",
}

export enum V05SwapType {
  Buy = "Buy",
  Sell = "Sell",
}

export enum V05ProposalState {
  Pending = "Pending",
  Passed = "Passed",
  Failed = "Failed",
}
export enum V05LaunchState {
  Initialized = "Initialized",
  Live = "Live",
  Complete = "Complete",
  Refunding = "Refunding",
}

type NonEmptyList<E> = [E, ...E[]];

function pgEnum<T extends string>(columnName: string, enumObj: Record<any, T>) {
  return varchar(columnName, {
    enum: Object.values(enumObj) as NonEmptyList<T>,
  });
}

const qb = new QueryBuilder();

export const daos = pgTable(
  "daos",
  {
    daoAcct: pubkey("dao_acct").primaryKey(),
    programAcct: pubkey("program_acct")
      .notNull()
      .references(() => programs.programAcct),
    // This data may change with each program upgrade, therefore keeping details separate
    // makes the most sense.
    daoId: bigint("dao_id", { mode: "bigint" }).references(
      () => daoDetails.daoId
    ),
    // In FaaS, each DAO is tied to its own token which futarchic markets will aim to pomp to the moon
    baseAcct: pubkey("base_acct")
      .references(() => tokens.mintAcct)
      .notNull(),
    quoteAcct: pubkey("quote_acct").references(() => tokens.mintAcct).notNull(),
    treasuryAcct: pubkey("treasury_acct").unique(),
    // This is keyed for proposals and initialized when dao is created.
    slotsPerProposal: numeric("slots_per_proposal"),
    // TODO: should we add proposal count???
    passThresholdBps: bigint("pass_threshold_bps", { mode: "bigint" }),
    twapInitialObservation: numeric("twap_initial_observation"),
    twapMaxObservationChangePerUpdate: numeric("twap_max_observation_change_per_update"),
    minQuoteFutarchicLiquidity: numeric("min_quote_futarchic_liquidity"),
    minBaseFutarchicLiquidity: numeric("min_base_futarchic_liquidity"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    isActive: boolean("is_active").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    organizationId: bigint("organization_id", { mode: "bigint" })
      .references(() => organizations.organizationId),
    colors: jsonb("colors"),
  },
  (table) => ({
    daoProgram: unique("dao_acct_program").on(table.daoAcct, table.programAcct),
  })
);

export const proposals = pgTable("proposals", {
  proposalAcct: pubkey("proposal_acct").primaryKey(),
  daoAcct: pubkey("dao_acct")
    .references(() => daos.daoAcct)
    .notNull(),
  proposalNum: bigint("proposal_num", { mode: "bigint" }).notNull(),
  // NOTE: We can infer this THROUGH dao...
  autocratVersion: doublePrecision("autocrat_version").notNull(),
  proposerAcct: pubkey("proposer_acct").notNull(),
  initialSlot: biggerSlot("initial_slot").notNull(),
  // NOTE: We can add the dao slots_per_proposal to the initial_slot to get this
  endSlot: biggerSlot("end_slot"),
  status: pgEnum("status", ProposalStatus).notNull(),
  descriptionURL: varchar("description_url"),
  pricingModelPassAcct: pubkey("pricing_model_pass_acct"),
  pricingModelFailAcct: pubkey("pricing_model_fail_acct"),
  passMarketAcct: pubkey("pass_market_acct").notNull(),
  failMarketAcct: pubkey("fail_market_acct").notNull(),
  baseVault: pubkey("base_vault").references(
    () => conditionalVaults.condVaultAcct
  ).notNull(),
  quoteVault: pubkey("quote_vault").references(
    () => conditionalVaults.condVaultAcct
  ).notNull(),
  durationInSlots: biggerSlot("duration_in_slots"),
  passThresholdBps: bigint("pass_threshold_bps", { mode: "bigint" }),
  twapInitialObservation: biggerTokenAmount("twap_initial_observation"),
  twapMaxObservationChangePerUpdate: biggerTokenAmount(
    "twap_max_observation_change_per_update"
  ),
  minQuoteFutarchicLiquidity: biggerTokenAmount("min_quote_futarchic_liquidity"),
  minBaseFutarchicLiquidity: biggerTokenAmount("min_base_futarchic_liquidity"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),

  // NOTE: This too like the end slot can be approximated, however we can update it
  endedAt: timestamp("ended_at", { withTimezone: true }),
  // NOTE: Once the proposal is finalized / reverted this can be set for ease of access
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const markets = pgTable("markets", {
  marketAcct: pubkey("market_acct").primaryKey(),
  marketType: pgEnum("market_type", MarketType).notNull(),
  createTxSig: transaction("create_tx_sig").notNull(),

  // proposal-specific fields may be null as market might not be tied to any one proposal
  // (ex: the META spot market)
  proposalAcct: pubkey("proposal_acct").references(
    () => proposals.proposalAcct
  ),

  baseMintAcct: pubkey("base_mint_acct")
    .references(() => tokens.mintAcct)
    .notNull(),
  quoteMintAcct: pubkey("quote_mint_acct")
    .references(() => tokens.mintAcct)
    .notNull(),

  baseLotSize: biggerTokenAmount("base_lot_size").notNull(),
  quoteLotSize: biggerTokenAmount("quote_lot_size").notNull(),
  quoteTickSize: biggerTokenAmount("quote_tick_size").notNull(),

  // Monitoring the total supply on either side of the market
  // (helpful in case of AMMs where LPs are not tracked in the makes table)
  // NOTE: These can be the conditional vault references given the market, in this
  // case the bids is where deposits for bids exist (eg the quote token) and for asks
  // it's where deposits for asks exist (eg the base token)
  bidsTokenAcct: pubkey("bids_token_acct").references(
    () => tokenAccts.tokenAcct
  ),
  asksTokenAcct: pubkey("asks_token_acct").references(
    () => tokenAccts.tokenAcct
  ),

  // Fees are in bips
  baseMakerFee: smallint("base_maker_fee").notNull(),
  baseTakerFee: smallint("base_taker_fee").notNull(),
  quoteMakerFee: smallint("quote_maker_fee").notNull(),
  quoteTakerFee: smallint("quote_taker_fee").notNull(),

  // When market becomes active or inactive
  activeSlot: biggerSlot("active_slot"),
  inactiveSlot: biggerSlot("inactive_slot"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  baseAmount: biggerTokenAmount("base_amount"),
  quoteAmount: biggerTokenAmount("quote_amount"),
});

export enum PricesType {
  Spot = "spot",
  Conditional = "conditional",
}

export const prices = pgTable(
  "prices",
  {
    marketAcct: pubkey("market_acct")
      .references(() => markets.marketAcct)
      .notNull(),
    updatedSlot: biggerSlot("updated_slot").notNull(),
    baseAmount: biggerTokenAmount("base_amount"),
    quoteAmount: biggerTokenAmount("quote_amount"),
    price: numeric("price", {
      precision: 40,
      scale: 20,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: text("created_by"),
    pricesType: pgEnum("prices_type", PricesType).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.createdAt, table.marketAcct] }),
    marketBySlotIdx: index("market_by_slot_index").on(
      table.marketAcct,
      table.updatedSlot
    ),
  })
);

export const twaps = pgTable(
  "twaps",
  {
    marketAcct: pubkey("market_acct")
      .references(() => markets.marketAcct)
      .notNull(),
    proposalAcct: pubkey("proposal_acct")
      .references(() => proposals.proposalAcct),
    updatedSlot: biggerSlot("updated_slot").notNull(),
    // max u128 value is 340282366920938463463374607431768211455 (39 digits)
    // the account field is u128 https://github.com/metaDAOproject/openbook-twap/blob/82690c33a091b82e908843a14ad1a571dfba12b1/programs/openbook-twap/src/lib.rs#L52
    observationAgg: numeric("observation_agg", {
      precision: 40,
      scale: 0,
    }).notNull(),
    lastObservation: numeric("last_observation", {
      precision: 40,
      scale: 0,
    }),
    lastPrice: numeric("last_price", {
      precision: 40,
      scale: 0,
    }),
    curTwap: biggerTokenAmount("token_amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    // consider changing PK to be createdAt
    pk: primaryKey({ columns: [table.updatedSlot, table.marketAcct] }),
  })
);

export enum InstructionType {
  VaultMintConditionalTokens = "vault_mint_conditional_tokens",
  VaultMintAndAmmSwap = "vault_mint_and_amm_swap",
  AmmSwap = "amm_swap",
  AmmDeposit = "amm_deposit",
  AmmWithdraw = "amm_withdraw",
  OpenbookPlaceOrder = "openbook_place_order",
  OpenbookCancelOrder = "openbook_cancel_order",
  AutocratInitializeProposal = "autocrat_initialize_proposal",
  AutocratFinalizeProposal = "autocrat_finalize_proposal",
  VaultMergeConditionalTokens = "vault_merge_conditional_tokens",
  VaultRedeemConditionalTokensForUnderlyingTokens = "vault_redeem_conditional_tokens_for_underlying_tokens",
}

export const transactions = pgTable(
  "transactions",
  {
    txSig: transaction("tx_sig").primaryKey(),
    slot: biggerSlot("slot").notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
    failed: boolean("failed").notNull(),
    payload: text("payload").notNull(),
    serializerLogicVersion: smallint("serializer_logic_version").notNull(),
    mainIxType: pgEnum("main_ix_type", InstructionType),
  },
  (table) => ({
    slotIdx: index("txn_slot_index").on(table.slot),
  })
);

// These are responsible for getting all signatures involving an account
// historically and real time, and writing them to the transactions table for processing.
// Each proposal / spot market / autocrat version upgrade will result in another entry.

export enum TransactionWatchStatus {
  Active = "active",
  Failed = "failed",
  Disabled = "disabled",
}

export const transactionWatchers = pgTable("transaction_watchers", {
  acct: pubkey("acct").primaryKey(),
  latestTxSig: transaction("latest_tx_sig").references(
    () => transactions.txSig
  ),
  /**
   * We can use this to monitor if the transaction history is being cleared by the rpc.
   * Ideally this should not change once set.
   */
  firstTxSig: transaction("first_tx_sig").references(() => transactions.txSig),
  /**
   * This may be significantly higher than the slot of the latest signature. The invariant here
   * is that no new transaction observed by the watcher may be less than or equal to the checkedUpToSlot
   */
  checkedUpToSlot: biggerSlot("checked_up_to_slot").notNull(),
  serializerLogicVersion: smallint("serializer_logic_version").notNull(),
  description: text("description").notNull(),
  status: pgEnum("status", TransactionWatchStatus)
    .default(TransactionWatchStatus.Disabled)
    .notNull(),
  failureLog: text("failure_log"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const transactionWatcherTransactions = pgTable(
  "transaction_watcher_transactions",
  {
    watcherAcct: pubkey("watcher_acct")
      .references(() => transactionWatchers.acct)
      .notNull(),
    txSig: transaction("tx_sig")
      .references(() => transactions.txSig)
      .notNull(),
    slot: biggerSlot("slot").notNull(),
  },
  (table) => ({
    pk: primaryKey(table.watcherAcct, table.txSig),
    slotIdx: index("watcher_slot_index").on(table.watcherAcct, table.slot),
  })
);

export enum IndexerImplementation {
  AutocratV0OpenbookV2 = "AutocratV0OpenbookV2",
  AmmMarketIndexer = "AmmMarketIndexer",
  AmmMarketInstructionsIndexer = "AmmMarketInstructionsIndexer",
  AmmMarketsAccountFetch = "AmmMarketsAccountFetch",
  AmmMarketsLogsSubscribe = "AmmMarketsLogsSubscribe",
  OpenbookV2MarketIndexer = "OpenbookV2MarketIndexer",
  JupiterQuotesIndexer = "JupiterQuotesIndexer",
  BirdeyePricesIndexer = "BirdeyePricesIndexer",
  AutocratDaoIndexer = "AutocratDaoIndexer",
  AutocratProposalIndexer = "AutocratProposalIndexer",
  TokenMintIndexer = "TokenMintIndexer",
}
export enum IndexerType {
  TXHistory = "TXHistory",
  AccountInfo = "AccountInfo",
  IntervalFetch = "IntervalFetch",
  LogSubscribe = "LogsSubscribe",
}

export const indexers = pgTable("indexers", {
  name: varchar("name", { length: 100 }).primaryKey(),
  implementation: pgEnum("implementation", IndexerImplementation).notNull(),
  latestSlotProcessed: biggerSlot("latest_slot_processed").notNull(),
  latestTxSigProcessed: transaction("latest_tx_sig_processed"), //TODO: unify transactions and signatures table and add reference here
  indexerType: pgEnum("indexer_type", IndexerType).notNull(),
});

export enum IndexerAccountDependencyStatus {
  Active = "active",
  Disabled = "disabled",
  Paused = "paused",
}

export const indexerAccountDependencies = pgTable(
  "indexer_account_dependencies",
  {
    name: varchar("name", { length: 100 })
      .references(() => indexers.name)
      .notNull(),
    acct: pubkey("acct").notNull(),
    latestTxSigProcessed: transaction("latest_tx_sig_processed").references(
      () => transactions.txSig
    ),
    status: pgEnum("status", IndexerAccountDependencyStatus).default(
      IndexerAccountDependencyStatus.Active
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey(table.name, table.acct),
  })
);

export enum TokenAcctStatus {
  Watching = "watching",
  Enabled = "enabled",
  Disabled = "disabled",
}

// By indexing specific ATAs, we can track things like market liquidity over time
// or META circulating supply by taking total META supply minus the treasury's account
export const tokenAccts = pgTable("token_accts", {
  // ATA PGA
  amount: biggerTokenAmount("amount").notNull(),
  mintAcct: pubkey("mint_acct")
    .references(() => tokens.mintAcct)
    .notNull(),
  ownerAcct: pubkey("owner_acct").notNull(),
  status: pgEnum("status", TokenAcctStatus).default(TokenAcctStatus.Enabled),
  tokenAcct: pubkey("token_acct").primaryKey(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// By indexing specific ATAs, we can track things like market liquidity over time
// or META circulating supply by taking total META supply minus the treasury's account
export const tokenAcctBalances = pgTable(
  "token_acct_balances",
  {
    // ATA PGA
    tokenAcct: pubkey("token_acct")
      .notNull()
      .references(() => tokenAccts.tokenAcct),
    mintAcct: pubkey("mint_acct")
      .references(() => tokens.mintAcct)
      .notNull(),
    ownerAcct: pubkey("owner_acct").notNull(),
    amount: biggerTokenAmount("amount").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    delta: biggerTokenAmount("delta")
      .notNull()
      .default(sql`0`),
    slot: biggerSlot("slot"),
    txSig: transaction("tx_sig").references(() => transactions.txSig),
  },
  (table) => ({
    pk: primaryKey(
      table.tokenAcct,
      table.mintAcct,
      table.amount,
      table.created_at
    ),
    acctAmountCreated: index("acct_amount_created").on(
      table.tokenAcct,
      table.created_at,
      table.amount
    ),
  })
);

export const tokens = pgTable("tokens", {
  mintAcct: pubkey("mint_acct").primaryKey(),
  name: varchar("name", { length: 30 }).notNull(),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  supply: biggerTokenAmount("supply").notNull(),
  decimals: smallint("decimals").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  imageUrl: varchar("image_url"),
});

export enum OrderSide {
  BID = "BID",
  ASK = "ASK",
}

// Can result in multiple makes and takes
export const orders = pgTable(
  "orders",
  {
    orderTxSig: transaction("order_tx_sig")
      .primaryKey()
      .references(() => transactions.txSig),
    marketAcct: pubkey("market_acct")
      .references(() => markets.marketAcct)
      .notNull(),
    actorAcct: pubkey("actor_acct")
      .references(() => users.userAcct)
      .notNull(),
    side: pgEnum("side", OrderSide).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    // Starts true, switches to false on cancellation or full fill
    isActive: boolean("is_active").notNull(),

    unfilledBaseAmount: biggerTokenAmount("unfilled_base_amount").notNull(),
    filledBaseAmount: biggerTokenAmount("filled_base_amount").notNull(),
    quotePrice: numeric("quote_price", {
      precision: 40,
      scale: 20,
    }).notNull(),

    orderBlock: biggerBlock("order_block").notNull(),
    orderTime: timestamp("order_time", { withTimezone: true }).notNull(),

    // Only present on order cancel
    cancelTxSig: transaction("cancel_tx_sig"),
    cancelBlock: biggerBlock("cancel_block"),
    cancelTime: timestamp("cancel_time", { withTimezone: true }),
  },
  (table) => ({
    // For displaying user trade history
    actorIdx: index("actor_index").on(table.marketAcct, table.actorAcct),
  })
);

export const makes = pgTable(
  "makes",
  {
    orderTxSig: transaction("order_tx_sig")
      .references(() => orders.orderTxSig)
      .primaryKey(),
    // Explicitly denormalizing order for improved querying speed directly on makes
    marketAcct: pubkey("market_acct")
      .references(() => markets.marketAcct)
      .notNull(),
    isActive: boolean("is_active").notNull(),

    // Represents unfilled volume
    unfilledBaseAmount: biggerTokenAmount("unfilled_base_amount").notNull(),
    // Starts at 0, increases as more is filled
    filledBaseAmount: biggerTokenAmount("filled_base_amount").notNull(),
    quotePrice: numeric("quote_price", {
      precision: 40,
      scale: 20,
    }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    // For displaying current order book
    marketIdx: index("market_index").on(table.marketAcct),
  })
);

// Potentially many takes for one taker order (if multiple makes are being matched)
export const takes = pgTable(
  "takes",
  {
    takeId: uuid("take_id").notNull().defaultRandom().primaryKey(),
    orderTxSig: transaction("order_tx_sig")
      .references(() => orders.orderTxSig),
    baseAmount: biggerTokenAmount("base_amount").notNull(),
    quotePrice: numeric("quote_price", {
      precision: 40,
      scale: 20,
    }).notNull(),
    takerBaseFee: tokenAmount("taker_base_fee").notNull(),
    takerQuoteFee: tokenAmount("taker_quote_fee")
      .notNull()
      .default(0 as unknown as bigint),
    // Maker fields will be NULL on pure AMMs
    makerOrderTxSig: transaction("maker_order_tx_sig").references(
      () => makes.orderTxSig
    ),
    makerBaseFee: tokenAmount("maker_base_fee"),
    makerQuoteFee: tokenAmount("maker_quote_fee"),

    // Explicitly denormalizing order for improved querying speed directly on takes
    marketAcct: pubkey("market_acct")
      .references(() => markets.marketAcct)
      .notNull(),
    orderBlock: biggerBlock("order_block").notNull(),
    orderTime: timestamp("order_time", { withTimezone: true }).notNull(),
    baseDecimals: smallint("base_decimals"),
    quoteDecimals: smallint("quote_decimals"),
  },
  (table) => ({
    // For aggregating into candles and showing latest trades
    blockIdx: index("block_index").on(table.marketAcct, table.orderBlock),
    timeIdx: index("time_index").on(table.marketAcct, table.orderTime),
    // For finding all matches related to a maker order
    makerIdx: index("maker_index").on(table.makerOrderTxSig),
  })
);

export const candles = pgTable(
  "candles",
  {
    marketAcct: pubkey("market_acct")
      .references(() => markets.marketAcct)
      .notNull(),
    // In seconds
    candleDuration: integer("candle_duration").notNull(),
    // Repeats every duration
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    // (base token amount)
    volume: biggerTokenAmount("volume").notNull(),
    // Nullable in case where there were no trades
    // (quote token amounts)
    open: biggerTokenAmount("open"),
    high: biggerTokenAmount("high"),
    low: biggerTokenAmount("low"),
    close: biggerTokenAmount("close"),
    // time-weighted average of the candle. If candle was empty, set to prior close
    candleAverage: biggerTokenAmount("candle_average").notNull(),
    // Nullable in case market is not a futarchy market
    condMarketTwap: biggerTokenAmount("cond_market_twap"),
  },
  (table) => ({
    pk: primaryKey(table.marketAcct, table.candleDuration, table.timestamp),
  })
);

export const comments = pgTable("comments", {
  // Need this as we reference this for response and nesting
  commentId: bigint("comment_id", { mode: "bigint" })
    .notNull()
    .primaryKey()
    .unique(),
  // Generated when comment is created
  commentorAcct: pubkey("commentor_acct").notNull(),
  proposalAcct: pubkey("proposal_acct")
    .references(() => proposals.proposalAcct)
    .notNull(),
  // This will be the body content of the comment
  content: text("content").notNull(),
  // Use only if its a responding comment in a chain, we should constrain this so
  // it references only commentIds which have respondingCommentId with NULL
  respondingCommentId: bigint("responding_comment_id", {
    mode: "bigint",
  }).references(() => comments.commentId),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const reactions = pgTable("reactions", {
  reactionId: uuid("reaction_id").notNull().defaultRandom().primaryKey(),
  reactorAcct: pubkey("reactor_acct").notNull(),
  commentId: bigint("comment_id", { mode: "bigint" }).references(
    () => comments.commentId
  ),
  proposalAcct: pubkey("proposal_acct").references(
    () => proposals.proposalAcct
  ),
  reaction: pgEnum("reaction", Reactions).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// Note: Before a user can generate a session they need to be insterted into the DB
export const users = pgTable("users", {
  userAcct: pubkey("user_acct").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  userName: text("user_name").unique(),
  imageUrl: text("image_url"),
});

export const sessions = pgTable("sessions", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  userAcct: pubkey("user_acct").references(() => users.userAcct, {
    onDelete: "restrict",
    onUpdate: "restrict",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at"),
});
export const programs = pgTable(
  "programs",
  {
    // The top level for parsing through any and all programs.
    // In theory we can make requests from this and fetch all we may want
    // to know.
    programAcct: pubkey("program_acct").notNull().primaryKey(),
    version: doublePrecision("version").notNull(),
    // For example: autocrat, openbook_twap, openbook, conditional_vault
    programName: varchar("program_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    deployedAt: timestamp("deployed_at"),
  },
  (table) => ({
    programVersion: unique("program_version").on(
      table.programAcct,
      table.version
    ),
  })
);

export const daoDetails = pgTable(
  "dao_details",
  {
    // This table holds details which while daos upgrade, the info may not.
    daoId: bigint("dao_id", { mode: "bigint" }).primaryKey(),
    name: varchar("name").unique(),
    // Useful for fetching from a URL
    slug: varchar("slug").unique(),
    url: varchar("url").unique(),
    xAccount: varchar("x_account").unique(),
    gitHub: varchar("github").unique(),
    description: text("description"),
    imageUrl: varchar("image_url"),
    // Added this in anticipation for web3 auth.
    creator_acct: pubkey("creator_acct"),
    // A way for other people to have permissions to make changes.
    admin_accts: jsonb("admin_accts"),
    // By initalizing these in the dao details we can reference them on ANY token
    // which is created through proposals and cascading down through. So the data
    // will be duplicated, but referencing through this will reduce the burden
    // of rpc and afford us flexibility with unkown tokens in the UI.
    // This is a happy medium before we get to onchain data.
    token_image_url: varchar("token_image_url"),
    pass_token_image_url: varchar("pass_token_image_url"),
    fail_token_image_url: varchar("fail_token_image_url"),
    lp_token_image_url: varchar("lp_token_image_url"),
    isHide: boolean("is_hide"),
    socials: jsonb("socials"),
    organizationId: bigint("organization_id", { mode: "bigint" })
      .references(() => organizations.organizationId),
    baseMint: pubkey("base_mint"),
    quoteMint: pubkey("quote_mint"),
    daoAcct: pubkey("dao_acct"),
    isActive: boolean("is_active").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (table) => ({
    uniqueId: unique("id_name_url").on(table.daoId, table.url, table.name),
  })
);

export const proposalDetails = pgTable("proposal_details", {
  // This table holds details for proposals which are not part of the indexing service.
  proposalId: bigserial("proposal_id", { mode: "bigint" }).primaryKey(),
  // Our reference to on-chain data
  proposalAcct: pubkey("proposal_acct").references(
    () => proposals.proposalAcct
  ),
  title: varchar("title"),
  // Useful for fetching from a URL
  slug: varchar("slug").unique(),
  description: varchar("description"),
  // NOTE: Could be another table for indexing, jsonb view is likely fine.
  categories: jsonb("categories"),
  content: text("content"),
  // Added in anticipation for web3 auth.
  proposer_acct: pubkey("proposer_acct"),
  // This data is duplicated, given the fact that a proposal initialize can fail,
  // the capacity in the UI (to store accounts) needs to be set such that you can
  // unwind what HAS been done (and reclaim). By doing this we're not mapping on anything
  // that can or should be indexed, this is just a state manager which affords the
  // above.
  base_cond_vault_acct: pubkey("base_cond_vault_acct"),
  quote_cond_vault_acct: pubkey("quote_cond_vault_acct"),
  pass_market_acct: pubkey("pass_market_acct"),
  fail_market_acct: pubkey("fail_market_acct"),
  discussion_link: text("discussion_link"),
  proposal_link: text("proposal_link"),
  state: text("state").notNull().default("draft"),
  summary: text("summary"),
  organizationId: bigint("organization_id", { mode: "bigint" })
    .references(() => organizations.organizationId),
  proposalIndex: bigint("proposal_index", { mode: "bigint" }).notNull().default(0 as unknown as bigint),
});

export const programSystem = pgTable("program_system", {
  // This makes up what we know and undestand a "working system" to be
  systemVersion: doublePrecision("system_version").primaryKey(),
  autocratAcct: pubkey("autocrat_acct")
    .notNull()
    .references(() => programs.programAcct),
  conditionalVaultAcct: pubkey("conditional_vault_acct")
    .notNull()
    .references(() => programs.programAcct),
  pricingModelAcct: pubkey("pricing_model_acct")
    .notNull()
    .references(() => programs.programAcct),
  migratorAcct: pubkey("migrator_acct").references(() => programs.programAcct),
});

export const conditionalVaults = pgTable("conditional_vaults", {
  // These make up off of a proposal
  condVaultAcct: pubkey("cond_vault_acct").notNull().primaryKey(),
  status: varchar("status"),
  // In newest program version this is the proposal account
  settlementAuthority: pubkey("settlement_authority").notNull(),
  underlyingMintAcct: pubkey("underlying_mint_acct")
    .notNull()
    .references(() => tokens.mintAcct),
  underlyingTokenAcct: pubkey("underlying_token_acct").notNull(),
  nonce: varchar("nonce"),
  condFinalizeTokenMintAcct: pubkey("cond_finalize_token_mint_acct").notNull(),
  condRevertTokenMintAcct: pubkey("cond_revert_token_mint_acct").notNull(),
});

export const userPerformance = pgTable(
  "user_performance",
  {
    // These make up off of a proposal
    proposalAcct: pubkey("proposal_acct")
      .notNull()
      .references(() => proposals.proposalAcct),
    userAcct: pubkey("user_acct")
      .notNull()
      .references(() => users.userAcct),
    daoAcct: pubkey("dao_acct")
      .notNull()
      .references(() => daos.daoAcct),
    tokensBought: numeric("tokens_bought", {
      precision: 40,
      scale: 20,
    }).notNull(),
    tokensSold: numeric("tokens_sold", {
      precision: 40,
      scale: 20,
    }).notNull(),
    volumeBought: numeric("volume_bought", {
      precision: 40,
      scale: 20,
    }).notNull(),
    volumeSold: numeric("volume_sold", {
      precision: 40,
      scale: 20,
    }).notNull(),
    totalVolume: numeric("total_volume", {
      precision: 40,
      scale: 20,
    })
      .notNull()
      .default("0.0"),
    tokensBoughtResolvingMarket: numeric("tokens_bought_resolving_market", {
      precision: 40,
      scale: 20,
    })
      .notNull()
      .default("0.0"),
    tokensSoldResolvingMarket: numeric("tokens_sold_resolving_market", {
      precision: 40,
      scale: 20,
    })
      .notNull()
      .default("0.0"),
    volumeBoughtResolvingMarket: numeric("volume_bought_resolving_market", {
      precision: 40,
      scale: 20,
    })
      .notNull()
      .default("0.0"),
    volumeSoldResolvingMarket: numeric("volume_sold_resolving_market", {
      precision: 40,
      scale: 20,
    })
      .notNull()
      .default("0.0"),
    buyOrdersCount: bigint("buy_orders_count", { mode: "bigint" })
      .notNull()
      .default(0 as unknown as bigint),
    sellOrdersCount: bigint("sell_orders_count", { mode: "bigint" })
      .notNull()
      .default(0 as unknown as bigint),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.proposalAcct, table.userAcct] }),
    };
  }
);

export const signature_accounts = pgTable("signature_accounts", {
  signature: transaction("signature").notNull(),
  account: pubkey("account").notNull(),
  insertedAt: timestamp("inserted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.signature, table.account] }),
  accountIdx: index("account_index").on(table.account),
}));

export const signatures = pgTable(
  "signatures",
  {
    signature: transaction("signature").primaryKey(),
    slot: biggerSlot("slot").notNull(),
    didErr: boolean("did_err").notNull(),
    err: text("err"),
    blockTime: timestamp("block_time", { withTimezone: true }),
    insertedAt: timestamp("inserted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    seqNum: bigserial("seq_num", { mode: "bigint" }).notNull().unique(),
  },
  (table) => ({
    slotIdx: index("slot_index").on(table.slot),
    sequenceNumIdx: index("sequence_num_index").on(table.seqNum),
  })
);

export const v0_4_amms = pgTable("v0_4_amms", {
  ammAddr: pubkey("amm_addr").primaryKey(),
  createdAtSlot: biggerSlot("created_at_slot").notNull(),
  lpMintAddr: pubkey("lp_mint_addr")
    .notNull()
    .references(() => tokens.mintAcct),
  baseMintAddr: pubkey("base_mint_addr")
    .notNull()
    .references(() => tokens.mintAcct),
  quoteMintAddr: pubkey("quote_mint_addr")
    .notNull()
    .references(() => tokens.mintAcct),
  baseReserves: bigint("base_reserves", { mode: "bigint" }).notNull(),
  quoteReserves: bigint("quote_reserves", { mode: "bigint" }).notNull(),
  latestAmmSeqNumApplied: bigint("latest_amm_seq_num_applied", {
    mode: "bigint",
  }).notNull(),
  insertedAt: timestamp("inserted_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const v0_4_metric_decisions = pgTable("v0_4_metric_decisions", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  daoId: bigint("dao_id", { mode: "bigint" })
    .references(() => daoDetails.daoId)
    .notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  recipient: text("recipient").notNull().default(""),
  outcomeQuestionAddr: pubkey("outcome_question_addr")
    .notNull()
    .references(() => v0_4_questions.questionAddr),
  metricQuestionAddr: pubkey("metric_question_addr")
    .notNull()
    .references(() => v0_4_questions.questionAddr),
  outcomeVaultAddr: pubkey("outcome_vault_addr")
    .notNull()
    .references(() => v0_4_conditional_vaults.conditionalVaultAddr),
  metricVaultAddr: pubkey("metric_vault_addr")
    .notNull()
    .references(() => v0_4_conditional_vaults.conditionalVaultAddr),

  ammAddr: pubkey("amm_addr")
    .notNull()
    .references(() => v0_4_amms.ammAddr),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  marketOpened: timestamp("market_opened", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  grantAwarded: timestamp("grant_awarded", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  committeeEvaluation: timestamp("committee_evaluation", {
    withTimezone: true,
  })
    .notNull()
    .default(sql`now()`),
  scoreTerm: text("score_term").notNull().default("effective"),
  scoreUnit: text("score_unit"),
  scoreMaxValue: numeric("score_max_value", {
    precision: 40,
    scale: 20,
  }),
  scoreMinValue: numeric("score_min_value", {
    precision: 40,
    scale: 20,
  }),
  isBinary: boolean("is_binary").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metricThreshold: numeric("metric_threshold"),
  discussionLink: text("discussion_link"),
  state: text("state").notNull().default("draft"),
  summary: text("summary"),
});

// TODO rename `created_at` to `inserted_at`

export const v0_4_swaps = pgTable("v0_4_swaps", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  signature: transaction("signature").notNull(),
  slot: biggerSlot("slot").notNull(),
  blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
  swapType: pgEnum("swap_type", V04SwapType).notNull(),
  ammAddr: pubkey("amm_addr").notNull(),
  userAddr: pubkey("user_addr").notNull(),
  ammSeqNum: bigint("amm_seq_num", { mode: "bigint" }).notNull(),
  inputAmount: biggerTokenAmount("input_amount").notNull(),
  outputAmount: biggerTokenAmount("output_amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
    ammIdx: index("amm_index").on(table.ammAddr),
    signatureIdx: index("signature_index").on(table.signature),
    seqNumAmmIdx: index("seq_num_amm_index").on(table.ammSeqNum, table.ammAddr),
  })
);

export const v0_4_splits = pgTable(
  "v0_4_splits",
  {
    vaultAddr: pubkey("vault_addr").notNull(),
    vaultSeqNum: bigint("vault_seq_num", { mode: "bigint" }),
    signature: transaction("signature").notNull().references(() => signatures.signature),
    slot: biggerSlot("slot").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    vaultIdx: index("split_vault_index").on(table.vaultAddr),
    signatureIdx: index("split_signature_index").on(table.signature),
    seqNumVaultIdx: index("split_seq_num_vault_index").on(table.vaultSeqNum, table.vaultAddr),
  })
);

export const v0_4_merges = pgTable("v0_4_merges", {
  vaultAddr: pubkey("vault_addr").notNull().references(() => v0_4_conditional_vaults.conditionalVaultAddr),
  vaultSeqNum: bigint("vault_seq_num", { mode: "bigint" }),
  signature: transaction("signature").notNull().references(() => signatures.signature),
  slot: biggerSlot("slot").notNull(),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
    // pk: primaryKey({ columns: [table.vaultAddr, table.vaultSeqNum]}),
    vaultIdx: index("merge_vault_index").on(table.vaultAddr),
    signatureIdx: index("merge_signature_index").on(table.signature),
    seqNumVaultIdx: index("merge_seq_num_vault_index").on(table.vaultSeqNum, table.vaultAddr),
  })
);

export const v0_4_questions = pgTable("v0_4_questions", {
  questionAddr: pubkey("question_addr").primaryKey(),
  isResolved: boolean("is_resolved").notNull(),
  oracleAddr: pubkey("oracle_addr").notNull(),
  numOutcomes: smallint("num_outcomes").notNull(),
  payoutNumerators: jsonb("payout_numerators").notNull(),
  payoutDenominator: bigint("payout_denominator", { mode: "bigint" }).notNull(),
  questionId: jsonb("question_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const v0_4_conditional_vaults = pgTable("v0_4_conditional_vaults", {
  conditionalVaultAddr: pubkey("conditional_vault_addr").primaryKey(),
  questionAddr: pubkey("question_addr")
    .references(() => v0_4_questions.questionAddr)
    .notNull()
    .references(() => v0_4_questions.questionAddr),
  underlyingMintAcct: pubkey("underlying_mint_acct")
    .notNull()
    .references(() => tokens.mintAcct),
  underlyingTokenAcct: pubkey("underlying_token_acct")
    .notNull()
    .references(() => tokenAccts.tokenAcct),
  pdaBump: smallint("pda_bump").notNull(),
  latestVaultSeqNumApplied: bigint("latest_vault_seq_num_applied", {
    mode: "bigint",
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const v0_4_daos = pgTable("v0_4_daos", {
  daoAddr: pubkey("dao_addr").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  treasuryAddr: pubkey("treasury_addr").notNull(),
  treasuryPdaBump: smallint("treasury_pda_bump").notNull(),
  tokenMintAcct: pubkey("token_mint_acct").notNull().references(() => tokens.mintAcct),
  usdcMintAcct: pubkey("usdc_mint_acct").notNull().references(() => tokens.mintAcct),
  proposalCount: bigint("proposal_count", { mode: "bigint" }).notNull(),
  passThresholdBps: smallint("pass_threshold_bps").notNull(),
  slotsPerProposal: bigint("slots_per_proposal", { mode: "bigint" }).notNull(),
  twapInitialObservation: numeric("twap_initial_observation", { precision: 40, scale: 0 }).notNull(),
  twapMaxObservationChangePerUpdate: numeric("twap_max_observation_change_per_update", { precision: 40, scale: 0 }).notNull(),
  twapStartDelaySlots: bigint("twap_start_delay_slots", { mode: "bigint" }).notNull(),
  minQuoteFutarchicLiquidity: bigint("min_quote_futarchic_liquidity", { mode: "bigint" }).notNull(),
  minBaseFutarchicLiquidity: bigint("min_base_futarchic_liquidity", { mode: "bigint" }).notNull(),
  latestDaoSeqNumApplied: bigint("latest_dao_seq_num_applied", { mode: "bigint" }).notNull(),
  updatedAtSlot: slot("updated_at_slot").default(sql`0`).notNull(),
  organizationId: bigint("organization_id", { mode: "bigint" })
    .references(() => organizations.organizationId),
});

export const v0_4_proposals = pgTable("v0_4_proposals", {
  proposalAddr: pubkey("proposal_addr").primaryKey(),
  number: integer("number").notNull(),
  proposer: pubkey("proposer").notNull(),
  descriptionUrl: text("description_url").notNull(),
  slotEnqueued: biggerSlot("slot_enqueued").notNull(),
  state: pgEnum("state", V04ProposalState).notNull(),
  instruction: jsonb("instruction"),
  passAmmAddr: pubkey("pass_amm_addr")
    .notNull(),
  failAmmAddr: pubkey("fail_amm_addr")
    .notNull(),
  baseVaultAddr: pubkey("base_vault_addr")
    .notNull(),
  quoteVaultAddr: pubkey("quote_vault_addr")
    .notNull(),
  daoAddr: pubkey("dao_addr")
    .notNull()
    .references(() => v0_4_daos.daoAddr),
  passLpTokensLocked: numeric("pass_lp_tokens_locked", { precision: 20, scale: 0 }).notNull(),
  failLpTokensLocked: numeric("fail_lp_tokens_locked", { precision: 20, scale: 0 }).notNull(),
  nonce: bigint("nonce", { mode: "bigint" }).notNull(),
  pdaBump: smallint("pda_bump").notNull(),
  questionAddr: pubkey("question_addr")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  durationInSlots: bigint("duration_in_slots", { mode: "bigint" }).default(sql`0`).notNull(),
  updatedAtSlot: slot("updated_at_slot").default(sql`0`).notNull(),
});

export const v0_4_launches = pgTable("v0_4_launches", {
  launchAddr: pubkey("launch_addr").primaryKey(),
  minimumRaiseAmount: bigint("minimum_raise_amount", { mode: "bigint" }).notNull(),
  launchAuthority: pubkey("launch_authority").notNull(),
  launchSigner: pubkey("launch_signer").notNull(),
  launchSignerPdaBump: smallint("launch_signer_pda_bump").notNull(),
  launchUsdcVault: pubkey("launch_usdc_vault").notNull(),
  launchTokenVault: pubkey("launch_token_vault").notNull(),
  tokenMintAcct: pubkey("token_mint_acct")
    .notNull()
    .references(() => tokens.mintAcct),
  pdaBump: smallint("pda_bump").notNull(),
  daoAddr: pubkey("dao_addr")
    .references(() => v0_4_daos.daoAddr),
  daoTreasuryAddr: pubkey("dao_treasury_addr"),
  treasuryUsdcAcct: pubkey("treasury_usdc_acct"),
  committedAmount: bigint("committed_amount", { mode: "bigint" }).notNull(),
  latestLaunchSeqNumApplied: bigint("latest_launch_seq_num_applied", { mode: "bigint" }).notNull(),
  state: pgEnum("state", V04LaunchState).notNull(),
  unixTimestampStarted: bigint("unix_timestamp_started", { mode: "bigint" }).default(sql`0`).notNull(),
  secondsForLaunch: integer("seconds_for_launch").default(sql`0`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAtSlot: slot("updated_at_slot").default(sql`0`).notNull(),
  isHidden: boolean("is_hidden").notNull().default(true),
});

export const v0_4_funding_records = pgTable("v0_4_funding_records", {
  fundingRecordAddr: pubkey("funding_record_addr").primaryKey(),
  launchAddr: pubkey("launch_addr")
    .notNull()
    .references(() => v0_4_launches.launchAddr),
  funderAddr: pubkey("funder_addr").notNull(),
  committedAmount: bigint("committed_amount", { mode: "bigint" }).notNull(),
  latestFundingRecordSeqNumApplied: bigint("latest_funding_record_seq_num_applied", { mode: "bigint" }).notNull(),
  isClaimed: boolean("is_claimed").notNull().default(false),
  isRefunded: boolean("is_refunded").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAtSlot: slot("updated_at_slot").default(sql`0`).notNull(),
});

export const launchDetails = pgTable("launch_details", {
  launchAddr: pubkey("launch_addr").primaryKey().notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  subDescription: text("sub_description"),
  legalTerms: text("legal_terms"),
  creatorName: text("creator_name"),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  websiteUrl: text("website_url"),
  twitterUrl: text("twitter_url"),
  telegramUrl: text("telegram_url"),
  discordUrl: text("discord_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const v0_4_funds = pgTable("v0_4_funds", {
  fundingRecordAddr: pubkey("funding_record_addr").notNull().references(() => v0_4_funding_records.fundingRecordAddr),
  fundingRecordSeqNum: bigint("funding_record_seq_num", { mode: "bigint" }).notNull(),
  launchAddr: pubkey("launch_addr").notNull().references(() => v0_4_launches.launchAddr),
  funderAddr: pubkey("funder_addr").notNull(),
  slot: slot("slot").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  usdcAmount: numeric("usdc_amount", { precision: 20, scale: 0 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  pk: primaryKey({ columns: [table.fundingRecordAddr, table.fundingRecordSeqNum]}),
}));

export const v0_4_refunds = pgTable("v0_4_refunds", {
  fundingRecordAddr: pubkey("funding_record_addr").primaryKey().notNull().references(() => v0_4_funding_records.fundingRecordAddr),
  launchAddr: pubkey("launch_addr").notNull().references(() => v0_4_launches.launchAddr),
  funderAddr: pubkey("funder_addr").notNull(),
  slot: slot("slot").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  usdcAmount: numeric("usdc_amount", { precision: 20, scale: 0 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const v0_4_claims = pgTable("v0_4_claims", {
  fundingRecordAddr: pubkey("funding_record_addr").primaryKey().notNull().references(() => v0_4_funding_records.fundingRecordAddr),
  launchAddr: pubkey("launch_addr").notNull().references(() => v0_4_launches.launchAddr),
  funderAddr: pubkey("funder_addr").notNull(),
  tokensClaimed: numeric("tokens_claimed", { precision: 20, scale: 0 }).notNull(),
  slot: slot("slot").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const v0_5_amms = pgTable("v0_5_amms", {
  ammAddr: pubkey("amm_addr").primaryKey(),
  createdAtSlot: biggerSlot("created_at_slot").notNull(),
  lpMintAddr: pubkey("lp_mint_addr")
    .notNull()
    .references(() => tokens.mintAcct),
  baseMintAddr: pubkey("base_mint_addr")
    .notNull()
    .references(() => tokens.mintAcct),
  quoteMintAddr: pubkey("quote_mint_addr")
    .notNull()
    .references(() => tokens.mintAcct),
  vaultAtaBase: pubkey("vault_ata_base").notNull(),
  vaultAtaQuote: pubkey("vault_ata_quote").notNull(),
  baseReserves: bigint("base_reserves", { mode: "bigint" }).notNull(),
  quoteReserves: bigint("quote_reserves", { mode: "bigint" }).notNull(),
  latestAmmSeqNumApplied: bigint("latest_amm_seq_num_applied", {
    mode: "bigint",
  }).notNull(),
  insertedAt: timestamp("inserted_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const v0_5_metric_decisions = pgTable("v0_5_metric_decisions", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  daoId: bigint("dao_id", { mode: "bigint" })
    .references(() => daoDetails.daoId)
    .notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  recipient: text("recipient").notNull().default(""),
  outcomeQuestionAddr: pubkey("outcome_question_addr")
    .notNull()
    .references(() => v0_5_questions.questionAddr),
  metricQuestionAddr: pubkey("metric_question_addr")
    .notNull()
    .references(() => v0_5_questions.questionAddr),
  outcomeVaultAddr: pubkey("outcome_vault_addr")
    .notNull()
    .references(() => v0_4_conditional_vaults.conditionalVaultAddr),
  metricVaultAddr: pubkey("metric_vault_addr")
    .notNull()
    .references(() => v0_4_conditional_vaults.conditionalVaultAddr),
  ammAddr: pubkey("amm_addr")
    .notNull()
    .references(() => v0_5_amms.ammAddr),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  marketOpened: timestamp("market_opened", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  grantAwarded: timestamp("grant_awarded", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  committeeEvaluation: timestamp("committee_evaluation", {
    withTimezone: true,
  })
    .notNull()
    .default(sql`now()`),
  scoreTerm: text("score_term").notNull().default("effective"),
  scoreUnit: text("score_unit"),
  scoreMaxValue: numeric("score_max_value", {
    precision: 40,
    scale: 20,
  }),
  scoreMinValue: numeric("score_min_value", {
    precision: 40,
    scale: 20,
  }),
  isBinary: boolean("is_binary").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metricThreshold: numeric("metric_threshold"),
  discussionLink: text("discussion_link"),
  state: text("state").notNull().default("draft"),
  summary: text("summary"),
});

export const v0_5_daos = pgTable("v0_5_daos", {
  daoAddr: pubkey("dao_addr").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  nonce: bigint("nonce", { mode: "bigint" }).notNull(),   
  initialSpendingLimitAmount: bigint("spending_limit_amount_per_month", { mode: "bigint" }),
  initialSpendingLimitMembers: jsonb("spending_limit_members"),      
  daoCreator: pubkey("dao_creator").notNull(),                             
  pdaBump: smallint("pda_bump").notNull(),                                 
  squadsMultisig: pubkey("squads_multisig").notNull(),                     
  squadsMultisigVault: pubkey("squads_multisig_vault").notNull(),          
  baseMintAcct: pubkey("base_mint_acct").notNull()                         
    .references(() => tokens.mintAcct),
  quoteMintAcct: pubkey("quote_mint_acct").notNull()
    .references(() => tokens.mintAcct),
  proposalCount: bigint("proposal_count", { mode: "bigint" }).notNull(),
  passThresholdBps: smallint("pass_threshold_bps").notNull(),
  slotsPerProposal: bigint("slots_per_proposal", { mode: "bigint" }).notNull(),
  twapInitialObservation: numeric("twap_initial_observation", { precision: 40, scale: 0 }).notNull(),
  twapMaxObservationChangePerUpdate: numeric("twap_max_observation_change_per_update", { precision: 40, scale: 0 }).notNull(),
  twapStartDelaySlots: bigint("twap_start_delay_slots", { mode: "bigint" }).notNull(),
  minQuoteFutarchicLiquidity: bigint("min_quote_futarchic_liquidity", { mode: "bigint" }).notNull(),
  minBaseFutarchicLiquidity: bigint("min_base_futarchic_liquidity", { mode: "bigint" }).notNull(),
  latestDaoSeqNumApplied: bigint("latest_dao_seq_num_applied", { mode: "bigint" }).notNull(),
  updatedAtSlot: slot("updated_at_slot").default(sql`0`).notNull(),
  organizationId: bigint("organization_id", { mode: "bigint" })
    .references(() => organizations.organizationId),
});

export const v0_5_proposals = pgTable("v0_5_proposals", {
  proposalAddr: pubkey("proposal_addr").primaryKey(),
  number: integer("number").notNull(),
  proposer: pubkey("proposer").notNull(),
  descriptionUrl: text("description_url").notNull(),
  slotEnqueued: biggerSlot("slot_enqueued").notNull(),
  state: pgEnum("state", V05ProposalState).notNull(),
  squadsProposal: pubkey("squads_proposal").notNull(),
  passAmmAddr: pubkey("pass_amm_addr")
    .notNull(),
  failAmmAddr: pubkey("fail_amm_addr")
    .notNull(),
  baseVaultAddr: pubkey("base_vault_addr")
    .notNull(),
  quoteVaultAddr: pubkey("quote_vault_addr")
    .notNull(),
  daoAddr: pubkey("dao_addr")
    .notNull()
    .references(() => v0_5_daos.daoAddr),
  passLpTokensLocked: numeric("pass_lp_tokens_locked", { precision: 20, scale: 0 }).notNull(),
  failLpTokensLocked: numeric("fail_lp_tokens_locked", { precision: 20, scale: 0 }).notNull(),
  pdaBump: smallint("pda_bump").notNull(),
  questionAddr: pubkey("question_addr")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  durationInSlots: bigint("duration_in_slots", { mode: "bigint" }).default(sql`0`).notNull(),
  updatedAtSlot: slot("updated_at_slot").default(sql`0`).notNull(),
});

export const v0_5_swaps = pgTable("v0_5_swaps", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  signature: transaction("signature").notNull(),
  slot: biggerSlot("slot").notNull(),
  blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
  swapType: pgEnum("swap_type", V04SwapType).notNull(),
  ammAddr: pubkey("amm_addr").notNull(),
  userAddr: pubkey("user_addr").notNull(),
  ammSeqNum: bigint("amm_seq_num", { mode: "bigint" }).notNull(),
  inputAmount: biggerTokenAmount("input_amount").notNull(),
  outputAmount: biggerTokenAmount("output_amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
    ammIdx: index("v0_5_swaps_amm_index").on(table.ammAddr),
    signatureIdx: index("v0_5_swaps_signature_index").on(table.signature),
    seqNumAmmIdx: index("v0_5_swaps_seq_num_amm_index").on(table.ammSeqNum, table.ammAddr),
  })
);

export const v0_5_splits = pgTable(
  "v0_5_splits",
  {
    vaultAddr: pubkey("vault_addr").notNull(),
    vaultSeqNum: bigint("vault_seq_num", { mode: "bigint" }),
    signature: transaction("signature").notNull().references(() => signatures.signature),
    slot: biggerSlot("slot").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    vaultIdx: index("v0_5_split_vault_index").on(table.vaultAddr),
    signatureIdx: index("v0_5_split_signature_index").on(table.signature),
    seqNumVaultIdx: index("v0_5_split_seq_num_vault_index").on(table.vaultSeqNum, table.vaultAddr),
  })
);

export const v0_5_merges = pgTable("v0_5_merges", {
  vaultAddr: pubkey("vault_addr").notNull().references(() => v0_4_conditional_vaults.conditionalVaultAddr),
  vaultSeqNum: bigint("vault_seq_num", { mode: "bigint" }),
  signature: transaction("signature").notNull().references(() => signatures.signature),
  slot: biggerSlot("slot").notNull(),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
    // pk: primaryKey({ columns: [table.vaultAddr, table.vaultSeqNum]}),
    vaultIdx: index("v0_5_merge_vault_index").on(table.vaultAddr),
    signatureIdx: index("v0_5_merge_signature_index").on(table.signature),
    seqNumVaultIdx: index("v0_5_merge_seq_num_vault_index").on(table.vaultSeqNum, table.vaultAddr),
  })
);

export const v0_5_questions = pgTable("v0_5_questions", {
  questionAddr: pubkey("question_addr").primaryKey(),
  isResolved: boolean("is_resolved").notNull(),
  oracleAddr: pubkey("oracle_addr").notNull(),
  numOutcomes: smallint("num_outcomes").notNull(),
  payoutNumerators: jsonb("payout_numerators").notNull(),
  payoutDenominator: bigint("payout_denominator", { mode: "bigint" }).notNull(),
  questionId: jsonb("question_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const v0_5_launches = pgTable("v0_5_launches", {
  launchAddr: pubkey("launch_addr").primaryKey(),
  minimumRaiseAmount: bigint("minimum_raise_amount", { mode: "bigint" }).notNull(),
  launchAuthority: pubkey("launch_authority").notNull(),
  launchSigner: pubkey("launch_signer").notNull(),
  launchSignerPdaBump: smallint("launch_signer_pda_bump").notNull(),
  launchQuoteVault: pubkey("launch_quote_vault").notNull(),
  launchBaseVault: pubkey("launch_base_vault").notNull(),
  baseMintAcct: pubkey("base_mint_acct")
    .notNull()
    .references(() => tokens.mintAcct),
  pdaBump: smallint("pda_bump").notNull(),
  daoAddr: pubkey("dao_addr")
    .references(() => v0_5_daos.daoAddr),                    
  squadsMultisigVault: pubkey("squads_multisig_vault"),      
  squadsMultisig: pubkey("squads_multisig"),
  monthlySpendingLimitAmount: bigint("monthly_spending_limit_amount", { mode: "bigint" }),
  monthlySpendingLimitMembers: varchar("monthly_spending_limit_members", { length: 44 }).array(),
  committedAmount: bigint("committed_amount", { mode: "bigint" }),
  latestLaunchSeqNumApplied: bigint("latest_launch_seq_num_applied", { mode: "bigint" }).notNull(),
  state: pgEnum("state", V05LaunchState).notNull(),
  unixTimestampStarted: bigint("unix_timestamp_started", { mode: "bigint" }).default(sql`0`).notNull(),
  secondsForLaunch: integer("seconds_for_launch").default(sql`0`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAtSlot: slot("updated_at_slot").default(sql`0`).notNull(),
  isHidden: boolean("is_hidden").notNull().default(true),
});

export const v0_5_funding_records = pgTable("v0_5_funding_records", {
  fundingRecordAddr: pubkey("funding_record_addr").primaryKey(),
  launchAddr: pubkey("launch_addr")
    .notNull()
    .references(() => v0_5_launches.launchAddr),
  funderAddr: pubkey("funder_addr").notNull(),
  committedAmount: bigint("committed_amount", { mode: "bigint" }).notNull(),
  latestFundingRecordSeqNumApplied: bigint("latest_funding_record_seq_num_applied", { mode: "bigint" }).notNull(),
  isClaimed: boolean("is_claimed").notNull().default(false),
  isRefunded: boolean("is_refunded").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAtSlot: slot("updated_at_slot").default(sql`0`).notNull(),
});

export const v0_5_refunds = pgTable("v0_5_refunds", {
  fundingRecordAddr: pubkey("funding_record_addr").primaryKey().notNull().references(() => v0_5_funding_records.fundingRecordAddr),
  launchAddr: pubkey("launch_addr").notNull().references(() => v0_5_launches.launchAddr),
  funderAddr: pubkey("funder_addr").notNull(),
  slot: slot("slot").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  quoteAmount: numeric("quote_amount", { precision: 20, scale: 0 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const v0_5_claims = pgTable("v0_5_claims", {
  fundingRecordAddr: pubkey("funding_record_addr").primaryKey().notNull().references(() => v0_5_funding_records.fundingRecordAddr),
  launchAddr: pubkey("launch_addr").notNull().references(() => v0_5_launches.launchAddr),
  funderAddr: pubkey("funder_addr").notNull(),
  tokensClaimed: numeric("tokens_claimed", { precision: 20, scale: 0 }).notNull(),
  slot: slot("slot").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const v0_5_funds = pgTable("v0_5_funds", {
  fundingRecordAddr: pubkey("funding_record_addr").notNull().references(() => v0_5_funding_records.fundingRecordAddr),
  fundingRecordSeqNum: bigint("funding_record_seq_num", { mode: "bigint" }).notNull(),
  launchAddr: pubkey("launch_addr").notNull().references(() => v0_5_launches.launchAddr),
  funderAddr: pubkey("funder_addr").notNull(),
  slot: slot("slot").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  quoteAmount: numeric("quote_amount", { precision: 20, scale: 0 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  pk: primaryKey({ columns: [table.fundingRecordAddr, table.fundingRecordSeqNum]}),
}));

// TODO: This is commented out give these are timescale views, but I wanted to include them
export const twapChartData = pgView("twap_chart_data", {
  interv: timestamp("interv", { withTimezone: true }),
  tokenAmount: biggerTokenAmount("token_amount"),
  marketAcct: pubkey("market_acct")
    .notNull()
    .references(() => markets.marketAcct),
}).as(sql`
  SELECT
      TIME_BUCKET('30 SECONDS'::INTERVAL, ${twaps.createdAt}) AS interv,
      last(token_amount, ${twaps.createdAt}) FILTER(WHERE ${twaps.createdAt} IS NOT NULL AND ${twaps.createdAt} <= ${markets.createdAt} + '5 DAYS'::INTERVAL) AS token_amount,
      ${twaps.marketAcct} AS market_acct
  FROM ${twaps}
  JOIN ${markets} ON ${markets.marketAcct} = ${twaps.marketAcct}
  WHERE ${twaps.createdAt} <= ${markets.createdAt} + '5 DAYS'::INTERVAL
  GROUP BY interv, ${twaps.marketAcct}
  `);

export const pricesChartData = pgView("prices_chart_data", {
  interv: timestamp("interv", { withTimezone: true }),
  price: numeric("price", {
    precision: 40,
    scale: 20,
  }).notNull(),
  baseAmount: biggerTokenAmount("base_amount"),
  quoteAmount: biggerTokenAmount("quote_amount"),
  pricesType: pgEnum("prices_type", PricesType).notNull(),
  marketAcct: pubkey("market_acct")
    .notNull()
    .references(() => markets.marketAcct),
}).as(sql`
  SELECT
      TIME_BUCKET('30 SECONDS'::INTERVAL, prices.created_at) AS interv,
      last(price, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL AND CASE WHEN prices_type = 'spot' THEN TRUE ELSE prices.created_at <= markets.created_at + '5 DAYS'::INTERVAL END) AS price,
      last(base_amount, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL AND CASE WHEN prices_type = 'spot' THEN TRUE ELSE prices.created_at <= markets.created_at + '5 DAYS'::INTERVAL END) AS base_amount,
      last(quote_amount, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL AND CASE WHEN prices_type = 'spot' THEN TRUE ELSE prices.created_at <= markets.created_at + '5 DAYS'::INTERVAL END) AS quote_amount,
      prices_type,
      prices.market_acct AS market_acct
  FROM prices
  JOIN markets ON markets.market_acct = prices.market_acct
  WHERE CASE WHEN prices_type = 'spot' THEN TRUE ELSE prices.created_at <= markets.created_at + '5 DAYS'::INTERVAL END
  GROUP BY interv, prices.market_acct, prices_type
  `);

export const proposalTotalTradeVolume = pgView("proposal_total_trade_volume", {
  proposalAcct: pubkey("proposal_acct")
    .notNull()
    .references(() => proposals.proposalAcct),
  passVolume: numeric("pass_volume", {
    precision: 40,
    scale: 20,
  }).notNull(),
  failVolume: numeric("fail_volume", {
    precision: 40,
    scale: 20,
  }).notNull(),
  passAcct: pubkey("pass_market_acct")
    .notNull()
    .references(() => markets.marketAcct),
  failAcct: pubkey("fail_market_acct")
    .notNull()
    .references(() => markets.marketAcct),
}).as(sql`
  WITH pass_market AS (
    SELECT
    	  proposal_acct,
    	  orders.market_acct AS pass_market_acct,
          TIME_BUCKET('1 DAYS'::INTERVAL, orders.order_time) AS interv,
          SUM(filled_base_amount * quote_price) FILTER(WHERE orders.order_time IS NOT NULL) AS pass_volume
    FROM proposals
    JOIN orders
    ON proposals.pass_market_acct = orders.market_acct
    GROUP BY proposal_acct, interv, orders.market_acct
  ),
  fail_market AS (
    SELECT
    	  proposal_acct,
    	  orders.market_acct AS fail_market_acct,
          TIME_BUCKET('1 DAYS'::INTERVAL, orders.order_time) AS interv,
          SUM(filled_base_amount * quote_price) FILTER(WHERE orders.order_time IS NOT NULL) AS fail_volume
    FROM proposals
    JOIN orders
    ON proposals.fail_market_acct = orders.market_acct
    GROUP BY proposal_acct, interv, orders.market_acct
  )
  SELECT
    pass_market.proposal_acct AS proposal_acct,
    pass_market_acct,
    fail_market_acct,
    SUM(pass_volume) AS pass_volume,
    SUM(fail_volume) AS fail_volume
  FROM pass_market
  JOIN fail_market ON fail_market.proposal_acct = pass_market.proposal_acct
  GROUP BY pass_market.proposal_acct, pass_market_acct, fail_market_acct
  `);

export const userDeposits = pgTable("user_deposits", {
  txSig: transaction("tx_sig")
    .references(() => transactions.txSig)
    .notNull(),

  userAcct: pubkey("user_acct")
    .notNull()
    .references(() => users.userAcct),

  tokenAmount: biggerTokenAmount("token_amount").notNull(),

  mintAcct: pubkey("mint_acct")
    .references(() => tokens.mintAcct)
    .notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const organizations = pgTable("organizations", {
  organizationId: bigserial("organization_id", { mode: "bigint" }).primaryKey(),
  name: text("name").notNull().unique(),
  // Useful for fetching from a URL
  slug: varchar("slug").unique(),
  url: varchar("url").unique(),
  description: text("description"),
  imageUrl: varchar("image_url"),
  // Added this in anticipation for web3 auth.
  creator_acct: pubkey("creator_acct"),
  // A way for other people to have permissions to make changes.
  admin_accts: jsonb("admin_accts"),
  isHide: boolean("is_hide"),
  // Key off of this type and then we can do flexible design.
  socials: jsonb("socials"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  telegramChannel: text("telegram_channel"),
},
(table) => ({
  uniqueId: unique("id_name_url").on(table.organizationId, table.url, table.name),
})
);
  

export type IndexerRecord = typeof indexers._.inferInsert;
export type IndexerAccountDependencyReadRecord =
  typeof indexerAccountDependencies._.inferSelect;
export type TwapRecord = typeof twaps._.inferInsert;
export type PricesRecord = typeof prices._.inferInsert;
export type MarketRecord = typeof markets._.inferInsert;
export type TakesRecord = typeof takes._.inferInsert;
export type OrdersRecord = typeof orders._.inferInsert;
export type TransactionRecord = typeof transactions._.inferInsert;
export type TransactionWatcherTransactionRecord =
  typeof transactionWatcherTransactions._.inferInsert;
export type TokenRecord = typeof tokens._.inferInsert;
export type DaoRecord = typeof daos._.inferInsert;
export type ProposalRecord = typeof proposals._.inferInsert;
export type ConditionalVaultRecord = typeof conditionalVaults._.inferInsert;
export type TokenAcctRecord = typeof tokenAccts._.inferInsert;
export type UserPerformanceRecord = typeof userPerformance._.inferInsert;