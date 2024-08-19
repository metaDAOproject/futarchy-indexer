ALTER TABLE "user_performance" ALTER COLUMN "tokens_bought" SET DATA TYPE numeric(40, 20);--> statement-breakpoint
ALTER TABLE "user_performance" ALTER COLUMN "tokens_sold" SET DATA TYPE numeric(40, 20);--> statement-breakpoint
ALTER TABLE "user_performance" ALTER COLUMN "volume_bought" SET DATA TYPE numeric(40, 20);--> statement-breakpoint
ALTER TABLE "user_performance" ALTER COLUMN "volume_sold" SET DATA TYPE numeric(40, 20);--> statement-breakpoint
-- ALTER TABLE "user_performance" ADD COLUMN "total_volume" numeric(40, 20) NOT NULL;
-- ALTER TABLE "user_performance" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;