# Auth testing (Emergent Google Auth)
1. Seed user + session in mongosh (db test_database): users {user_id, email, name}, user_sessions {user_id, session_token, expires_at}.
2. API: `curl $API/api/auth/me -H "Authorization: Bearer <token>"`.
3. Browser: add cookie session_token=<token> (domain = app host, path /, httpOnly, secure, sameSite None) then open /dashboard.
Seeded token: see /app/memory/test_credentials.md.
