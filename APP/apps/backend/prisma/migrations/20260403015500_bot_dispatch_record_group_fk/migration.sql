ALTER TABLE "BotDispatchRecord"
ADD CONSTRAINT "BotDispatchRecord_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
