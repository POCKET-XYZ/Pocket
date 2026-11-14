-- The Pocket assistant: one row per request, with its tokens, cost and outcome.
CREATE TYPE "AssistantKind" AS ENUM ('job_draft', 'delivery_report', 'delivery_review');
CREATE TYPE "AssistantStatus" AS ENUM ('shown', 'failed', 'rejected_precheck');
CREATE TYPE "AssistantOutcome" AS ENUM ('resolved', 'no_outcome');

CREATE TABLE "assistant_suggestions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "AssistantKind" NOT NULL,
    "job_id" UUID,
    "milestone_id" UUID,
    "deliverable_id" UUID,
    "input_text" TEXT,
    "output_json" JSONB,
    "prompt_version" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_write_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "status" "AssistantStatus" NOT NULL,
    "failure_reason" TEXT,
    "counts_toward_limit" BOOLEAN NOT NULL DEFAULT false,
    "asked_questions" BOOLEAN NOT NULL DEFAULT false,
    "field_outcomes" JSONB,
    "final_texts" JSONB,
    "outcome" "AssistantOutcome",
    "review_feedback" TEXT,
    "review_action" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "assistant_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistant_suggestions_user_id_created_at_idx" ON "assistant_suggestions"("user_id", "created_at");
CREATE INDEX "assistant_suggestions_created_at_idx" ON "assistant_suggestions"("created_at");
CREATE INDEX "assistant_suggestions_deliverable_id_idx" ON "assistant_suggestions"("deliverable_id");

ALTER TABLE "assistant_suggestions" ADD CONSTRAINT "assistant_suggestions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
