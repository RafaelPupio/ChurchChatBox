CREATE TYPE "public"."contact_mode" AS ENUM('bot', 'awaiting_prayer', 'human');--> statement-breakpoint
CREATE TYPE "public"."menu_item_kind" AS ENUM('content', 'prayer', 'human');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."prayer_status" AS ENUM('novo', 'orado');--> statement-breakpoint
CREATE TABLE "admin_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "church" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone_number_id" text,
	"access_token" text,
	"webhook_verify_token" text,
	"app_secret" text,
	"greeting_text" text NOT NULL,
	"menu_header_text" text NOT NULL,
	"menu_button_label" text NOT NULL,
	"fallback_text" text NOT NULL,
	"unsupported_media_text" text NOT NULL,
	"error_text" text NOT NULL,
	"prayer_prompt_text" text NOT NULL,
	"prayer_thanks_text" text NOT NULL,
	"handoff_text" text NOT NULL,
	"handoff_closed_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"mode" "contact_mode" DEFAULT 'bot' NOT NULL,
	"mode_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"kind" "menu_item_kind" DEFAULT 'content' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"wa_message_id" text,
	"direction" "message_direction" NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prayer_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"text" text NOT NULL,
	"status" "prayer_status" DEFAULT 'novo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_user" ADD CONSTRAINT "admin_user_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_request" ADD CONSTRAINT "prayer_request_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_request" ADD CONSTRAINT "prayer_request_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_user_email_uq" ON "admin_user" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "church_phone_number_id_uq" ON "church" USING btree ("phone_number_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_church_phone_uq" ON "contact" USING btree ("church_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "message_wa_message_id_uq" ON "message" USING btree ("wa_message_id");