const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

function updateEnvFile(keyPair) {
  const envPath = path.join(__dirname,"../", '.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }


  const updateOrAddEnvVariable = (name, value) => {
    const escapedValue = value.replace(/\n/g, '\\n');
    if (envContent.includes(`${name}=`)) {
      envContent = envContent.replace(new RegExp(`${name}=.*`), `${name}=${escapedValue}`);
    } else {
      envContent += `\n${name}=${escapedValue}`;
    }
  };

  updateOrAddEnvVariable('JWT_PRIVATE_KEY', keyPair.privateKey);
  updateOrAddEnvVariable('JWT_PUBLIC_KEY', keyPair.publicKey);
  
  // Generate a unique key ID
  const keyId = crypto.randomBytes(8).toString('hex');
  updateOrAddEnvVariable('JWT_KEY_ID', keyId);

  fs.writeFileSync(envPath, envContent.trim());

  console.log('RSA key pair and Key ID have been generated and added to .env file');
}

const keyPair = generateKeyPair();
updateEnvFile(keyPair);