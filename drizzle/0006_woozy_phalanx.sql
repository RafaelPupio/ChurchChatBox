CREATE TABLE "webhook_failure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid,
	"reason" text NOT NULL,
	"failure_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_failure_church_reason_uq" UNIQUE NULLS NOT DISTINCT("church_id","reason")
);
--> statement-breakpoint
ALTER TABLE "church" ALTER COLUMN "courtesy_text" SET DEFAULT 'Amém! 🙏 Que Deus abençoe você.';--> statement-breakpoint
ALTER TABLE "webhook_failure" ADD CONSTRAINT "webhook_failure_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_failure_last_seen_idx" ON "webhook_failure" USING btree ("last_seen_at");