import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
export function imageStorageReady() {
  return !!(
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  );
}
export function imageStorage() {
  if (!imageStorageReady())
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
  await imageStorage().send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: object_key,
      Body: image,
      ContentType: 'image/webp',
    }),
  );
  return object_key;
}
export async function readImage(key: string) {
  const result = await imageStorage().send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
  );
  return result.Body!.transformToByteArray();
}
export async function deleteImage(key: string) {
  await imageStorage().send(
    new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
  );
}
