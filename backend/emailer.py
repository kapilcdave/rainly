"""Refund alert emails via Emergent managed email (Resend)."""
import os
import re
import ipaddress
import logging
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

logger = logging.getLogger("rainly.email")

# Emergent managed email proxy — constant on purpose (survives deployment).
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str:
    """Returns the provider id. Raises RuntimeError with a short code on failure."""
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                     headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id") or ""
    except httpx.HTTPStatusError as e:
        try:
            body = e.response.json()
        except ValueError:
            body = {}
        code = body.get("code", "")
        if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
            logger.warning("Email paused: %s (%s): %s", code, e.response.status_code, body.get("message", ""))
            raise RuntimeError(code)
        logger.error("Email send failed: %s %s", e.response.status_code, e.response.text[:300])
        raise RuntimeError("send_failed")
    except RuntimeError:
        raise
    except Exception as e:
        logger.error("Email send error: %s", e)
        raise RuntimeError("send_error")


def refund_email(*, customer_name: str, merchant_name: str, city: str, date_label: str,
                 amount: str, rules: str, ticker: str) -> tuple[str, str]:
    """Fixed server-side template. All interpolations are escaped."""
    subject = f"It rained — your {merchant_name} booking is refunded"
    e = escape
    html = (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6">'
        '<tr><td align="center" style="padding:24px">'
        '<table role="presentation" width="100%" style="max-width:480px;background:#FFFFFF;border-radius:16px">'
        '<tr><td style="background:#2563EB;border-radius:16px 16px 0 0;padding:20px 24px;'
        'font-family:Arial,sans-serif;color:#FFFFFF;font-size:20px;font-weight:bold">Rainly</td></tr>'
        '<tr><td style="padding:24px;font-family:Arial,sans-serif;color:#111827">'
        f'<p style="font-size:16px;margin:0 0 12px">Hi {e(customer_name)},</p>'
        f'<p style="font-size:16px;line-height:24px;margin:0 0 16px">Rain was recorded in {e(city)} on '
        f'{e(date_label)}, so your rain refund kicked in. {e(merchant_name)} is refunding your booking.</p>'
        '<table role="presentation" width="100%" style="background:#EFF6FF;border-radius:12px">'
        '<tr><td style="padding:16px;font-family:Arial,sans-serif">'
        '<div style="font-size:12px;color:#1E40AF;text-transform:uppercase;letter-spacing:1px">Refund amount</div>'
        f'<div style="font-size:32px;font-weight:bold;color:#1E40AF">{e(amount)}</div>'
        '</td></tr></table>'
        '<p style="font-size:13px;line-height:20px;color:#4B5563;margin:16px 0 0">'
        '<strong>Official trigger:</strong> ' + e(rules) + '</p>'
        f'<p style="font-size:12px;color:#6B7280;margin:8px 0 0">Settled on Kalshi market {e(ticker)}.</p>'
        f'<p style="font-size:14px;line-height:22px;margin:16px 0 0">No action needed — {e(merchant_name)} '
        'will return the payment to your original payment method.</p>'
        '</td></tr>'
        '<tr><td style="padding:16px 24px;border-top:1px solid #E5E7EB;font-family:Arial,sans-serif;'
        'font-size:11px;line-height:16px;color:#6B7280">Sent by Rainly on behalf of '
        f'{e(merchant_name)}. Settled on official Weather Company / NWS station data via Kalshi, '
        'a CFTC-regulated exchange. We never ask for your password or card details by email.</td></tr>'
        '</table></td></tr></table>'
    )
    return subject, html
