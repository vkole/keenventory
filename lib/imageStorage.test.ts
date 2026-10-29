import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { storeImage, storeMedia, readImage, deleteImage, imageStorageReady } from './imageStorage';

test('disk uploads persist on the filesystem, validate media, and cannot escape storage', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'keenventory-disk-media-'));
  const names = ['KEENVENTORY_DATA_DIR', 'KEENVENTORY_MEDIA_STORAGE', 'RENDER'];
  const previous = names.map((name) => process.env[name]);
  Object.assign(process.env, { KEENVENTORY_DATA_DIR: folder, KEENVENTORY_MEDIA_STORAGE: 'disk', RENDER: 'true' });
  try {
    assert.equal(imageStorageReady(), true);
    const png = await sharp({ create: { width: 12, height: 8, channels: 4, background: '#123456' } }).png().toBuffer();
    const key = await storeImage(new File([new Uint8Array(png)], 'avatar.png', { type: 'image/png' }));
    assert.match(key, /^disk:products\/[a-f0-9-]+\.webp$/);
    const stored = await readImage(key);
    assert.equal((await sharp(stored).metadata()).format, 'webp');
    assert.deepEqual(Buffer.from(stored), await readFile(path.join(folder, 'uploads', key.slice(5))));
    const video = Buffer.from('000000186674797069736f6d', 'hex');
    const media = await storeMedia(new File([video], 'clip.mp4', { type: 'video/mp4' }));
    assert.match(media.key, /^disk:content\/[a-f0-9-]+\.mp4$/);
    assert.deepEqual(Buffer.from(await readImage(media.key)), video);
    for (const unsafe of ['disk:../keenventory.db', 'disk:products/../../keenventory.db', 'disk:/etc/passwd', 'disk:products/abc.webp/../secret']) {
      await assert.rejects(readImage(unsafe), /Invalid upload key/);
      await assert.rejects(deleteImage(unsafe), /Invalid upload key/);
    }
    await assert.rejects(storeImage(new File(['invalid'], 'bad.png', { type: 'image/png' })));
    await assert.rejects(storeMedia(new File(['invalid'], 'bad.mp4', { type: 'video/mp4' })), /Unsupported video data/);
    await deleteImage(key);
    await assert.rejects(readImage(key), { code: 'ENOENT' });
    await deleteImage(key);
    await deleteImage(media.key);
    delete process.env.KEENVENTORY_DATA_DIR;
    assert.equal(imageStorageReady(), false);
    await assert.rejects(storeMedia(new File([video], 'clip.mp4', { type: 'video/mp4' })), /persistent disk mount path/);
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
    await rm(folder, { recursive: true, force: true });
  }
});
