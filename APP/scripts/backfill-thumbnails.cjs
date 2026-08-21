const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('../apps/backend/node_modules/@prisma/client');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('../node_modules/@aws-sdk/client-s3');
const sharp = require('../node_modules/sharp');

loadBackendEnv();

const DATABASE_URL = requireEnv('DATABASE_URL');
const S3_CONFIG = {
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: requireEnv('S3_ENDPOINT'),
  forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE),
  credentials: {
    accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
  },
};
const BUCKET = requireEnv('S3_BUCKET');

function loadBackendEnv() {
  const envPath = path.resolve(__dirname, '../apps/backend/.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }
}

function requireEnv(key) {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseBoolean(value) {
  return ['1', 'true', 'yes'].includes((value ?? '').trim().toLowerCase());
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const s3 = new S3Client(S3_CONFIG);

  const files = await prisma.fileObject.findMany({
    where: {
      thumbnailStorageKey: null,
      mimeType: {
        startsWith: 'image/',
        not: 'image/svg+xml',
      },
    },
    select: { id: true, storageKey: true, originalName: true, mimeType: true },
  });

  console.log(`Found ${files.length} images without thumbnails\n`);

  let ok = 0;
  let fail = 0;

  for (const file of files) {
    try {
      console.log(`Processing: ${file.originalName} (${file.id})`);

      // Download original from Minio
      const getResp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: file.storageKey }));
      if (!getResp.Body) {
        console.log('  SKIP: empty body');
        fail++;
        continue;
      }
      const buffer = await streamToBuffer(getResp.Body);

      // Generate thumbnail
      const thumb = await sharp(buffer)
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Build thumbnail key
      const idx = file.storageKey.indexOf('/');
      const groupId = file.storageKey.slice(0, idx);
      const objectKey = file.storageKey.slice(idx + 1);
      const thumbKey = `${groupId}/thumb/${objectKey}.jpg`;

      // Upload thumbnail
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: thumbKey,
        Body: thumb,
        ContentType: 'image/jpeg',
        ContentLength: thumb.length,
      }));

      // Update DB
      await prisma.fileObject.update({
        where: { id: file.id },
        data: { thumbnailStorageKey: thumbKey, thumbnailSize: thumb.length },
      });

      console.log(`  OK: ${thumb.length} bytes`);
      ok++;
    } catch (err) {
      console.log(`  FAIL: ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone. OK: ${ok}, Fail: ${fail}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
