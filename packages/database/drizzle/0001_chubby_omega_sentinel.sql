CREATE TABLE IF NOT EXISTS "signatures" (
	"signature" varchar(88) NOT NULL,
	"queried_addr" varchar(44) NOT NULL,
	"slot" bigint NOT NULL,
	"did_err" boolean NOT NULL,
	"err" text,
	"block_time" timestamp with time zone,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seq_num" bigserial NOT NULL,
	CONSTRAINT "signatures_signature_queried_addr_pk" PRIMARY KEY("signature","queried_addr"),
	CONSTRAINT "signatures_seq_num_unique" UNIQUE("seq_num")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_4_amms" (
	"amm_addr" varchar(44) PRIMARY KEY NOT NULL,
	"created_at_slot" bigint NOT NULL,
	"lp_mint_addr" varchar(44) NOT NULL,
	"base_mint_addr" varchar(44) NOT NULL,
	"quote_mint_addr" varchar(44) NOT NULL,
	"base_reserves" bigint NOT NULL,
	"quote_reserves" bigint NOT NULL,
	"latest_amm_seq_num_applied" bigint NOT NULL,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_4_conditional_vaults" (
	"conditional_vault_addr" varchar(44) PRIMARY KEY NOT NULL,
	"question_addr" varchar(44) NOT NULL,
	"underlying_mint_acct" varchar(44) NOT NULL,
	"underlying_token_acct" varchar(44) NOT NULL,
	"pda_bump" smallint NOT NULL,
	"latest_vault_seq_num_applied" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_4_metric_decisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dao_id" bigint NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"outcome_question_addr" varchar(44) NOT NULL,
	"metric_question_addr" varchar(44) NOT NULL,
	"outcome_vault_addr" varchar(44) NOT NULL,
	"metric_vault_addr" varchar(44) NOT NULL,
	"amm_addr" varchar(44) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_4_questions" (
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
CREATE TABLE IF NOT EXISTS "v0_4_swaps" (
	"signature" varchar(88) PRIMARY KEY NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"swap_type" varchar NOT NULL,
	"amm_addr" varchar(44) NOT NULL,
	"user_addr" varchar(44) NOT NULL,
	"input_amount" bigint NOT NULL,
	"output_amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slot_index" ON "signatures" ("slot");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sequence_num_index" ON "signatures" ("seq_num");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queried_addr_index" ON "signatures" ("queried_addr");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_amms" ADD CONSTRAINT "v0_4_amms_lp_mint_addr_tokens_mint_acct_fk" FOREIGN KEY ("lp_mint_addr") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_amms" ADD CONSTRAINT "v0_4_amms_base_mint_addr_tokens_mint_acct_fk" FOREIGN KEY ("base_mint_addr") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_amms" ADD CONSTRAINT "v0_4_amms_quote_mint_addr_tokens_mint_acct_fk" FOREIGN KEY ("quote_mint_addr") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_conditional_vaults" ADD CONSTRAINT "v0_4_conditional_vaults_question_addr_v0_4_questions_question_addr_fk" FOREIGN KEY ("question_addr") REFERENCES "v0_4_questions"("question_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_conditional_vaults" ADD CONSTRAINT "v0_4_conditional_vaults_underlying_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("underlying_mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_conditional_vaults" ADD CONSTRAINT "v0_4_conditional_vaults_underlying_token_acct_token_accts_token_acct_fk" FOREIGN KEY ("underlying_token_acct") REFERENCES "token_accts"("token_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_metric_decisions" ADD CONSTRAINT "v0_4_metric_decisions_dao_id_dao_details_dao_id_fk" FOREIGN KEY ("dao_id") REFERENCES "dao_details"("dao_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_metric_decisions" ADD CONSTRAINT "v0_4_metric_decisions_outcome_question_addr_v0_4_questions_question_addr_fk" FOREIGN KEY ("outcome_question_addr") REFERENCES "v0_4_questions"("question_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_metric_decisions" ADD CONSTRAINT "v0_4_metric_decisions_metric_question_addr_v0_4_questions_question_addr_fk" FOREIGN KEY ("metric_question_addr") REFERENCES "v0_4_questions"("question_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_metric_decisions" ADD CONSTRAINT "v0_4_metric_decisions_outcome_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("outcome_vault_addr") REFERENCES "v0_4_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_metric_decisions" ADD CONSTRAINT "v0_4_metric_decisions_metric_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("metric_vault_addr") REFERENCES "v0_4_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_metric_decisions" ADD CONSTRAINT "v0_4_metric_decisions_amm_addr_v0_4_amms_amm_addr_fk" FOREIGN KEY ("amm_addr") REFERENCES "v0_4_amms"("amm_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
