#!/usr/bin/env python3
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.backends import default_backend

# Test values from Node.js
ENCRYPTION_KEY = "3295f0745260f0420509005dec8580174ef604c8cf7b1e9e2ccd4946d8f082e1"
ENCRYPTED_HEX = "539fbf9e6e458670d73aa7ee9e5c132b5ec866f8b25d4b1c1237f7e07a85d81e5bbd7b282d0a685d914c553b064e4e7d56b112b9bd8487151d18dd49454242bd4a8b"
IV_HEX = "e5d29029f3ef89c25ab1f265e570d0b2"
TAG_HEX = "d47ea1eca02ae8bf781d6e2ad7c49d77"
EXPECTED_RESULT = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"

print('Testing Python Decryption')
print('=' * 50)
print()

# Derive key using Scrypt (matching Node.js scryptSync)
print('Deriving key using Scrypt...')
kdf = Scrypt(
    salt=b'salt',
    length=32,
    n=2**14,  # 16384 - Node.js default
    r=8,      # Node.js default
    p=1,      # Node.js default
    backend=default_backend()
)

key = kdf.derive(ENCRYPTION_KEY.encode('utf-8'))
print(f'  Derived key (hex): {key.hex()}')
print(f'  Derived key length: {len(key)} bytes')
print()

# Convert hex strings to bytes
encrypted = bytes.fromhex(ENCRYPTED_HEX)
iv = bytes.fromhex(IV_HEX)
tag = bytes.fromhex(TAG_HEX)

print(f'Encrypted data length: {len(encrypted)} bytes')
print(f'IV length: {len(iv)} bytes')
print(f'Tag length: {len(tag)} bytes')
print()

# Combine encrypted data with tag (AESGCM expects them together)
ciphertext = encrypted + tag
print(f'Combined ciphertext length: {len(ciphertext)} bytes')
print()

# Decrypt
print('Attempting decryption...')
try:
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, ciphertext, None)
    decrypted = plaintext.decode('utf-8')
    
    print(f'✅ Decryption SUCCESSFUL!')
    print(f'  Decrypted: {decrypted}')
    print(f'  Expected:  {EXPECTED_RESULT}')
    print(f'  Match: {"✅ YES" if decrypted == EXPECTED_RESULT else "❌ NO"}')
except Exception as e:
    print(f'❌ Decryption FAILED: {type(e).__name__}: {e}')
    import traceback
    traceback.print_exc()









