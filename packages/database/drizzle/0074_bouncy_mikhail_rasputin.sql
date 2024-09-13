CREATE TABLE IF NOT EXISTS "v0_4_conditional_vaults" (
	"conditional_vault_addr" varchar(44) PRIMARY KEY NOT NULL,
	"question_addr" varchar(44) NOT NULL,
	"underlying_mint_acct" varchar(44) NOT NULL,
	"underlying_token_acct" varchar(44) NOT NULL,
	"pda_bump" smallint NOT NULL,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
