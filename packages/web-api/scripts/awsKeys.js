const crypto = require('crypto');
const { SecretsManagerClient, GetSecretValueCommand, CreateSecretCommand, UpdateSecretCommand } = require("@aws-sdk/client-secrets-manager");

// Initialize the SecretsManagerClient
const client = new SecretsManagerClient();

function generateKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
}

async function updateAwsSecret(secretName, keyPair) {
  const keyId = crypto.randomBytes(8).toString('hex');
  const newSecretString = JSON.stringify({
    JWT_PRIVATE_KEY: keyPair.privateKey,
    JWT_PUBLIC_KEY: keyPair.publicKey,
    JWT_KEY_ID: keyId
  });

  try {
    // Try to get the existing secret
    const getCommand = new GetSecretValueCommand({ SecretId: secretName });
    const existingSecret = await client.send(getCommand);
    
    // If secret exists, merge new values with existing ones
    if (existingSecret.SecretString) {
      const existingSecretObj = JSON.parse(existingSecret.SecretString);
      const mergedSecret = { ...existingSecretObj, ...JSON.parse(newSecretString) };
      
      const updateCommand = new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: JSON.stringify(mergedSecret)
      });
      const result = await client.send(updateCommand);
      console.log(`Secret ${secretName} has been updated in AWS Secrets Manager`);
      console.log(`Secret ARN: ${result.ARN}`);
      return result.ARN;
    }
  } catch (error) {
    // If secret doesn't exist, create a new one
    if (error.name === 'ResourceNotFoundException') {
      const createCommand = new CreateSecretCommand({
        Name: secretName,
        SecretString: newSecretString
      });
      const result = await client.send(createCommand);
      console.log(`New secret ${secretName} has been created in AWS Secrets Manager`);
      console.log(`Secret ARN: ${result.ARN}`);
      return result.ARN;
    } else {
      throw error;
    }
  }
}

async function main() {
  // Get the secret name from command line arguments
  const secretName = process.argv[2];
  if (!secretName) {
    console.error('Please provide a secret name as a command line argument');
    process.exit(1);
  }

  const keyPair = generateKeyPair();
  const secretArn = await updateAwsSecret(secretName, keyPair);
  console.log('Operation completed successfully.');
  console.log(`Secret Name: ${secretName}`);
  console.log(`Secret ARN: ${secretArn}`);
}

main().catch(error => {
  console.error('An error occurred:', error);
  process.exit(1);
});