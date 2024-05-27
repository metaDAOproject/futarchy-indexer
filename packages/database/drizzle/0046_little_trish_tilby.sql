CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_acct" varchar(44),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "unique_user";--> statement-breakpoint
ALTER TABLE "users" ADD PRIMARY KEY ("user_acct");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_acct_users_user_acct_fk" FOREIGN KEY ("user_acct") REFERENCES "users"("user_acct") ON DELETE restrict ON UPDATE restrict;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
