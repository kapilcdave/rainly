"""Email retry/backoff: failed sends get rescheduled, then give up after the last attempt."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import notifications as n  # noqa: E402


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


async def _build():
    return "Subject", "<p>Hello</p>"


def test_success(monkeypatch):
    async def ok(**_):
        return "id-1"
    monkeypatch.setattr(n, "send_email", ok)
    upd = run(n.deliver("refund", 0, "a@b.co", _build))
    assert upd["refund_email_status"] == "sent" and upd["refund_email_attempts"] == 1
    assert upd["refund_email_retry_at"] is None


def test_failure_schedules_retry(monkeypatch):
    async def fail(**_):
        raise RuntimeError("send_failed")
    monkeypatch.setattr(n, "send_email", fail)
    upd = run(n.deliver("reminder", 1, "a@b.co", _build))
    assert upd["reminder_email_status"] == "failed:send_failed"
    assert upd["reminder_email_attempts"] == 2 and upd["reminder_email_retry_at"]


def test_gives_up_after_max(monkeypatch):
    async def fail(**_):
        raise RuntimeError("send_failed")
    monkeypatch.setattr(n, "send_email", fail)
    upd = run(n.deliver("confirm", n.MAX_EMAIL_ATTEMPTS - 1, "a@b.co", _build))
    assert upd["confirm_email_status"] == "gave_up"


def test_rejected_template_gives_up(monkeypatch):
    async def bad(**_):
        raise ValueError("unsafe")
    monkeypatch.setattr(n, "send_email", bad)
    upd = run(n.deliver("alert", 0, "a@b.co", _build))
    assert upd["alert_email_status"] == "gave_up"


def test_build_error_retries(monkeypatch):
    async def boom():
        raise Exception("kalshi down")
    upd = run(n.deliver("refund", 0, "a@b.co", boom))
    assert upd["refund_email_status"] == "failed:error"


def test_rate_limit_retries_in_place(monkeypatch):
    calls = []

    async def flaky(**_):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("rate_limited")
        return "id-2"
    monkeypatch.setattr(n, "send_email", flaky)
    monkeypatch.setattr(n, "RATE_LIMIT_WAITS", (0, None))
    upd = run(n.deliver("refund", 0, "a@b.co", _build))
    assert upd["refund_email_status"] == "sent" and len(calls) == 2
