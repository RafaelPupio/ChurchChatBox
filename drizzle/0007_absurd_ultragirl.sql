CREATE TYPE "public"."erasure_reason" AS ENUM('subject_request', 'retention');--> statement-breakpoint
CREATE TYPE "public"."erasure_status" AS ENUM('pending', 'done');--> statement-breakpoint
CREATE TABLE "erasure_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"reason" "erasure_reason" NOT NULL,
	"status" "erasure_status" DEFAULT 'pending' NOT NULL,
	"subject_contact_id" uuid,
	"subject_phone_hash" text,
	"performed_by_email" text,
	"messages_deleted" integer DEFAULT 0 NOT NULL,
	"prayers_deleted" integer DEFAULT 0 NOT NULL,
	"contacts_deleted" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "church" ADD COLUMN "retention_purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "erasure_record" ADD CONSTRAINT "erasure_record_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "erasure_record_church_created_idx" ON "erasure_record" USING btree ("church_id","created_at");--> statement-breakpoint
CREATE INDEX "erasure_record_phone_hash_idx" ON "erasure_record" USING btree ("church_id","subject_phone_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "erasure_record_subject_uq" ON "erasure_record" USING btree ("church_id","subject_contact_id") WHERE "erasure_record"."reason" = 'subject_request';--> statement-breakpoint
CREATE INDEX "contact_church_idle_idx" ON "contact" USING btree ("church_id",coalesce("last_inbound_at", "created_at"));--> statement-breakpoint
CREATE INDEX "message_church_created_idx" ON "message" USING btree ("church_id","created_at");--> statement-breakpoint
CREATE INDEX "message_contact_keyset_idx" ON "message" USING btree ("church_id","contact_id","created_at","id");--> statement-breakpoint
CREATE INDEX "prayer_request_church_created_idx" ON "prayer_request" USING btree ("church_id","created_at");--> statement-breakpoint
CREATE INDEX "prayer_request_contact_keyset_idx" ON "prayer_request" USING btree ("church_id","contact_id","created_at","id");