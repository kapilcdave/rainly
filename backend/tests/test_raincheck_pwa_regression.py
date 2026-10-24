# Iteration 2: PWA static assets + regression of iteration-1 fixes (404 ticker, Bearer logout)
import os
import uuid
import subprocess
from datetime import datetime, timedelta, timezone

import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0].rstrip("/")
API = f"{BASE}/api"
T1 = "test_session_raincheck"
h = lambda t: {"Authorization": f"Bearer {t}"}


# PWA: manifest / sw / icons
class TestPWA:
    def test_manifest(self):
        r = requests.get(f"{BASE}/manifest.json", timeout=30)
        assert r.status_code == 200
        m = r.json()
        assert "RainCheck" in m["name"] and m["short_name"] == "RainCheck"
        assert m["display"] == "standalone"
        srcs = [i["src"] for i in m["icons"]]
        assert "/icon-192.png" in srcs and "/icon-512.png" in srcs

    def test_icons(self):
        for p in ("/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"):
            r = requests.get(f"{BASE}{p}", timeout=30)
            assert r.status_code == 200 and r.headers["content-type"].startswith("image/png"), p

    def test_sw(self):
        r = requests.get(f"{BASE}/sw.js", timeout=30)
        assert r.status_code == 200 and "javascript" in r.headers["content-type"]
        assert "addEventListener" in r.text

    def test_index_meta(self):
        t = requests.get(f"{BASE}/", timeout=30).text
        assert 'rel="apple-touch-icon"' in t
        assert 'apple-mobile-web-app-capable' in t
        assert 'rel="manifest"' in t


# Regression: unknown ticker -> 404
class TestRegression:
    def test_position_unknown_ticker_404(self):
        r = requests.post(f"{API}/positions", headers=h(T1), timeout=30,
                          json={"ticker": "TEST-NOPE-XYZ", "side": "yes", "contracts": 5, "mode": "paper", "loss_if_event": 100})
        assert r.status_code == 404, r.text

    def test_bearer_logout_deletes_session(self):
        tok = f"TEST_logout_{uuid.uuid4().hex[:8]}"
        exp = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        subprocess.run(["mongosh", "test_database", "--quiet", "--eval",
                        f'db.user_sessions.insertOne({{user_id:"test-user-1",session_token:"{tok}",expires_at:new Date("{exp}"),created_at:new Date()}})'],
                       check=True, capture_output=True)
        assert requests.get(f"{API}/auth/me", headers=h(tok), timeout=30).status_code == 200
        r = requests.post(f"{API}/auth/logout", headers=h(tok), timeout=30)
        assert r.status_code == 200 and r.json()["ok"] is True
        assert requests.get(f"{API}/auth/me", headers=h(tok), timeout=30).status_code == 401
        # main token still valid
        assert requests.get(f"{API}/auth/me", headers=h(T1), timeout=30).status_code == 200
