"""
Twitter API Proxy using virtuals_tweepy SDK
Uses GAME Twitter SDK instead of direct REST API calls
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import logging
from dotenv import load_dotenv

# Import virtuals_tweepy
try:
    from virtuals_tweepy import Client
    from virtuals_tweepy.errors import TweepyException, NotFound, Unauthorized
except ImportError:
    print("ERROR: virtuals_tweepy not installed. Install with: pip install virtuals_tweepy")
    exit(1)

# Load .env from parent directory
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(env_path)

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# GAME API Configuration
GAME_API_KEY = os.getenv('GAME_API_KEY', '')

# Initialize virtuals_tweepy client
twitter_client = None
if GAME_API_KEY:
    try:
        twitter_client = Client(game_twitter_access_token=GAME_API_KEY)
        logger.info(f"✅ virtuals_tweepy Client initialized with key: {GAME_API_KEY[:10]}...")
    except Exception as e:
        logger.error(f"❌ Failed to initialize virtuals_tweepy Client: {e}")
else:
    logger.warning("⚠️  GAME_API_KEY not set!")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    logger.info("Health check requested")
    return jsonify({
        "status": "healthy",
        "service": "twitter-proxy",
        "game_api_configured": bool(GAME_API_KEY),
        "client_initialized": twitter_client is not None
    })

@app.route('/tweets/<username>', methods=['GET'])
def get_tweets(username):
    """Fetch tweets for a given username using virtuals_tweepy SDK"""
    max_results = request.args.get('max_results', default=10, type=int)
    since_id = request.args.get('since_id', type=str)

    logger.info(f"Fetching tweets for @{username} (max: {max_results})")

    if not twitter_client:
        logger.error("Twitter client not initialized - GAME_API_KEY missing")
        return jsonify({
            "error": "Twitter client not initialized",
            "details": "GAME_API_KEY is not configured"
        }), 500

    try:
        # Get user ID first
        clean_username = username.lstrip('@')
        logger.info(f"Looking up user: {clean_username}")
        
        user_response = twitter_client.get_user(username=clean_username)
        if not user_response.data:
            logger.warning(f"User not found: {clean_username}")
            return jsonify({
                "username": username,
                "count": 0,
                "data": [],
                "error": "User not found"
            }), 404
        
        user_id = str(user_response.data.id)
        logger.info(f"Found user ID: {user_id}")

        # Fetch tweets
        request_params = {
            'max_results': min(max_results, 100),
            'tweet_fields': ['created_at', 'author_id', 'text']
        }
        if since_id:
            request_params['since_id'] = since_id

        logger.info(f"Fetching tweets with params: {request_params}")
        tweets_response = twitter_client.get_users_tweets(user_id, **request_params)
        
        if not tweets_response.data:
            logger.info(f"No tweets found for user {clean_username}")
            return jsonify({
                "username": username,
                "count": 0,
                "data": []
            })

        # Format tweets
        tweets = []
        for tweet in tweets_response.data:
            tweet_data = {
                'id': str(tweet.id),
                'text': tweet.text,
                'created_at': str(tweet.created_at) if hasattr(tweet, 'created_at') else None,
                'author_id': str(tweet.author_id) if hasattr(tweet, 'author_id') else user_id
            }
            tweets.append(tweet_data)

        logger.info(f"✅ Successfully fetched {len(tweets)} tweets from virtuals_tweepy SDK")
        return jsonify({
            "username": username,
            "count": len(tweets),
            "data": tweets
        })

    except NotFound:
        logger.error(f"User not found: {username}")
        return jsonify({
            "error": "User not found",
            "username": username
        }), 404
    except Unauthorized:
        logger.error("Unauthorized - Invalid or expired GAME_API_KEY")
        return jsonify({
            "error": "Unauthorized",
            "details": "Invalid or expired GAME_API_KEY"
        }), 401
    except TweepyException as e:
        logger.error(f"TweepyException: {e}")
        return jsonify({
            "error": "Twitter API error",
            "details": str(e)
        }), 500
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({
            "error": "An unexpected error occurred",
            "details": str(e)
        }), 500

@app.route('/test', methods=['GET'])
def test_endpoint():
    """Test endpoint to verify proxy functionality"""
    return jsonify({
        'message': 'Twitter proxy test endpoint (using virtuals_tweepy SDK)',
        'game_api_key_configured': bool(GAME_API_KEY),
        'client_initialized': twitter_client is not None,
        'endpoints': {
            'health': '/health',
            'tweets': '/tweets/<username>?max_results=10&since_id=123'
        }
    })

if __name__ == '__main__':
    # Get port from environment, default to 5002
    port_env = os.getenv('TWITTER_PROXY_PORT') or os.getenv('PORT') or '5002'
    port = int(port_env)
    
    if not GAME_API_KEY:
        logger.warning("⚠️  GAME_API_KEY not set! Proxy will not work properly.")
    else:
        logger.info(f"✅ GAME_API_KEY configured: {GAME_API_KEY[:10]}...")
    
    if not twitter_client:
        logger.error("❌ Twitter client not initialized!")
    else:
        logger.info("✅ virtuals_tweepy Client ready!")
    
    logger.info(f"🚀 Starting Twitter Proxy (virtuals_tweepy SDK) on http://0.0.0.0:{port}")
    logger.info(f"   Endpoints:")
    logger.info(f"   - GET /health")
    logger.info(f"   - GET /tweets/<username>?max_results=10")
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)
