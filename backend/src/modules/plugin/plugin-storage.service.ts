import { HttpException, Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { pluginError } from './plugin.errors';

type SignedUploadInput = {
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    expiresInSeconds: number;
};

type StorageObjectMetadata = {
    contentType: string;
    sizeBytes: number;
};

@Injectable()
export class PluginStorageService {
    private s3Client: S3Client | null = null;

    constructor() {
        // Lazy-initialize storage client to avoid crashing app boot when env is not set yet.
    }

    async createSignedUpload(input: SignedUploadInput) {
        const bucketName = this.requireConfig('S3_BUCKET');
        const s3Client = this.getS3Client();

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: input.objectKey,
            ContentType: input.contentType,
            ContentLength: input.sizeBytes,
        });

        const url = await getSignedUrl(s3Client, command, {
            expiresIn: input.expiresInSeconds,
        });

        return {
            objectKey: input.objectKey,
            url,
            method: 'PUT',
            headers: {
                'Content-Type': input.contentType,
            },
            expiresInSeconds: input.expiresInSeconds,
        };
    }

    async headObject(objectKey: string): Promise<StorageObjectMetadata> {
        const bucketName = this.requireConfig('S3_BUCKET');
        const s3Client = this.getS3Client();

        try {
            const response = await s3Client.send(
                new HeadObjectCommand({
                    Bucket: bucketName,
                    Key: objectKey,
                }),
            );

            const rawType = response.ContentType ?? '';
            const contentType = rawType.split(';')[0].trim().toLowerCase();
            const size = response.ContentLength ?? NaN;

            if (!Number.isFinite(size)) {
                throw pluginError.badRequest(
                    'THUMBNAIL_SIZE_UNKNOWN',
                    'Unable to verify uploaded thumbnail size',
                    { objectKey },
                );
            }

            return {
                contentType,
                sizeBytes: Number(size),
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw pluginError.badRequest(
                'THUMBNAIL_VERIFICATION_FAILED',
                'Could not verify uploaded thumbnail object',
                { objectKey },
            );
        }
    }

    buildCdnUrl(objectKey: string) {
        const cdnBaseUrl = this.requireConfig('CDN_BASE_URL');
        return this.joinUrl(cdnBaseUrl, objectKey);
    }

    private joinUrl(baseUrl: string, path: string) {
        const cleanBase = baseUrl.replace(/\/+$/, '');
        const cleanPath = path.replace(/^\/+/, '');
        return `${cleanBase}/${cleanPath}`;
    }

    private getS3Client() {
        if (this.s3Client) {
            return this.s3Client;
        }

        const endpoint = this.requireConfig('S3_ENDPOINT');
        const region = process.env.S3_REGION?.trim() || 'auto';
        const accessKeyId = this.requireConfig('S3_ACCESS_KEY_ID');
        const secretAccessKey = this.requireConfig('S3_SECRET_ACCESS_KEY');

        this.s3Client = new S3Client({
            endpoint,
            region,
            forcePathStyle: true,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });

        return this.s3Client;
    }

    private requireConfig(envKey: string) {
        const raw = process.env[envKey];
        if (!raw || raw.trim().length === 0 || raw.trim() === 'REPLACE_ME') {
            throw pluginError.internal('CONFIGURATION_ERROR', `${envKey} must be configured`);
        }

        return raw.trim();
    }
}
