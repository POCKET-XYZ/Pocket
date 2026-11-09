-- A chat per contract: the startup and the specialist, managers in a dispute,
-- and a manager's private chat with each side. Messages are never edited.
CREATE TYPE "ChatChannel" AS ENUM ('contract', 'manager_startup', 'manager_specialist');

CREATE TABLE "contract_messages" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "channel" "ChatChannel" NOT NULL DEFAULT 'contract',
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_messages_pkey" PRIMARY KEY ("id")
);

-- How far each person read each chat, and when they were last emailed about it.
CREATE TABLE "chat_read_states" (
    "user_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "channel" "ChatChannel" NOT NULL,
    "last_read_at" TIMESTAMP(3),
    "last_emailed_at" TIMESTAMP(3),

    CONSTRAINT "chat_read_states_pkey" PRIMARY KEY ("user_id","contract_id","channel")
);

CREATE INDEX "contract_messages_contract_id_channel_created_at_idx" ON "contract_messages"("contract_id", "channel", "created_at");
CREATE INDEX "contract_messages_author_id_idx" ON "contract_messages"("author_id");
CREATE INDEX "chat_read_states_contract_id_idx" ON "chat_read_states"("contract_id");

ALTER TABLE "contract_messages" ADD CONSTRAINT "contract_messages_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_messages" ADD CONSTRAINT "contract_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
