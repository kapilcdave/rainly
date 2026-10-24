import json
import os
import re
import uuid

from emergentintegrations.llm.chat import LlmChat, UserMessage

from kalshi import CITY_SERIES

MODEL = ("anthropic", "claude-sonnet-5-5")
CITIES = list(CITY_SERIES.keys())


def _chat(system: str) -> LlmChat:
    return LlmChat(
        api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"raincheck-{uuid.uuid4().hex}", system_message=system
    ).with_model(*MODEL)


def _json(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    return json.loads(m.group(0) if m else text)


PROFILE_SYS = f"""You are RainCheck's onboarding assistant for weather-sensitive small businesses.
From the owner's description, draft a business profile. Output ONLY JSON:
{{"name": str, "business_type": str, "city": str (the city the owner named),
"market_city": one of {CITIES} (the same city if supported, otherwise the nearest supported one),
"city_note": str (empty if supported, else one sentence saying we use the nearest supported city),
"daily_revenue": number (typical good-day revenue in USD, estimate if not given),
"bad_day_loss": number (USD lost on a bad-weather day, estimate if not given),
"weather_sensitivity": str (one plain-English sentence)}}"""

REPORT_SYS = """You are RainCheck's risk advisor. You help small business owners with no trading background
protect revenue by buying Kalshi weather contracts. A contract costs its price (0.01-0.99 USD) and pays $1.00 if
its outcome happens. Speak plainly, never use jargon without explaining it. You do not give financial advice.
Output ONLY JSON:
{"summary": str (2 sentences),
 "risks": [{"type": "rain"|"heat"|"cold"|"snow", "title": str, "explanation": str (plain English, 1-2 sentences),
            "severity": "high"|"medium"|"low"}],
 "hedges": [{"ticker": str (MUST be from the provided list), "side": "yes"|"no", "risk_type": str,
             "headline": str (e.g. 'Get paid if Chicago gets over 4 inches of rain in October'),
             "rationale": str (why this protects the business, 1-2 sentences),
             "loss_if_event": number (USD the business would lose if this weather outcome happens),
             "coverage": number (0.1-1.0 recommended share of that loss to cover)}]}
Give 1-3 hedges. Pick the side that PAYS when the bad weather happens. Prefer contracts that cost under $0.60."""


async def draft_profile(description: str) -> dict:
    out = await _chat(PROFILE_SYS).send_message(UserMessage(text=description))
    p = _json(out)
    if p.get("market_city") not in CITIES:
        p["market_city"] = "New York"
    return p


async def risk_report(business: dict, markets: list) -> dict:
    lines = [
        f"{m['ticker']} | {m['kind_label']} | {m['title']} | YES outcome: {m['outcome']} | "
        f"YES ${m['yes_ask']} NO ${m['no_ask']} | closes {m['close_time']}"
        for m in markets
        if m["yes_ask"] and m["no_ask"]
    ][:120]
    prompt = (
        f"Business: {json.dumps({k: business.get(k) for k in ['name','business_type','city','market_city','daily_revenue','bad_day_loss','description','weather_sensitivity']})}\n\n"
        f"Open Kalshi weather contracts for {business.get('market_city')}:\n" + "\n".join(lines)
    )
    return _json(await _chat(REPORT_SYS).send_message(UserMessage(text=prompt)))
