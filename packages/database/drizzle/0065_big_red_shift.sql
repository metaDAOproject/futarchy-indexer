CREATE TABLE IF NOT EXISTS "signatures" (
	"signature" varchar(88) PRIMARY KEY NOT NULL,
	"slot" bigint NOT NULL,
	"did_err" boolean NOT NULL,
	"err" text,
	"block_time" timestamp with time zone
);
--> statement-breakpoint
-- DROP TABLE "transaction_watcher_transactions";--> statement-breakpoint
-- DROP TABLE "transaction_watchers";