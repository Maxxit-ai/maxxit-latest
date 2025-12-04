/**
 * End-to-End Encryption Test
 * Simulates the actual flow: Node.js encrypts, Python decrypts
 */

const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENCRYPTION_KEY = '3295f0745260f0420509005dec8580174ef604c8cf7b1e9e2ccd4946d8f082e1';

console.log('🔐 End-to-End Encryption Test');
console.log('=' .repeat(60));
console.log();

// Step 1: Node.js encrypts (like lib/deployment-agent-address.ts)
console.log('1️⃣  Node.js ENCRYPTION (simulating agent key generation)');
console.log('-'.repeat(60));

function getEncryptionKey() {
  if (!ENCRYPTION_KEY) {
    return crypto.scryptSync('fallback-dev-key', 'salt', 32);
  }
  return crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
}

function encryptPrivateKey(privateKey) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

// Simulate a real agent private key
const agentPrivateKey = '0x' + crypto.randomBytes(32).toString('hex');
console.log('   Original private key:', agentPrivateKey.substring(0, 20) + '...');

const encrypted = encryptPrivateKey(agentPrivateKey);
console.log('   ✅ Encrypted successfully');
console.log('   Encrypted (hex):', encrypted.encrypted.substring(0, 40) + '...');
console.log('   IV (hex):', encrypted.iv);
console.log('   Tag (hex):', encrypted.tag);
console.log('   Derived key (hex):', getEncryptionKey().toString('hex'));
console.log();

// Step 2: Write test data for Python
console.log('2️⃣  Preparing Python test data');
console.log('-'.repeat(60));

const pythonTest = `
import os
import sys

# Add services directory to path (absolute path)
services_dir = '${path.join(__dirname, 'services').replace(/\\/g, '/')}'
sys.path.insert(0, services_dir)

os.environ['ENCRYPTION_KEY'] = '${ENCRYPTION_KEY}'

from encryption_helper import decrypt_private_key

# Test data from Node.js
encrypted_hex = '${encrypted.encrypted}'
iv_hex = '${encrypted.iv}'
tag_hex = '${encrypted.tag}'
expected = '${agentPrivateKey}'

try:
    decrypted = decrypt_private_key(encrypted_hex, iv_hex, tag_hex)
    if decrypted == expected:
        print('✅ SUCCESS: Python decrypted correctly!')
        print(f'   Decrypted: {decrypted[:20]}...')
        print(f'   Expected:  {expected[:20]}...')
        sys.exit(0)
    else:
        print('❌ FAILED: Decrypted value does not match!')
        print(f'   Decrypted: {decrypted}')
        print(f'   Expected:  {expected}')
        sys.exit(1)
except Exception as e:
    print(f'❌ ERROR: {type(e).__name__}: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
`;

fs.writeFileSync('/tmp/test_python_decrypt.py', pythonTest);
console.log('   ✅ Test file created');
console.log();

// Step 3: Python decrypts (like services/ostium-service.py)
console.log('3️⃣  Python DECRYPTION (simulating Ostium service)');
console.log('-'.repeat(60));

try {
  const result = execSync('python3 /tmp/test_python_decrypt.py', {
    encoding: 'utf-8',
    cwd: path.join(__dirname, '..'),
  });
  console.log(result);
  console.log('✅ END-TO-END TEST PASSED!');
  console.log();
  console.log('=' .repeat(60));
  console.log('🎉 Encryption/Decryption is working correctly!');
  console.log('   Node.js and Python are using compatible encryption.');
  console.log('   Ready to deploy to Railway.');
  console.log('=' .repeat(60));
} catch (error) {
  console.error('❌ END-TO-END TEST FAILED!');
  console.error(error.stdout || error.message);
  console.error(error.stderr || '');
  process.exit(1);
}

