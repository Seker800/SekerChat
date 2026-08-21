SELECT COUNT(*) AS "nonDmWithoutServer"
FROM "Group"
WHERE "isDM" = false AND "serverId" IS NULL;

SELECT COUNT(*) AS "dmWithServer"
FROM "Group"
WHERE "isDM" = true AND "serverId" IS NOT NULL;

SELECT COUNT(*) AS "orphanedServerReferences"
FROM "Group" channel
LEFT JOIN "Server" server ON server."id" = channel."serverId"
WHERE channel."serverId" IS NOT NULL AND server."id" IS NULL;

SELECT "name", COUNT(*) AS "duplicateCount"
FROM "Server"
GROUP BY "name"
HAVING COUNT(*) > 1;
