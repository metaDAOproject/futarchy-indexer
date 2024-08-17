ALTER TABLE "user_performance" DROP COLUMN "total_volume";

ALTER TABLE "user_performance" ALTER COLUMN "tokens_bought" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "user_performance" ALTER COLUMN "tokens_sold" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "user_performance" ALTER COLUMN "volume_bought" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "user_performance" ALTER COLUMN "volume_sold" SET DATA TYPE bigint;--> statement-breakpoint

ALTER TABLE "user_performance" ADD COLUMN "total_volume" bigint GENERATED ALWAYS AS (volume_sold + volume_bought) STORED;