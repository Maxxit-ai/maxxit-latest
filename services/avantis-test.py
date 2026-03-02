import asyncio
from avantis_trader_sdk import TraderClient

async def main():
    client = TraderClient("https://mainnet.base.org")
    
    pairs_info = await client.pairs_cache.get_pairs_info()
    for index, pair in pairs_info.items():
        print(f"{index}: {pair.from_}/{pair.to}")
        # Print all attributes to find min position size fields
        print(f"  Attributes: {vars(pair)}")

asyncio.run(main())