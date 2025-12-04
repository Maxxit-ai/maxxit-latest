const crypto = require('crypto');

// Your actual encryption key
const ENCRYPTION_KEY = '3295f0745260f0420509005dec8580174ef604c8cf7b1e9e2ccd4946d8f082e1';

// Node.js scryptSync (what's used in lib/deployment-agent-address.ts)
const nodeKey = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);

console.log('Node.js derived key (hex):', nodeKey.toString('hex'));
console.log('Node.js derived key length:', nodeKey.length);

// Now let's check what Python scrypt parameters should be
// Node.js scryptSync uses different defaults than Python Scrypt!
console.log('\n⚠️  WARNING: Node.js scryptSync uses different parameters!');
console.log('Node.js defaults: N=16384 (2^14), r=8, p=1, maxmem=32MB');
console.log('Python Scrypt needs to match these exactly.');









