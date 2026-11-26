#!/usr/bin/env node

// Maintenance-only Server visibility tool. Production use requires explicit authorization;
// this script is never executed by the application.
//
//   node scripts/servers-visibility.mjs list
//   node scripts/servers-visibility.mjs hide-empty [--apply]
//   node scripts/servers-visibility.mjs hide <serverId> [<serverId>...]
//   node scripts/servers-visibility.mjs unhide <serverId> [<serverId>...]

import { PrismaClient } from '@prisma/client';

const DEFAULT_SERVER_NAME = '未分类';

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function assertLocalTarget(databaseUrl, allowRemote) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }
  if (!allowRemote && !LOCAL_DATABASE_HOSTS.has(url.hostname)) {
    throw new Error(
      'Refusing to run against a non-local database. Re-run with --allow-remote only for explicitly authorized production maintenance.',
    );
  }
  return url;
}

function printTarget(url) {
  const database = url.pathname.replace(/^\//, '') || '(unknown)';
  console.log(`Target: ${url.protocol}//${url.hostname}:${url.port || 'default'}/${database}`);
}

function usage() {
  console.error(
    [
      'Usage:',
      '  node scripts/servers-visibility.mjs list',
      '  node scripts/servers-visibility.mjs hide-empty [--apply]',
      '  node scripts/servers-visibility.mjs hide <serverId> [<serverId>...]',
      '  node scripts/servers-visibility.mjs unhide <serverId> [<serverId>...]',
    ].join('\n'),
  );
}

function formatServer(server) {
  const archived = server.archivedAt ? 'archived' : 'active';
  const hidden = server.hiddenAt ? 'hidden' : 'visible';
  const count = server._count?.groups ?? server.groupCount ?? 0;
  return `${server.id}  ${server.name}  [${archived}/${hidden}]  channels=${count}`;
}

async function listHidden(prisma) {
  const servers = await prisma.server.findMany({
    where: { hiddenAt: { not: null } },
    orderBy: { hiddenAt: 'desc' },
    select: {
      id: true,
      name: true,
      hiddenAt: true,
      archivedAt: true,
      _count: { select: { groups: { where: { isDM: false } } } },
    },
  });

  if (!servers.length) {
    console.log('No hidden servers.');
    return;
  }
  for (const server of servers) {
    console.log(formatServer(server));
  }
}

async function hideEmpty(prisma, apply) {
  const servers = await prisma.server.findMany({
    where: {
      hiddenAt: null,
      archivedAt: null,
      name: { not: DEFAULT_SERVER_NAME },
      groups: { none: { isDM: false } },
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      archivedAt: true,
      _count: { select: { groups: { where: { isDM: false } } } },
    },
  });

  if (!servers.length) {
    console.log('No empty visible servers.');
    return;
  }

  if (!apply) {
    for (const server of servers) {
      console.log(`DRY-RUN ${formatServer(server)}`);
    }
    console.log(`\n${servers.length} server(s) would be hidden. Re-run with --apply.`);
    return;
  }

  const changedAt = new Date();
  let hiddenCount = 0;
  for (const server of servers) {
    const changed = await prisma.$transaction(async (transaction) => {
      const result = await transaction.server.updateMany({
        where: {
          id: server.id,
          hiddenAt: null,
          archivedAt: null,
          name: { not: DEFAULT_SERVER_NAME },
          groups: { none: { isDM: false } },
        },
        data: { hiddenAt: changedAt },
      });
      if (result.count > 0) {
        await transaction.outboxEvent.create({
          data: {
            eventType: 'server.visibility.changed.v1',
            aggregateType: 'Server',
            aggregateId: server.id,
            payload: { serverId: server.id, hidden: true },
          },
        });
      }
      return result.count > 0;
    });
    if (!changed) {
      console.log(`SKIP (changed during run) ${server.id}  ${server.name}`);
      continue;
    }
    hiddenCount += 1;
    console.log(`HIDE ${formatServer(server)}`);
    console.log(
      JSON.stringify({
        event: 'server_hidden',
        actorUserId: 'cli',
        serverId: server.id,
        serverName: server.name,
        archived: Boolean(server.archivedAt),
        groupCount: 0,
        reason: 'cli-hide-empty',
      }),
    );
  }
  console.log(`\nHidden ${hiddenCount} server(s).`);
}

async function setHiddenByIds(prisma, ids, hidden) {
  const servers = await prisma.server.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      hiddenAt: true,
      archivedAt: true,
      _count: { select: { groups: { where: { isDM: false } } } },
    },
  });
  const foundIds = new Set(servers.map((server) => server.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length) {
    throw new Error(`Unknown server id(s): ${missing.join(', ')}`);
  }

  const changedAt = new Date();
  for (const server of servers) {
    if (hidden && server.name === DEFAULT_SERVER_NAME) {
      console.log(`SKIP default server ${server.id} (${server.name})`);
      continue;
    }
    if (hidden && server.hiddenAt) {
      console.log(`SKIP already hidden ${server.id} (${server.name})`);
      continue;
    }
    if (!hidden && !server.hiddenAt) {
      console.log(`SKIP already visible ${server.id} (${server.name})`);
      continue;
    }

    const changed = await prisma.$transaction(async (transaction) => {
      const result = await transaction.server.updateMany({
        where: { id: server.id, hiddenAt: hidden ? null : { not: null } },
        data: { hiddenAt: hidden ? changedAt : null },
      });
      if (result.count > 0) {
        await transaction.outboxEvent.create({
          data: {
            eventType: 'server.visibility.changed.v1',
            aggregateType: 'Server',
            aggregateId: server.id,
            payload: { serverId: server.id, hidden },
          },
        });
      }
      return result.count > 0;
    });
    if (!changed) {
      console.log(`SKIP (changed during run) ${server.id}  ${server.name}`);
      continue;
    }
    console.log(
      JSON.stringify({
        event: hidden ? 'server_hidden' : 'server_unhidden',
        actorUserId: 'cli',
        serverId: server.id,
        serverName: server.name,
        archived: Boolean(server.archivedAt),
        groupCount: server._count.groups,
        reason: 'cli',
      }),
    );
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  const targetUrl = assertLocalTarget(databaseUrl, args.includes('--allow-remote'));
  printTarget(targetUrl);
  const prisma = new PrismaClient();

  try {
    switch (command) {
      case 'list':
        await listHidden(prisma);
        break;
      case 'hide-empty':
        await hideEmpty(prisma, args.includes('--apply'));
        break;
      case 'hide':
      case 'unhide': {
        const ids = args.filter((arg) => !arg.startsWith('--'));
        if (!ids.length) {
          usage();
          process.exitCode = 1;
          return;
        }
        await setHiddenByIds(prisma, ids, command === 'hide');
        break;
      }
      default:
        usage();
        process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
