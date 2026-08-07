CREATE TYPE "public"."church_status" AS ENUM('active', 'past_due', 'suspended');--> statement-breakpoint
CREATE TABLE "owner_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "church" ADD COLUMN "status" "church_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "church" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "church" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "church" ADD COLUMN "grace_until" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_user_email_uq" ON "owner_user" USING btree ("email");