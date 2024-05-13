ALTER TABLE "makes" ALTER COLUMN "quote_price" SET DATA TYPE numeric(40, 20);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "quote_price" SET DATA TYPE numeric(40, 20);--> statement-breakpoint
ALTER TABLE "takes" ALTER COLUMN "quote_price" SET DATA TYPE numeric(40, 20);