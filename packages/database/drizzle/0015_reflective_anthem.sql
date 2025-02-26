CREATE TABLE IF NOT EXISTS "v0_4_daos" (
	"dao_addr" varchar(44) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"treasury_addr" varchar(44) NOT NULL,
	"treasury_pda_bump" smallint NOT NULL,
	"token_mint_acct" varchar(44) NOT NULL,
	"usdc_mint_acct" varchar(44) NOT NULL,
	"proposal_count" bigint NOT NULL,
	"pass_threshold_bps" smallint NOT NULL,
	"slots_per_proposal" bigint NOT NULL,
	"twap_initial_observation" numeric(40, 0) NOT NULL,
	"twap_max_observation_change_per_update" numeric(40, 0) NOT NULL,
	"min_quote_futarchic_liquidity" bigint NOT NULL,
	"min_base_futarchic_liquidity" bigint NOT NULL,
	"latest_dao_seq_num_applied" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_4_funds" (
	"launch_addr" varchar(44) NOT NULL,
	"funder_addr" varchar(44) NOT NULL,
	"slot" bigint NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"usdc_amount" numeric(20, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_4_launches" (
	"launch_addr" varchar(44) PRIMARY KEY NOT NULL,
	"minimum_raise_amount" bigint NOT NULL,
	"creator" varchar(44) NOT NULL,
	"launch_signer" varchar(44) NOT NULL,
	"launch_signer_pda_bump" smallint NOT NULL,
	"launch_usdc_vault" varchar(44) NOT NULL,
	"launch_token_vault" varchar(44) NOT NULL,
	"token_mint_acct" varchar(44) NOT NULL,
	"pda_bump" smallint NOT NULL,
	"dao_addr" varchar(44) NOT NULL,
	"dao_treasury_addr" varchar(44) NOT NULL,
	"treasury_usdc_acct" varchar(44) NOT NULL,
	"committed_amount" bigint NOT NULL,
	"latest_launch_seq_num_applied" bigint NOT NULL,
	"state" varchar NOT NULL,
	"slot_started" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_4_proposals" (
	"proposal_addr" varchar(44) PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"proposer" varchar(44) NOT NULL,
	"description_url" text NOT NULL,
	"slot_enqueued" numeric NOT NULL,
	"state" varchar NOT NULL,
	"instruction" jsonb,
	"pass_amm_addr" varchar(44) NOT NULL,
	"fail_amm_addr" varchar(44) NOT NULL,
	"base_vault_addr" varchar(44) NOT NULL,
	"quote_vault_addr" varchar(44) NOT NULL,
	"dao_addr" varchar(44) NOT NULL,
	"pass_lp_tokens_locked" numeric(20, 0) NOT NULL,
	"fail_lp_tokens_locked" numeric(20, 0) NOT NULL,
	"nonce" bigint NOT NULL,
	"pda_bump" smallint NOT NULL,
	"question_addr" varchar(44) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_4_refunds" (
	"launch_addr" varchar(44) NOT NULL,
	"funder_addr" varchar(44) NOT NULL,
	"slot" bigint NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"usdc_amount" numeric(20, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_daos" ADD CONSTRAINT "v0_4_daos_token_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("token_mint_acct") REFERENCES "public"."tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_daos" ADD CONSTRAINT "v0_4_daos_usdc_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("usdc_mint_acct") REFERENCES "public"."tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_funds" ADD CONSTRAINT "v0_4_funds_launch_addr_v0_4_launches_launch_addr_fk" FOREIGN KEY ("launch_addr") REFERENCES "public"."v0_4_launches"("launch_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_launches" ADD CONSTRAINT "v0_4_launches_token_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("token_mint_acct") REFERENCES "public"."tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_launches" ADD CONSTRAINT "v0_4_launches_dao_addr_v0_4_daos_dao_addr_fk" FOREIGN KEY ("dao_addr") REFERENCES "public"."v0_4_daos"("dao_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_proposals" ADD CONSTRAINT "v0_4_proposals_pass_amm_addr_v0_4_amms_amm_addr_fk" FOREIGN KEY ("pass_amm_addr") REFERENCES "public"."v0_4_amms"("amm_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_proposals" ADD CONSTRAINT "v0_4_proposals_fail_amm_addr_v0_4_amms_amm_addr_fk" FOREIGN KEY ("fail_amm_addr") REFERENCES "public"."v0_4_amms"("amm_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_proposals" ADD CONSTRAINT "v0_4_proposals_base_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("base_vault_addr") REFERENCES "public"."v0_4_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_proposals" ADD CONSTRAINT "v0_4_proposals_quote_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("quote_vault_addr") REFERENCES "public"."v0_4_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_proposals" ADD CONSTRAINT "v0_4_proposals_dao_addr_v0_4_daos_dao_addr_fk" FOREIGN KEY ("dao_addr") REFERENCES "public"."v0_4_daos"("dao_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_proposals" ADD CONSTRAINT "v0_4_proposals_question_addr_v0_4_questions_question_addr_fk" FOREIGN KEY ("question_addr") REFERENCES "public"."v0_4_questions"("question_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_refunds" ADD CONSTRAINT "v0_4_refunds_launch_addr_v0_4_launches_launch_addr_fk" FOREIGN KEY ("launch_addr") REFERENCES "public"."v0_4_launches"("launch_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
