CREATE TABLE IF NOT EXISTS "candles" (
	"market_acct" varchar(44) NOT NULL,
	"candle_duration" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"volume" bigint NOT NULL,
	"open" bigint,
	"high" bigint,
	"low" bigint,
	"close" bigint,
	"candle_average" bigint NOT NULL,
	"cond_market_twap" bigint,
	CONSTRAINT "candles_market_acct_candle_duration_timestamp_pk" PRIMARY KEY("market_acct","candle_duration","timestamp")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comments" (
	"comment_id" bigint PRIMARY KEY NOT NULL,
	"commentor_acct" varchar(44) NOT NULL,
	"proposal_acct" varchar(44) NOT NULL,
	"content" text NOT NULL,
	"responding_comment_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_comment_id_unique" UNIQUE("comment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conditional_vaults" (
	"cond_vault_acct" varchar(44) PRIMARY KEY NOT NULL,
	"status" varchar,
	"settlement_authority" varchar(44) NOT NULL,
	"underlying_mint_acct" varchar(44) NOT NULL,
	"underlying_token_acct" varchar(44) NOT NULL,
	"nonce" varchar,
	"cond_finalize_token_mint_acct" varchar(44) NOT NULL,
	"cond_revert_token_mint_acct" varchar(44) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dao_details" (
	"dao_id" bigint PRIMARY KEY NOT NULL,
	"name" varchar,
	"slug" varchar,
	"url" varchar,
	"x_account" varchar,
	"github" varchar,
	"description" text,
	"image_url" varchar,
	"creator_acct" varchar(44),
	"admin_accts" jsonb,
	"token_image_url" varchar,
	"pass_token_image_url" varchar,
	"fail_token_image_url" varchar,
	"lp_token_image_url" varchar,
	"is_hide" boolean,
	"socials" jsonb,
	CONSTRAINT "dao_details_name_unique" UNIQUE("name"),
	CONSTRAINT "dao_details_slug_unique" UNIQUE("slug"),
	CONSTRAINT "dao_details_url_unique" UNIQUE("url"),
	CONSTRAINT "dao_details_x_account_unique" UNIQUE("x_account"),
	CONSTRAINT "dao_details_github_unique" UNIQUE("github"),
	CONSTRAINT "id_name_url" UNIQUE("dao_id","url","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daos" (
	"dao_acct" varchar(44) PRIMARY KEY NOT NULL,
	"program_acct" varchar(44) NOT NULL,
	"dao_id" bigint,
	"base_acct" varchar(44) NOT NULL,
	"quote_acct" varchar(44),
	"treasury_acct" varchar(44),
	"slots_per_proposal" bigint,
	"pass_threshold_bps" bigint,
	"twap_initial_observation" bigint,
	"twap_max_observation_change_per_update" bigint,
	"min_quote_futarchic_liquidity" bigint,
	"min_base_futarchic_liquidity" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daos_treasury_acct_unique" UNIQUE("treasury_acct"),
	CONSTRAINT "dao_acct_program" UNIQUE("dao_acct","program_acct")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "indexer_account_dependencies" (
	"name" varchar(100) NOT NULL,
	"acct" varchar(44) NOT NULL,
	"latest_tx_sig_processed" varchar(88),
	"status" varchar DEFAULT 'active',
	"updated_at" timestamp with time zone,
	CONSTRAINT "indexer_account_dependencies_name_acct_pk" PRIMARY KEY("name","acct")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "indexers" (
	"name" varchar(100) PRIMARY KEY NOT NULL,
	"implementation" varchar NOT NULL,
	"latest_slot_processed" bigint NOT NULL,
	"indexer_type" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "makes" (
	"order_tx_sig" varchar(88) PRIMARY KEY NOT NULL,
	"market_acct" varchar(44) NOT NULL,
	"is_active" boolean NOT NULL,
	"unfilled_base_amount" bigint NOT NULL,
	"filled_base_amount" bigint NOT NULL,
	"quote_price" numeric(40, 20) NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "markets" (
	"market_acct" varchar(44) PRIMARY KEY NOT NULL,
	"market_type" varchar NOT NULL,
	"create_tx_sig" varchar(88) NOT NULL,
	"proposal_acct" varchar(44),
	"base_mint_acct" varchar(44) NOT NULL,
	"quote_mint_acct" varchar(44) NOT NULL,
	"base_lot_size" bigint NOT NULL,
	"quote_lot_size" bigint NOT NULL,
	"quote_tick_size" bigint NOT NULL,
	"bids_token_acct" varchar(44),
	"asks_token_acct" varchar(44),
	"base_maker_fee" smallint NOT NULL,
	"base_taker_fee" smallint NOT NULL,
	"quote_maker_fee" smallint NOT NULL,
	"quote_taker_fee" smallint NOT NULL,
	"active_slot" bigint,
	"inactive_slot" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"order_tx_sig" varchar(88) PRIMARY KEY NOT NULL,
	"market_acct" varchar(44) NOT NULL,
	"actor_acct" varchar(44) NOT NULL,
	"side" varchar NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_active" boolean NOT NULL,
	"unfilled_base_amount" bigint NOT NULL,
	"filled_base_amount" bigint NOT NULL,
	"quote_price" numeric(40, 20) NOT NULL,
	"order_block" bigint NOT NULL,
	"order_time" timestamp with time zone NOT NULL,
	"cancel_tx_sig" varchar(88),
	"cancel_block" bigint,
	"cancel_time" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prices" (
	"market_acct" varchar(44) NOT NULL,
	"updated_slot" bigint NOT NULL,
	"base_amount" bigint,
	"quote_amount" bigint,
	"price" numeric(40, 20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"prices_type" varchar NOT NULL,
	CONSTRAINT "prices_created_at_market_acct_pk" PRIMARY KEY("created_at","market_acct")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "program_system" (
	"system_version" double precision PRIMARY KEY NOT NULL,
	"autocrat_acct" varchar(44) NOT NULL,
	"conditional_vault_acct" varchar(44) NOT NULL,
	"pricing_model_acct" varchar(44) NOT NULL,
	"migrator_acct" varchar(44)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "programs" (
	"program_acct" varchar(44) PRIMARY KEY NOT NULL,
	"version" double precision NOT NULL,
	"program_name" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deployed_at" timestamp,
	CONSTRAINT "program_version" UNIQUE("program_acct","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposal_details" (
	"proposal_id" bigint PRIMARY KEY NOT NULL,
	"proposal_acct" varchar(44),
	"title" varchar,
	"slug" varchar,
	"description" varchar,
	"categories" jsonb,
	"content" text,
	"proposer_acct" varchar(44),
	"base_cond_vault_acct" varchar(44),
	"quote_cond_vault_acct" varchar(44),
	"pass_market_acct" varchar(44),
	"fail_market_acct" varchar(44),
	CONSTRAINT "proposal_details_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposals" (
	"proposal_acct" varchar(44) PRIMARY KEY NOT NULL,
	"dao_acct" varchar(44) NOT NULL,
	"proposal_num" bigint NOT NULL,
	"autocrat_version" double precision NOT NULL,
	"proposer_acct" varchar(44) NOT NULL,
	"initial_slot" bigint NOT NULL,
	"end_slot" bigint,
	"status" varchar NOT NULL,
	"description_url" varchar,
	"pricing_model_pass_acct" varchar(44),
	"pricing_model_fail_acct" varchar(44),
	"pass_market_acct" varchar(44),
	"fail_market_acct" varchar(44),
	"base_vault" varchar(44),
	"quote_vault" varchar(44),
	"duration_in_slots" bigint,
	"pass_threshold_bps" bigint,
	"twap_initial_observation" bigint,
	"twap_max_observation_change_per_update" bigint,
	"min_quote_futarchic_liquidity" bigint,
	"min_base_futarchic_liquidity" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reactions" (
	"reaction_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reactor_acct" varchar(44) NOT NULL,
	"comment_id" bigint,
	"proposal_acct" varchar(44),
	"reaction" varchar NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_acct" varchar(44),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "takes" (
	"order_tx_sig" varchar(88) PRIMARY KEY NOT NULL,
	"base_amount" bigint NOT NULL,
	"quote_price" numeric(40, 20) NOT NULL,
	"taker_base_fee" bigint NOT NULL,
	"taker_quote_fee" bigint DEFAULT 0 NOT NULL,
	"maker_order_tx_sig" varchar(88),
	"maker_base_fee" bigint,
	"maker_quote_fee" bigint,
	"market_acct" varchar(44) NOT NULL,
	"order_block" bigint NOT NULL,
	"order_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token_acct_balances" (
	"token_acct" varchar(44) NOT NULL,
	"mint_acct" varchar(44) NOT NULL,
	"owner_acct" varchar(44) NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delta" bigint DEFAULT 0 NOT NULL,
	"slot" bigint,
	"tx_sig" varchar(88),
	CONSTRAINT "token_acct_balances_token_acct_mint_acct_amount_created_at_pk" PRIMARY KEY("token_acct","mint_acct","amount","created_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token_accts" (
	"amount" bigint NOT NULL,
	"mint_acct" varchar(44) NOT NULL,
	"owner_acct" varchar(44) NOT NULL,
	"status" varchar DEFAULT 'enabled',
	"token_acct" varchar(44) PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tokens" (
	"mint_acct" varchar(44) PRIMARY KEY NOT NULL,
	"name" varchar(30) NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"supply" bigint NOT NULL,
	"decimals" smallint NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"image_url" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_watcher_transactions" (
	"watcher_acct" varchar(44) NOT NULL,
	"tx_sig" varchar(88) NOT NULL,
	"slot" bigint NOT NULL,
	CONSTRAINT "transaction_watcher_transactions_watcher_acct_tx_sig_pk" PRIMARY KEY("watcher_acct","tx_sig")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_watchers" (
	"acct" varchar(44) PRIMARY KEY NOT NULL,
	"latest_tx_sig" varchar(88),
	"first_tx_sig" varchar(88),
	"checked_up_to_slot" bigint NOT NULL,
	"serializer_logic_version" smallint NOT NULL,
	"description" text NOT NULL,
	"status" varchar DEFAULT 'disabled' NOT NULL,
	"failure_log" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"tx_sig" varchar(88) PRIMARY KEY NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"failed" boolean NOT NULL,
	"payload" text NOT NULL,
	"serializer_logic_version" smallint NOT NULL,
	"main_ix_type" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "twaps" (
	"market_acct" varchar(44) NOT NULL,
	"proposal_acct" varchar(44) NOT NULL,
	"updated_slot" bigint NOT NULL,
	"observation_agg" numeric(40, 0) NOT NULL,
	"last_observation" numeric(40, 0),
	"last_price" numeric(40, 0),
	"token_amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twaps_updated_slot_market_acct_pk" PRIMARY KEY("updated_slot","market_acct")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_deposits" (
	"tx_sig" varchar(88) NOT NULL,
	"user_acct" varchar(44) NOT NULL,
	"token_amount" bigint NOT NULL,
	"mint_acct" varchar(44) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_performance" (
	"proposal_acct" varchar(44) NOT NULL,
	"user_acct" varchar(44) NOT NULL,
	"dao_acct" varchar(44) NOT NULL,
	"tokens_bought" numeric(40, 20) NOT NULL,
	"tokens_sold" numeric(40, 20) NOT NULL,
	"volume_bought" numeric(40, 20) NOT NULL,
	"volume_sold" numeric(40, 20) NOT NULL,
	"total_volume" numeric(40, 20) DEFAULT '0.0' NOT NULL,
	"tokens_bought_resolving_market" numeric(40, 20) DEFAULT '0.0' NOT NULL,
	"tokens_sold_resolving_market" numeric(40, 20) DEFAULT '0.0' NOT NULL,
	"volume_bought_resolving_market" numeric(40, 20) DEFAULT '0.0' NOT NULL,
	"volume_sold_resolving_market" numeric(40, 20) DEFAULT '0.0' NOT NULL,
	"buy_orders_count" bigint DEFAULT 0 NOT NULL,
	"sell_orders_count" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_performance_proposal_acct_user_acct_pk" PRIMARY KEY("proposal_acct","user_acct")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"user_acct" varchar(44) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_index" ON "makes" ("market_acct");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "actor_index" ON "orders" ("market_acct","actor_acct");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_index" ON "takes" ("market_acct","order_block");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_index" ON "takes" ("market_acct","order_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maker_index" ON "takes" ("maker_order_tx_sig");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_amount_created" ON "token_acct_balances" ("token_acct","created_at","amount");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watcher_slot_index" ON "transaction_watcher_transactions" ("watcher_acct","slot");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "txn_slot_index" ON "transactions" ("slot");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candles" ADD CONSTRAINT "candles_market_acct_markets_market_acct_fk" FOREIGN KEY ("market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_responding_comment_id_comments_comment_id_fk" FOREIGN KEY ("responding_comment_id") REFERENCES "comments"("comment_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conditional_vaults" ADD CONSTRAINT "conditional_vaults_underlying_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("underlying_mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daos" ADD CONSTRAINT "daos_program_acct_programs_program_acct_fk" FOREIGN KEY ("program_acct") REFERENCES "programs"("program_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daos" ADD CONSTRAINT "daos_dao_id_dao_details_dao_id_fk" FOREIGN KEY ("dao_id") REFERENCES "dao_details"("dao_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daos" ADD CONSTRAINT "daos_base_acct_tokens_mint_acct_fk" FOREIGN KEY ("base_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daos" ADD CONSTRAINT "daos_quote_acct_tokens_mint_acct_fk" FOREIGN KEY ("quote_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "indexer_account_dependencies" ADD CONSTRAINT "indexer_account_dependencies_name_indexers_name_fk" FOREIGN KEY ("name") REFERENCES "indexers"("name") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "indexer_account_dependencies" ADD CONSTRAINT "indexer_account_dependencies_latest_tx_sig_processed_transactions_tx_sig_fk" FOREIGN KEY ("latest_tx_sig_processed") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "makes" ADD CONSTRAINT "makes_order_tx_sig_orders_order_tx_sig_fk" FOREIGN KEY ("order_tx_sig") REFERENCES "orders"("order_tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "makes" ADD CONSTRAINT "makes_market_acct_markets_market_acct_fk" FOREIGN KEY ("market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "markets" ADD CONSTRAINT "markets_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "markets" ADD CONSTRAINT "markets_base_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("base_mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "markets" ADD CONSTRAINT "markets_quote_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("quote_mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "markets" ADD CONSTRAINT "markets_bids_token_acct_token_accts_token_acct_fk" FOREIGN KEY ("bids_token_acct") REFERENCES "token_accts"("token_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "markets" ADD CONSTRAINT "markets_asks_token_acct_token_accts_token_acct_fk" FOREIGN KEY ("asks_token_acct") REFERENCES "token_accts"("token_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_order_tx_sig_transactions_tx_sig_fk" FOREIGN KEY ("order_tx_sig") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_market_acct_markets_market_acct_fk" FOREIGN KEY ("market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_actor_acct_users_user_acct_fk" FOREIGN KEY ("actor_acct") REFERENCES "users"("user_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices" ADD CONSTRAINT "prices_market_acct_markets_market_acct_fk" FOREIGN KEY ("market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_system" ADD CONSTRAINT "program_system_autocrat_acct_programs_program_acct_fk" FOREIGN KEY ("autocrat_acct") REFERENCES "programs"("program_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_system" ADD CONSTRAINT "program_system_conditional_vault_acct_programs_program_acct_fk" FOREIGN KEY ("conditional_vault_acct") REFERENCES "programs"("program_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_system" ADD CONSTRAINT "program_system_pricing_model_acct_programs_program_acct_fk" FOREIGN KEY ("pricing_model_acct") REFERENCES "programs"("program_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_system" ADD CONSTRAINT "program_system_migrator_acct_programs_program_acct_fk" FOREIGN KEY ("migrator_acct") REFERENCES "programs"("program_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_details" ADD CONSTRAINT "proposal_details_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposals" ADD CONSTRAINT "proposals_dao_acct_daos_dao_acct_fk" FOREIGN KEY ("dao_acct") REFERENCES "daos"("dao_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposals" ADD CONSTRAINT "proposals_base_vault_conditional_vaults_cond_vault_acct_fk" FOREIGN KEY ("base_vault") REFERENCES "conditional_vaults"("cond_vault_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposals" ADD CONSTRAINT "proposals_quote_vault_conditional_vaults_cond_vault_acct_fk" FOREIGN KEY ("quote_vault") REFERENCES "conditional_vaults"("cond_vault_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_comment_id_comments_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "comments"("comment_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_acct_users_user_acct_fk" FOREIGN KEY ("user_acct") REFERENCES "users"("user_acct") ON DELETE restrict ON UPDATE restrict;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "takes" ADD CONSTRAINT "takes_order_tx_sig_orders_order_tx_sig_fk" FOREIGN KEY ("order_tx_sig") REFERENCES "orders"("order_tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "takes" ADD CONSTRAINT "takes_maker_order_tx_sig_makes_order_tx_sig_fk" FOREIGN KEY ("maker_order_tx_sig") REFERENCES "makes"("order_tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "takes" ADD CONSTRAINT "takes_market_acct_markets_market_acct_fk" FOREIGN KEY ("market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_acct_balances" ADD CONSTRAINT "token_acct_balances_token_acct_token_accts_token_acct_fk" FOREIGN KEY ("token_acct") REFERENCES "token_accts"("token_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_acct_balances" ADD CONSTRAINT "token_acct_balances_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_acct_balances" ADD CONSTRAINT "token_acct_balances_tx_sig_transactions_tx_sig_fk" FOREIGN KEY ("tx_sig") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_accts" ADD CONSTRAINT "token_accts_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction_watcher_transactions" ADD CONSTRAINT "transaction_watcher_transactions_watcher_acct_transaction_watchers_acct_fk" FOREIGN KEY ("watcher_acct") REFERENCES "transaction_watchers"("acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction_watcher_transactions" ADD CONSTRAINT "transaction_watcher_transactions_tx_sig_transactions_tx_sig_fk" FOREIGN KEY ("tx_sig") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction_watchers" ADD CONSTRAINT "transaction_watchers_latest_tx_sig_transactions_tx_sig_fk" FOREIGN KEY ("latest_tx_sig") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction_watchers" ADD CONSTRAINT "transaction_watchers_first_tx_sig_transactions_tx_sig_fk" FOREIGN KEY ("first_tx_sig") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "twaps" ADD CONSTRAINT "twaps_market_acct_markets_market_acct_fk" FOREIGN KEY ("market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "twaps" ADD CONSTRAINT "twaps_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_deposits" ADD CONSTRAINT "user_deposits_tx_sig_transactions_tx_sig_fk" FOREIGN KEY ("tx_sig") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_deposits" ADD CONSTRAINT "user_deposits_user_acct_users_user_acct_fk" FOREIGN KEY ("user_acct") REFERENCES "users"("user_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_deposits" ADD CONSTRAINT "user_deposits_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_performance" ADD CONSTRAINT "user_performance_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_performance" ADD CONSTRAINT "user_performance_user_acct_users_user_acct_fk" FOREIGN KEY ("user_acct") REFERENCES "users"("user_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_performance" ADD CONSTRAINT "user_performance_dao_acct_daos_dao_acct_fk" FOREIGN KEY ("dao_acct") REFERENCES "daos"("dao_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
