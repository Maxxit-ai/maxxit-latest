"""
Combined Flask app for Render deployment
Runs both Hyperliquid service and Twitter proxy
"""

import os
import sys
from threading import Thread
from dotenv import load_dotenv

# Load environment from parent directory
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(env_path)

def run_hyperliquid():
    """Run Hyperliquid service"""
    print("🚀 Starting Hyperliquid service on port 5001...")
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'hyperliquid-service'))
    from app import app as hyperliquid_app
    hyperliquid_app.run(host='0.0.0.0', port=5001, debug=False, use_reloader=False)

def run_twitter_proxy():
    """Run Twitter proxy"""
    print("🚀 Starting Twitter proxy on port 5002...")
    os.environ['TWITTER_PROXY_PORT'] = '5002'
    exec(open(os.path.join(os.path.dirname(__file__), 'twitter-proxy.py')).read())

if __name__ == '__main__':
    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║                                                               ║")
    print("║   🚀 MAXXIT PYTHON SERVICES                                  ║")
    print("║                                                               ║")
    print("╚═══════════════════════════════════════════════════════════════╝")
    print()
    print("Starting services:")
    print("  - Hyperliquid Service (port 5001)")
    print("  - Twitter Proxy (port 5002)")
    print()
    
    # Start Hyperliquid in background thread
    hyperliquid_thread = Thread(target=run_hyperliquid, daemon=True)
    hyperliquid_thread.start()
    
    # Run Twitter proxy in main thread
    run_twitter_proxy()

