#!/usr/bin/env python3
import sys
import os

# Add services directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'services'))

# Set the encryption key
os.environ['ENCRYPTION_KEY'] = '3295f0745260f0420509005dec8580174ef604c8cf7b1e9e2ccd4946d8f082e1'

from encryption_helper import get_encryption_key

try:
    python_key = get_encryption_key()
    print('Python derived key (hex):', python_key.hex())
    print('Python derived key length:', len(python_key))
except Exception as e:
    print('❌ Error:', e)
    import traceback
    traceback.print_exc()









