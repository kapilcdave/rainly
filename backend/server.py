import asyncio

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from core import client, http, logger, bg_tasks  # loads .env first
from routers import guarantees, markets, merchants
from seed import migrate, seed
from services.notifications import recover_interrupted_emails
from services.settlement import settlement_loop

app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api_router = APIRouter(prefix="/api")
for r in (markets.router, merchants.router, guarantees.router):
    api_router.include_router(r)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    try:
        await seed()
    except Exception as e:
        logger.exception("Seed failed: %s", e)
    await migrate()
    await recover_interrupted_emails()
    t = asyncio.create_task(settlement_loop())
    bg_tasks.add(t)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    await http.aclose()
