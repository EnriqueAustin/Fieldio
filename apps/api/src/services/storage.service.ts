import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import sharp from 'sharp';
import { config } from '../config/env';

let s3: S3Client | null = null;

export const isStorageConfigured = () =>
    Boolean(config.S3_BUCKET && config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY);

const getClient = (): S3Client => {
    if (!isStorageConfigured()) {
        throw new Error('Object storage is not configured (S3_* env vars)');
    }
    if (!s3) {
        s3 = new S3Client({
            region: config.S3_REGION,
            endpoint: config.S3_ENDPOINT,
            forcePathStyle: Boolean(config.S3_ENDPOINT),
            credentials: {
                accessKeyId: config.S3_ACCESS_KEY_ID!,
                secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
            },
        });
    }
    return s3;
};

const publicUrl = (key: string) => {
    if (config.S3_PUBLIC_URL) return `${config.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
    if (config.S3_ENDPOINT)
        return `${config.S3_ENDPOINT.replace(/\/$/, '')}/${config.S3_BUCKET}/${key}`;
    return `https://${config.S3_BUCKET}.s3.${config.S3_REGION}.amazonaws.com/${key}`;
};

export const storageService = {
    /**
     * Upload an image buffer + generate a thumbnail. Strips EXIF.
     */
    uploadJobPhoto: async (params: {
        companyId: string;
        jobId: string;
        buffer: Buffer;
        contentType: string;
    }) => {
        const client = getClient();
        const id = crypto.randomBytes(8).toString('hex');
        const baseKey = `companies/${params.companyId}/jobs/${params.jobId}/${id}`;

        const cleaned = await sharp(params.buffer).rotate().jpeg({ quality: 85 }).toBuffer();
        const thumb = await sharp(params.buffer)
            .rotate()
            .resize(400, 400, { fit: 'inside' })
            .jpeg({ quality: 75 })
            .toBuffer();

        const fullKey = `${baseKey}.jpg`;
        const thumbKey = `${baseKey}-thumb.jpg`;

        await client.send(
            new PutObjectCommand({
                Bucket: config.S3_BUCKET!,
                Key: fullKey,
                Body: cleaned,
                ContentType: 'image/jpeg',
            })
        );
        await client.send(
            new PutObjectCommand({
                Bucket: config.S3_BUCKET!,
                Key: thumbKey,
                Body: thumb,
                ContentType: 'image/jpeg',
            })
        );

        return { url: publicUrl(fullKey), thumbnailUrl: publicUrl(thumbKey), key: fullKey };
    },

    presignGet: async (key: string, expiresInSeconds = 3600) => {
        const client = getClient();
        return getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: config.S3_BUCKET!, Key: key }),
            { expiresIn: expiresInSeconds }
        );
    },

    deleteObject: async (key: string) => {
        const client = getClient();
        await client.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET!, Key: key }));
    },
};
