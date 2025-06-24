import app from './apiSetup';
import { config } from './config';
import { getCronService } from './cron/cronService';
import { initialiseAdmins } from './initialise';
import { initializeS3Service } from './services/s3Storage';

console.log('Initializing admins...');
initialiseAdmins();

console.log('Setting up S3 storage service');
initializeS3Service(config.s3.bucketName, { minio: config.s3.minio });

// Start cron jobs
const cronService = getCronService();
cronService.start();

const port = config.port || 5000;
app.listen(port, () => {
  console.log(`Listening: http://localhost:${port}`);
});
