#!/usr/bin/env python3
"""
Test script to simulate BelowMinLevPos error and verify Telegram notifications.

This script calls the /open-position endpoint with a very small collateral amount
to trigger the BelowMinLevPos() error, which should send a Telegram notification
to Lazy Trader users.

Usage:
  python test-insufficient-funds.py [user_wallet_address]

Requirements:
  - ostium-service.py must be running on http://localhost:5002
  - The user must have:
    1. ostium_agent_address in user_agent_addresses table
    2. lazy_trader=true in telegram_alpha_users table
    3. Active telegram connection in user_telegram_notifications table
"""

import requests
import sys
import json

# Configuration
OSTIUM_SERVICE_URL = "http://localhost:5002"

def test_insufficient_funds(user_wallet: str):
    """
    Call open-position with a tiny collateral to trigger BelowMinLevPos error.
    """
    print("=" * 60)
    print("🧪 Testing BelowMinLevPos Error Notification")
    print("=" * 60)
    
    print(f"\n📋 User Wallet: {user_wallet}")
    
    agent_address = input("Enter your Ostium agent address (or press Enter to skip lookup): ").strip()
    
    if not agent_address:
        print("\n❌ Agent address required to test. Exiting.")
        return
    
    print(f"📋 Agent Address: {agent_address}")
    
    payload = {
        "agentAddress": agent_address,
        "userAddress": user_wallet,
        "market": "ETH",
        "side": "long",
        "collateral": 1,
        "leverage": 1,
        "useDelegation": True
    }
    
    print(f"\n🚀 Sending request to {OSTIUM_SERVICE_URL}/open-position")
    print(f"📦 Payload:")
    print(json.dumps(payload, indent=2))
    
    try:
        response = requests.post(
            f"{OSTIUM_SERVICE_URL}/open-position",
            json=payload,
            timeout=60
        )
        
        print(f"\n📥 Response Status: {response.status_code}")
        
        try:
            result = response.json()
            print(f"📄 Response Body:")
            print(json.dumps(result, indent=2))
            
            if not result.get("success"):
                error = result.get("error", "")
                if "eca695e1" in error.lower() or "belowminlevpos" in error.lower():
                    print("\n✅ BelowMinLevPos error detected!")
                    print("📱 Check your Telegram for the notification!")
                else:
                    print(f"\n⚠️ Different error occurred: {error}")
        except:
            print(f"📄 Response Text: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print(f"\n❌ Connection error: Is ostium-service.py running on {OSTIUM_SERVICE_URL}?")
    except Exception as e:
        print(f"\n❌ Error: {e}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python test-insufficient-funds.py <user_wallet_address>")
        print("\nExample:")
        print("  python test-insufficient-funds.py 0x1234...abcd")
        print("\nYou can find your wallet address in the Maxxit dashboard.")
        
        user_wallet = input("\nOr enter your wallet address now: ").strip()
        if not user_wallet:
            sys.exit(1)
    else:
        user_wallet = sys.argv[1]
    
    test_insufficient_funds(user_wallet)

if __name__ == "__main__":
    main()
