CREATE TABLE IF NOT EXISTS "dao_details" (
	"dao_id" bigint PRIMARY KEY NOT NULL,
	"name" varchar,
	"url" varchar,
	"x_account" varchar,
	"github" varchar,
	"description" text,
	CONSTRAINT "dao_details_name_unique" UNIQUE("name"),
	CONSTRAINT "dao_details_url_unique" UNIQUE("url"),
	CONSTRAINT "dao_details_x_account_unique" UNIQUE("x_account"),
	CONSTRAINT "dao_details_github_unique" UNIQUE("github"),
	CONSTRAINT "id_name_url" UNIQUE("dao_id","url","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "programs" (
	"program_acct" varchar(44) PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deployed_at" timestamp,
	CONSTRAINT "program_version" UNIQUE("program_acct","version")
);
--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "dao_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "program_acct" varchar(44) NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daos" ADD CONSTRAINT "daos_dao_id_dao_details_dao_id_fk" FOREIGN KEY ("dao_id") REFERENCES "dao_details"("dao_id") ON DELETE no action ON UPDATE no action;
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
ALTER TABLE "daos" DROP COLUMN IF EXISTS "name";--> statement-breakpoint
ALTER TABLE "daos" DROP COLUMN IF EXISTS "url";--> statement-breakpoint
ALTER TABLE "daos" DROP COLUMN IF EXISTS "x_account";--> statement-breakpoint
ALTER TABLE "daos" DROP COLUMN IF EXISTS "github";--> statement-breakpoint
ALTER TABLE "daos" DROP COLUMN IF EXISTS "description";--> statement-breakpoint
ALTER TABLE "daos" ADD CONSTRAINT "dao_program" UNIQUE("dao_id","program_acct");