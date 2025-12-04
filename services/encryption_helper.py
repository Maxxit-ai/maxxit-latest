"""
AES-256-GCM Decryption Helper for Python Services
Matches the encryption/decryption logic in lib/deployment-agent-address.ts
"""

import os
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt


def get_encryption_key() -> bytes:
    """Get the encryption key from environment variables"""
    # Try both ENCRYPTION_KEY and MASTER_ENCRYPTION_KEY
    key_string = os.getenv('ENCRYPTION_KEY') or os.getenv('MASTER_ENCRYPTION_KEY')
    
    if not key_string:
        raise ValueError(
            "ENCRYPTION_KEY or MASTER_ENCRYPTION_KEY environment variable not set. "
            "This is required to decrypt agent private keys from user_agent_addresses table."
        )
    
    # Use scrypt derivation to match Node.js crypto.scryptSync()
    # Node.js: crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
    # Python equivalent:
    kdf = Scrypt(
        salt=b'salt',  # Same salt as Node.js
        length=32,     # 32 bytes = 256 bits for AES-256
        n=2**14,       # CPU/memory cost (Node.js default)
        r=8,           # Block size (Node.js default)
        p=1,           # Parallelization (Node.js default)
        backend=default_backend()
    )
    
    try:
        derived_key = kdf.derive(key_string.encode('utf-8'))
        return derived_key
    except Exception as e:
        raise ValueError(f"Failed to derive encryption key: {e}")


def decrypt_private_key(encrypted_hex: str, iv_hex: str, tag_hex: str) -> str:
    """
    Decrypt a private key using AES-256-GCM
    
    Args:
        encrypted_hex: Encrypted private key (hex string)
        iv_hex: Initialization vector (hex string)
        tag_hex: Authentication tag (hex string)
        
    Returns:
        Decrypted private key (string)
        
    Raises:
        ValueError: If decryption fails or key is missing
    """
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        logger.info("[EncryptionHelper] Starting decryption...")
        logger.info(f"[EncryptionHelper] Encrypted length: {len(encrypted_hex)}, IV length: {len(iv_hex)}, Tag length: {len(tag_hex)}")
        
        # Get encryption key
        key = get_encryption_key()
        logger.info(f"[EncryptionHelper] Derived key length: {len(key)} bytes")
        
        # Convert hex strings to bytes
        encrypted = bytes.fromhex(encrypted_hex)
        iv = bytes.fromhex(iv_hex)
        tag = bytes.fromhex(tag_hex)
        
        logger.info(f"[EncryptionHelper] Converted - Encrypted: {len(encrypted)} bytes, IV: {len(iv)} bytes, Tag: {len(tag)} bytes")
        
        # Combine encrypted data with authentication tag (AESGCM expects them together)
        ciphertext = encrypted + tag
        logger.info(f"[EncryptionHelper] Combined ciphertext length: {len(ciphertext)} bytes")
        
        # Create AESGCM cipher
        aesgcm = AESGCM(key)
        
        # Decrypt
        logger.info("[EncryptionHelper] Attempting decryption...")
        plaintext = aesgcm.decrypt(iv, ciphertext, None)
        
        logger.info("[EncryptionHelper] ✅ Decryption successful!")
        
        # Convert bytes to string
        return plaintext.decode('utf-8')
        
    except Exception as e:
        logger.error(f"[EncryptionHelper] ❌ Decryption failed: {type(e).__name__}: {e}")
        import traceback
        logger.error(f"[EncryptionHelper] Stack trace:\n{traceback.format_exc()}")
        
        error_msg = str(e)
        if 'Insufficient key' in error_msg or 'authentication tag' in error_msg.lower() or 'Authentication tag verification failed' in error_msg:
            raise ValueError(
                f"Decryption failed: The encryption key does not match. "
                f"Error: {error_msg}"
            )
        elif 'ENCRYPTION_KEY' in error_msg:
            raise ValueError(
                f"Decryption failed: ENCRYPTION_KEY environment variable issue. "
                f"Error: {error_msg}"
            )
        else:
            raise ValueError(f"Failed to decrypt private key: {type(e).__name__}: {error_msg}")


# Test the module when run directly
if __name__ == "__main__":
    # Check if encryption key is available
    try:
        key = get_encryption_key()
        print("✅ ENCRYPTION_KEY found")
        print(f"   Key length: {len(key)} bytes (expected: 32)")
        if len(key) != 32:
            print("⚠️  WARNING: Key should be 32 bytes for AES-256")
    except ValueError as e:
        print(f"❌ {e}")

