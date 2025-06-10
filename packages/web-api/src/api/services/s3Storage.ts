import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException } from '../exceptions';

const MAX_FILES = 10;

export class S3StorageService {
  private s3Client: S3Client;

  private bucket: string;

  constructor(bucket: string) {
    this.s3Client = new S3Client({});
    this.bucket = bucket;
  }

  /**
   * Generates a unique S3 storage location for a job
   * @param jobType Type of the job
   * @param jobId ID of the job
   * @returns Full S3 URI for the storage location
   */
  generateStorageLocation(jobType: string, jobId: number): string {
    const timestamp = new Date().toISOString().split('T')[0];
    return `s3://${this.bucket}/jobs/${jobType.toLowerCase()}/${jobId}/${timestamp}`;
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
      prefix: matches[2],
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
    expirySeconds: number = 3600,
  ): Promise<Record<string, string>> {
    const { bucket, prefix } = this.parseS3Uri(locationUri);

    // List all objects in the location
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });
    const response = await this.s3Client.send(listCommand);
    const files = response.Contents || [];

    // Validate file count
    if (files.length > MAX_FILES) {
      throw new BadRequestException(
        `Location contains more than ${MAX_FILES} files`,
      );
    }

    // Generate presigned URLs for each file with relative paths
    const urlMap: Record<string, string> = {};
    for (const file of files) {
      if (!file.Key) continue;

      // Get the relative path by removing the prefix
      const relativePath = file.Key.slice(prefix.length).replace(/^\//, '');

      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: file.Key,
      });
      const presignedUrl = await getSignedUrl(this.s3Client, getCommand, {
        expiresIn: expirySeconds,
      });

      urlMap[relativePath] = presignedUrl;
    }

    return urlMap;
  }
}
