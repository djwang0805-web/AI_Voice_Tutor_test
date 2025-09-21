import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import {Upload} from '@aws-sdk/lib-storage';

const bucket = process.env.S3_BUCKET;
const region = process.env.AWS_REGION;
const baseUrl = process.env.PUBLIC_AUDIO_BASE;

const s3 = new S3Client({ region });

async function existsS3(key) {
  try {
    await s3.send(new HeadObjectCommand({Bucket: bucket, Key: key}));
    return true;
  } catch (e) {
    return false;
  }
}

async function putS3(key, bytes, contentType = 'audio/ogg') {
  const uploader = new Upload( {
    client: s3,
    params: {Bucket: bucket, Key: key, Body: bytes, ContentType: contentType}
  });
  await uploader.done();
  return `${baseUrl}/${encodeURIComponent(key)}`;
}

export default {
  existsS3,
  putS3
}