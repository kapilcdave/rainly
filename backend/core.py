"""Shared config, database and HTTP client. Import this before anything that reads env vars."""
import os
import logging
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

KALSHI_PUBLIC = os.environ['KALSHI_PUBLIC_BASE'].rstrip('/')
KALSHI_DEMO = os.environ['KALSHI_DEMO_BASE'].rstrip('/')
MOCK_TRADING = os.environ.get('MOCK_TRADING', 'true').lower() == 'true'
KALSHI_ACCESS_KEY = os.environ.get('KALSHI_ACCESS_KEY', '')
KALSHI_PRIVATE_KEY_PEM = os.environ.get('KALSHI_PRIVATE_KEY_PEM', '')

MAX_P = 0.60
DEPTH_SLIPPAGE = 0.03
TICKER_CITIES = ["Chicago", "New York City", "Miami", "Seattle", "Austin"]
BUSINESS_TYPES = ["patio_restaurant", "food_truck", "outdoor_event", "boat_tour", "car_wash", "mini_golf"]
ET = ZoneInfo("America/New_York")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("rainly")

http = httpx.AsyncClient(timeout=15)
bg_tasks: set = set()  # keep references so background tasks aren't garbage-collected


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
