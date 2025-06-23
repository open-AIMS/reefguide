import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException } from '../exceptions';

const MAX_FILES = 10;

export interface MinioConfig {
  endpoint: string;
  username: string;
  password: string;
}

export class S3StorageService {
  private s3Client: S3Client;

  private bucketName: string;
  private minio: MinioConfig | undefined;

  constructor(bucketName: string, options?: { minio?: MinioConfig }) {
    this.minio = options?.minio;
    if (this.minio) {
      console.log(`Using a locally mocked S3 endpoint - provided with URL: ${this.minio.endpoint}`);
    }
    if (this.minio) {
      this.s3Client = new S3Client({
        region: 'ap-southeast-2',
        forcePathStyle: true,
        tls: false,
        endpoint: this.minio.endpoint,
        credentials: { accessKeyId: this.minio.username, secretAccessKey: this.minio.password }
      });
    } else {
      this.s3Client = new S3Client({});
    }
    this.bucketName = bucketName;
  }

  /**
   * Generates a unique S3 storage location for a job
   * @param jobType Type of the job
   * @param jobId ID of the job
   * @returns Full S3 URI for the storage location
   */
  generateStorageLocation(jobType: string, jobId: number): string {
    const timestamp = new Date().toISOString().split('T')[0];
    return `s3://${this.bucketName}/jobs/${jobType.toLowerCase()}/${jobId}/${timestamp}`;
  }

  /**
   * Converts S3 URI to bucket/key format
   * @param uri Full S3 URI (s3://bucket/path/to/object)
   * @returns Object containing bucket and key
   */
  private parseS3Uri(uri: string): { bucket: string; prefix: string } {
    const matches = uri.match(/^s3:\/\/([^\/]+)\/(.+?)\/?$/);
    if (!matches) {
      throw new BadRequestException('Invalid S3 URI format');
    }
    return {
      bucket: matches[1],
      prefix: matches[2]
    };
  }

  /**
   * Lists all files in a location and generates presigned URLs with relative paths
   * @param locationUri S3 URI to scan
   * @param expirySeconds How long the URLs should be valid for
   * @returns Map of relative file paths to presigned URLs
   */
  async getPresignedUrls(
    locationUri: string,
    expirySeconds = 3600
  ): Promise<Record<string, string>> {
    const { bucket, prefix } = this.parseS3Uri(locationUri);

    console.log('Bucket prefix', bucket, prefix);

    // List all objects in the location
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix
    });
    const response = await this.s3Client.send(listCommand);
    const files = response.Contents || [];

    // Validate file count
    if (files.length > MAX_FILES) {
      throw new BadRequestException(`Location contains more than ${MAX_FILES} files`);
    }

    // Generate presigned URLs for each file with relative paths
    const urlMap: Record<string, string> = {};
    for (const file of files) {
      if (!file.Key) continue;

      // Get the relative path by removing the prefix
      const relativePath = file.Key.slice(prefix.length).replace(/^\//, '');

      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: file.Key
      });
      const presignedUrl = await getSignedUrl(this.s3Client, getCommand, {
        expiresIn: expirySeconds
      });

      urlMap[relativePath] = presignedUrl;
    }

    return urlMap;
  }
}

// Singleton instance
let S3_SERVICE: S3StorageService | null = null;

export function getS3Service(): S3StorageService {
  if (!S3_SERVICE) {
    throw new Error('S3 service not initialized. Call initializeS3Service() first.');
  }
  return S3_SERVICE;
}

export function initializeS3Service(
  bucketName: string,
  options?: { minio?: MinioConfig }
): S3StorageService {
  if (S3_SERVICE) {
    console.warn('S3 service already initialized, returning existing instance');
    return S3_SERVICE;
  }

  S3_SERVICE = new S3StorageService(bucketName, options);
  return S3_SERVICE;
}
