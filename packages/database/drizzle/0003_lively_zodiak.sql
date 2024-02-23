CREATE TABLE IF NOT EXISTS "transactions" (
	"acct" varchar(44) NOT NULL,
	"sig" varchar(88) NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp NOT NULL,
	"processed" boolean NOT NULL
);
