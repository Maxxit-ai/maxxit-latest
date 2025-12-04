const crypto = require('crypto');

// Your actual encryption key
const ENCRYPTION_KEY = '3295f0745260f0420509005dec8580174ef604c8cf7b1e9e2ccd4946d8f082e1';

// Derive key using scryptSync (matching Node.js code)
const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);

console.log('Testing Node.js Encryption/Decryption');
console.log('======================================\n');

// Test private key
const testPrivateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

// ENCRYPT (matching lib/deployment-agent-address.ts)
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

let encrypted = cipher.update(testPrivateKey, 'utf8', 'hex');
encrypted += cipher.final('hex');
const tag = cipher.getAuthTag();

console.log('Node.js ENCRYPTION:');
console.log('  Input:', testPrivateKey);
console.log('  Encrypted (hex):', encrypted);
console.log('  IV (hex):', iv.toString('hex'));
console.log('  Tag (hex):', tag.toString('hex'));
console.log('  Derived key (hex):', key.toString('hex'));
console.log('  Derived key length:', key.length, 'bytes\n');

// DECRYPT (matching Node.js code)
const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv.toString('hex'), 'hex'));
decipher.setAuthTag(Buffer.from(tag.toString('hex'), 'hex'));

let decrypted = decipher.update(encrypted, 'hex', 'utf8');
decrypted += decipher.final('utf8');

console.log('Node.js DECRYPTION:');
console.log('  Decrypted:', decrypted);
console.log('  Match:', decrypted === testPrivateKey ? '✅ SUCCESS' : '❌ FAILED');
console.log('');

// Output for Python test
console.log('Copy these values for Python test:');
console.log('==================================');
console.log(`ENCRYPTION_KEY="${ENCRYPTION_KEY}"`);
console.log(`ENCRYPTED_HEX="${encrypted}"`);
console.log(`IV_HEX="${iv.toString('hex')}"`);
console.log(`TAG_HEX="${tag.toString('hex')}"`);
console.log(`EXPECTED_RESULT="${testPrivateKey}"`);









