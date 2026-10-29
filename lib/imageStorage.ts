import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';

function diskStorageSelected() {
  const provider = process.env.KEENVENTORY_MEDIA_STORAGE;
  if (provider && provider !== 'disk' && provider !== 's3')
    throw Error('KEENVENTORY_MEDIA_STORAGE must be disk or s3.');
  return provider === 'disk' || (!provider && !s3StorageReady());
}
function s3StorageReady() {
  return !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}
function uploadsDirectory() {
  if (process.env.RENDER === 'true' && !process.env.KEENVENTORY_DATA_DIR)
    throw Error('Set KEENVENTORY_DATA_DIR to your Render persistent disk mount path before uploading files.');
  return path.resolve(process.env.KEENVENTORY_DATA_DIR || path.join(process.cwd(), 'data'), 'uploads');
}
function diskPath(key: string) {
  // Only application-generated keys can address files within uploads.
  if (!/^disk:(products|content)\/[a-f0-9-]+\.(webp|mp4|webm)$/.test(key))
    throw Error('Invalid upload key.');
  return path.join(uploadsDirectory(), key.slice(5));
}
async function storeObject(key: string, bytes: Buffer, contentType: string) {
  if (diskStorageSelected()) {
    const storedKey = 'disk:' + key;
    const destination = diskPath(storedKey);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
    return storedKey;
  }
  await imageStorage().send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET, Key: key, Body: bytes, ContentType: contentType,
  }));
  return key;
}
export function imageStorageReady() {
  if (!diskStorageSelected()) return s3StorageReady();
  return process.env.RENDER !== 'true' || !!process.env.KEENVENTORY_DATA_DIR;
}
export function imageStorage() {
  if (!s3StorageReady())
    throw Error(
      'Configure persistent S3-compatible image storage before uploading images.',
    );
  return new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
}
export async function storeImage(file: File) {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 8 * 1024 * 1024
  )
    throw Error('Choose a JPG, PNG, or WebP image no larger than 8 MB.');
  const input = Buffer.from(await file.arrayBuffer());
  const source = sharp(input, { limitInputPixels: 40000000 });
  const meta = await source.metadata();
  if (!['jpeg', 'png', 'webp'].includes(meta.format ?? ''))
    throw Error('Unsupported image data.');
  const image = await source
    .rotate()
    .resize({
      width: 1800,
      height: 1800,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();
  const object_key = `products/${randomUUID()}.webp`;
  return storeObject(object_key, image, 'image/webp');
}
export async function readImage(key: string) {
  if (key.startsWith('disk:')) return readFile(diskPath(key));
  const result = await imageStorage().send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
  );
  return result.Body!.transformToByteArray();
}
export async function deleteImage(key: string) {
  if (key.startsWith('disk:')) {
    await unlink(diskPath(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    return;
  }
  await imageStorage().send(
    new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
  );
}
export async function storeMedia(file: File) {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    return { key: await storeImage(file), type: 'image/webp' };
  if (!['video/mp4', 'video/webm'].includes(file.type) || file.size > 40 * 1024 * 1024)
    throw Error('Use JPG, PNG, WebP, MP4 or WebM; videos must be 40 MB or smaller.');
  const bytes = Buffer.from(await file.arrayBuffer());
  if (file.type === 'video/mp4'
    ? bytes.toString('ascii', 4, 8) !== 'ftyp'
    : bytes.subarray(0, 4).toString('hex') !== '1a45dfa3')
    throw Error('Unsupported video data.');
  const key = `content/${randomUUID()}.${file.type === 'video/mp4' ? 'mp4' : 'webm'}`;
  return { key: await storeObject(key, bytes, file.type), type: file.type };
}
