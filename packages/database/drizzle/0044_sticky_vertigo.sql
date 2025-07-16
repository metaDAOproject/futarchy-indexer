CREATE TABLE IF NOT EXISTS "v0_5_amms" (
	"amm_addr" varchar(44) PRIMARY KEY NOT NULL,
	"created_at_slot" numeric NOT NULL,
	"lp_mint_addr" varchar(44) NOT NULL,
	"base_mint_addr" varchar(44) NOT NULL,
	"quote_mint_addr" varchar(44) NOT NULL,
	"vault_ata_base" varchar(44) NOT NULL,
	"vault_ata_quote" varchar(44) NOT NULL,
	"base_reserves" bigint NOT NULL,
	"quote_reserves" bigint NOT NULL,
	"latest_amm_seq_num_applied" bigint NOT NULL,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_claims" (
	"funding_record_addr" varchar(44) PRIMARY KEY NOT NULL,
	"launch_addr" varchar(44) NOT NULL,
	"funder_addr" varchar(44) NOT NULL,
	"tokens_claimed" numeric(20, 0) NOT NULL,
	"slot" bigint NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_conditional_vaults" (
	"conditional_vault_addr" varchar(44) PRIMARY KEY NOT NULL,
	"question_addr" varchar(44) NOT NULL,
	"underlying_mint_acct" varchar(44) NOT NULL,
	"underlying_token_acct" varchar(44) NOT NULL,
	"pda_bump" smallint NOT NULL,
	"latest_vault_seq_num_applied" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_daos" (
	"dao_addr" varchar(44) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nonce" bigint NOT NULL,
	"initial_spending_limit" bigint,
	"dao_creator" varchar(44) NOT NULL,
	"pda_bump" smallint NOT NULL,
	"squads_multisig" varchar(44) NOT NULL,
	"squads_multisig_vault" varchar(44) NOT NULL,
	"base_mint_acct" varchar(44) NOT NULL,
	"quote_mint_acct" varchar(44) NOT NULL,
	"proposal_count" bigint NOT NULL,
	"pass_threshold_bps" smallint NOT NULL,
	"slots_per_proposal" bigint NOT NULL,
	"twap_initial_observation" numeric(40, 0) NOT NULL,
	"twap_max_observation_change_per_update" numeric(40, 0) NOT NULL,
	"twap_start_delay_slots" bigint NOT NULL,
	"min_quote_futarchic_liquidity" bigint NOT NULL,
	"min_base_futarchic_liquidity" bigint NOT NULL,
	"latest_dao_seq_num_applied" bigint NOT NULL,
	"updated_at_slot" bigint DEFAULT 0 NOT NULL,
	"organization_id" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_funding_records" (
	"funding_record_addr" varchar(44) PRIMARY KEY NOT NULL,
	"launch_addr" varchar(44) NOT NULL,
	"funder_addr" varchar(44) NOT NULL,
	"committed_amount" bigint NOT NULL,
	"latest_funding_record_seq_num_applied" bigint NOT NULL,
	"is_claimed" boolean DEFAULT false NOT NULL,
	"is_refunded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_slot" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_funds" (
	"funding_record_addr" varchar(44) NOT NULL,
	"funding_record_seq_num" bigint NOT NULL,
	"launch_addr" varchar(44) NOT NULL,
	"funder_addr" varchar(44) NOT NULL,
	"slot" bigint NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"quote_amount" numeric(20, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v0_5_funds_funding_record_addr_funding_record_seq_num_pk" PRIMARY KEY("funding_record_addr","funding_record_seq_num")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_launches" (
	"launch_addr" varchar(44) PRIMARY KEY NOT NULL,
	"minimum_raise_amount" bigint NOT NULL,
	"launch_authority" varchar(44) NOT NULL,
	"launch_signer" varchar(44) NOT NULL,
	"launch_signer_pda_bump" smallint NOT NULL,
	"launch_quote_vault" varchar(44) NOT NULL,
	"launch_base_vault" varchar(44) NOT NULL,
	"base_mint_acct" varchar(44) NOT NULL,
	"pda_bump" smallint NOT NULL,
	"dao_addr" varchar(44),
	"squads_multisig_vault" varchar(44) NOT NULL,
	"squads_multisig" varchar(44) NOT NULL,
	"monthly_spending_limit_amount" bigint NOT NULL,
	"monthly_spending_limit_members" varchar(44)[],
	"committed_amount" bigint NOT NULL,
	"latest_launch_seq_num_applied" bigint NOT NULL,
	"state" varchar NOT NULL,
	"unix_timestamp_started" bigint DEFAULT 0 NOT NULL,
	"seconds_for_launch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_slot" bigint DEFAULT 0 NOT NULL,
	"is_hidden" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_merges" (
	"vault_addr" varchar(44) NOT NULL,
	"vault_seq_num" bigint,
	"signature" varchar(88) NOT NULL,
	"slot" numeric NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_metric_decisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dao_id" bigint NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"recipient" text DEFAULT '' NOT NULL,
	"outcome_question_addr" varchar(44) NOT NULL,
	"metric_question_addr" varchar(44) NOT NULL,
	"outcome_vault_addr" varchar(44) NOT NULL,
	"metric_vault_addr" varchar(44) NOT NULL,
	"amm_addr" varchar(44) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"market_opened" timestamp with time zone DEFAULT now() NOT NULL,
	"grant_awarded" timestamp with time zone DEFAULT now() NOT NULL,
	"committee_evaluation" timestamp with time zone DEFAULT now() NOT NULL,
	"score_term" text DEFAULT 'effective' NOT NULL,
	"score_unit" text,
	"score_max_value" numeric(40, 20),
	"score_min_value" numeric(40, 20),
	"is_binary" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"metric_threshold" numeric,
	"discussion_link" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"summary" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_proposals" (
	"proposal_addr" varchar(44) PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"proposer" varchar(44) NOT NULL,
	"description_url" text NOT NULL,
	"slot_enqueued" numeric NOT NULL,
	"state" varchar NOT NULL,
	"squads_proposal" varchar(44) NOT NULL,
	"pass_amm_addr" varchar(44) NOT NULL,
	"fail_amm_addr" varchar(44) NOT NULL,
	"base_vault_addr" varchar(44) NOT NULL,
	"quote_vault_addr" varchar(44) NOT NULL,
	"dao_addr" varchar(44) NOT NULL,
	"pass_lp_tokens_locked" numeric(20, 0) NOT NULL,
	"fail_lp_tokens_locked" numeric(20, 0) NOT NULL,
	"pda_bump" smallint NOT NULL,
	"question_addr" varchar(44) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	"duration_in_slots" bigint DEFAULT 0 NOT NULL,
	"updated_at_slot" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_questions" (
	"question_addr" varchar(44) PRIMARY KEY NOT NULL,
	"is_resolved" boolean NOT NULL,
	"oracle_addr" varchar(44) NOT NULL,
	"num_outcomes" smallint NOT NULL,
	"payout_numerators" jsonb NOT NULL,
	"payout_denominator" bigint NOT NULL,
	"question_id" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_refunds" (
	"funding_record_addr" varchar(44) PRIMARY KEY NOT NULL,
	"launch_addr" varchar(44) NOT NULL,
	"funder_addr" varchar(44) NOT NULL,
	"slot" bigint NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"quote_amount" numeric(20, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_splits" (
	"vault_addr" varchar(44) NOT NULL,
	"vault_seq_num" bigint,
	"signature" varchar(88) NOT NULL,
	"slot" numeric NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_5_swaps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"signature" varchar(88) NOT NULL,
	"slot" numeric NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"swap_type" varchar NOT NULL,
	"amm_addr" varchar(44) NOT NULL,
	"user_addr" varchar(44) NOT NULL,
	"amm_seq_num" bigint NOT NULL,
	"input_amount" numeric NOT NULL,
	"output_amount" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "launch_details" DROP CONSTRAINT "launch_details_launch_addr_v0_4_launches_launch_addr_fk";
--> statement-breakpoint
-- ALTER TABLE "v0_4_proposals" DROP CONSTRAINT "v0_4_proposals_pass_amm_addr_v0_4_amms_amm_addr_fk";
-- --> statement-breakpoint
-- ALTER TABLE "v0_4_proposals" DROP CONSTRAINT "v0_4_proposals_fail_amm_addr_v0_4_amms_amm_addr_fk";
-- --> statement-breakpoint
-- ALTER TABLE "v0_4_proposals" DROP CONSTRAINT "v0_4_proposals_base_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk";
-- --> statement-breakpoint
-- ALTER TABLE "v0_4_proposals" DROP CONSTRAINT "v0_4_proposals_quote_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk";
-- --> statement-breakpoint
-- ALTER TABLE "v0_4_proposals" DROP CONSTRAINT "v0_4_proposals_question_addr_v0_4_questions_question_addr_fk";
-- --> statement-breakpoint
-- ALTER TABLE "v0_4_splits" DROP CONSTRAINT "v0_4_splits_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_amms" ADD CONSTRAINT "v0_5_amms_lp_mint_addr_tokens_mint_acct_fk" FOREIGN KEY ("lp_mint_addr") REFERENCES "public"."tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_amms" ADD CONSTRAINT "v0_5_amms_base_mint_addr_tokens_mint_acct_fk" FOREIGN KEY ("base_mint_addr") REFERENCES "public"."tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_amms" ADD CONSTRAINT "v0_5_amms_quote_mint_addr_tokens_mint_acct_fk" FOREIGN KEY ("quote_mint_addr") REFERENCES "public"."tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_claims" ADD CONSTRAINT "v0_5_claims_funding_record_addr_v0_5_funding_records_funding_record_addr_fk" FOREIGN KEY ("funding_record_addr") REFERENCES "public"."v0_5_funding_records"("funding_record_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_claims" ADD CONSTRAINT "v0_5_claims_launch_addr_v0_5_launches_launch_addr_fk" FOREIGN KEY ("launch_addr") REFERENCES "public"."v0_5_launches"("launch_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_conditional_vaults" ADD CONSTRAINT "v0_5_conditional_vaults_question_addr_v0_5_questions_question_addr_fk" FOREIGN KEY ("question_addr") REFERENCES "public"."v0_5_questions"("question_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_conditional_vaults" ADD CONSTRAINT "v0_5_conditional_vaults_underlying_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("underlying_mint_acct") REFERENCES "public"."tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_conditional_vaults" ADD CONSTRAINT "v0_5_conditional_vaults_underlying_token_acct_token_accts_token_acct_fk" FOREIGN KEY ("underlying_token_acct") REFERENCES "public"."token_accts"("token_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_daos" ADD CONSTRAINT "v0_5_daos_base_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("base_mint_acct") REFERENCES "public"."tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_daos" ADD CONSTRAINT "v0_5_daos_quote_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("quote_mint_acct") REFERENCES "public"."tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_daos" ADD CONSTRAINT "v0_5_daos_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_funding_records" ADD CONSTRAINT "v0_5_funding_records_launch_addr_v0_5_launches_launch_addr_fk" FOREIGN KEY ("launch_addr") REFERENCES "public"."v0_5_launches"("launch_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_funds" ADD CONSTRAINT "v0_5_funds_funding_record_addr_v0_5_funding_records_funding_record_addr_fk" FOREIGN KEY ("funding_record_addr") REFERENCES "public"."v0_5_funding_records"("funding_record_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_funds" ADD CONSTRAINT "v0_5_funds_launch_addr_v0_5_launches_launch_addr_fk" FOREIGN KEY ("launch_addr") REFERENCES "public"."v0_5_launches"("launch_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_launches" ADD CONSTRAINT "v0_5_launches_base_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("base_mint_acct") REFERENCES "public"."tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_launches" ADD CONSTRAINT "v0_5_launches_dao_addr_v0_5_daos_dao_addr_fk" FOREIGN KEY ("dao_addr") REFERENCES "public"."v0_5_daos"("dao_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_merges" ADD CONSTRAINT "v0_5_merges_vault_addr_v0_5_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("vault_addr") REFERENCES "public"."v0_5_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_merges" ADD CONSTRAINT "v0_5_merges_signature_signatures_signature_fk" FOREIGN KEY ("signature") REFERENCES "public"."signatures"("signature") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_metric_decisions" ADD CONSTRAINT "v0_5_metric_decisions_dao_id_dao_details_dao_id_fk" FOREIGN KEY ("dao_id") REFERENCES "public"."dao_details"("dao_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_metric_decisions" ADD CONSTRAINT "v0_5_metric_decisions_outcome_question_addr_v0_5_questions_question_addr_fk" FOREIGN KEY ("outcome_question_addr") REFERENCES "public"."v0_5_questions"("question_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_metric_decisions" ADD CONSTRAINT "v0_5_metric_decisions_metric_question_addr_v0_5_questions_question_addr_fk" FOREIGN KEY ("metric_question_addr") REFERENCES "public"."v0_5_questions"("question_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_metric_decisions" ADD CONSTRAINT "v0_5_metric_decisions_outcome_vault_addr_v0_5_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("outcome_vault_addr") REFERENCES "public"."v0_5_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_metric_decisions" ADD CONSTRAINT "v0_5_metric_decisions_metric_vault_addr_v0_5_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("metric_vault_addr") REFERENCES "public"."v0_5_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_metric_decisions" ADD CONSTRAINT "v0_5_metric_decisions_amm_addr_v0_5_amms_amm_addr_fk" FOREIGN KEY ("amm_addr") REFERENCES "public"."v0_5_amms"("amm_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_proposals" ADD CONSTRAINT "v0_5_proposals_dao_addr_v0_5_daos_dao_addr_fk" FOREIGN KEY ("dao_addr") REFERENCES "public"."v0_5_daos"("dao_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_refunds" ADD CONSTRAINT "v0_5_refunds_funding_record_addr_v0_5_funding_records_funding_record_addr_fk" FOREIGN KEY ("funding_record_addr") REFERENCES "public"."v0_5_funding_records"("funding_record_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_refunds" ADD CONSTRAINT "v0_5_refunds_launch_addr_v0_5_launches_launch_addr_fk" FOREIGN KEY ("launch_addr") REFERENCES "public"."v0_5_launches"("launch_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_splits" ADD CONSTRAINT "v0_5_splits_signature_signatures_signature_fk" FOREIGN KEY ("signature") REFERENCES "public"."signatures"("signature") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "v0_5_merge_vault_index" ON "v0_5_merges" USING btree ("vault_addr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "v0_5_merge_signature_index" ON "v0_5_merges" USING btree ("signature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "v0_5_merge_seq_num_vault_index" ON "v0_5_merges" USING btree ("vault_seq_num","vault_addr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "v0_5_split_vault_index" ON "v0_5_splits" USING btree ("vault_addr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "v0_5_split_signature_index" ON "v0_5_splits" USING btree ("signature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "v0_5_split_seq_num_vault_index" ON "v0_5_splits" USING btree ("vault_seq_num","vault_addr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "v0_5_swaps_amm_index" ON "v0_5_swaps" USING btree ("amm_addr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "v0_5_swaps_signature_index" ON "v0_5_swaps" USING btree ("signature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "v0_5_swaps_seq_num_amm_index" ON "v0_5_swaps" USING btree ("amm_seq_num","amm_addr");