# Zerodha Kite Backend

Small Node.js backend for Zerodha Kite that handles:

- Kite login URL generation and callback token exchange
- Local access token persistence
- Portfolio views for profile, holdings, positions, and margins
- Order placement, modification, cancellation, and history lookups
- Margin estimation for single-order and basket-order payloads

## Setup

1. Create a Kite Connect app and set its redirect URL to match your backend callback.
2. Copy `.env.example` to `.env`.
3. Fill in:

```bash
PORT=3000
KITE_API_KEY=your_kite_api_key
KITE_API_SECRET=your_kite_api_secret
KITE_REDIRECT_URL=http://localhost:3000/auth/callback
SESSION_FILE=.data/session.json
```

4. Install dependencies:

```bash
npm install
```

5. Start the server:

```bash
npm run dev
```

## Auth flow

1. Open `GET /auth/login` and copy the returned `login_url`.
2. Login with Zerodha and complete the redirect.
3. Zerodha will redirect to `KITE_REDIRECT_URL` with `request_token`.
4. This backend exchanges that token on `GET /auth/callback` and stores the session in `SESSION_FILE`.

You can also exchange manually with:

```bash
curl -X POST http://localhost:3000/auth/session \
  -H "Content-Type: application/json" \
  -d '{"request_token":"your_request_token"}'
```

## Endpoints

- `GET /health`
- `GET /auth/login`
- `GET /auth/session`
- `POST /auth/session`
- `GET /auth/callback`
- `DELETE /auth/session`
- `GET /portfolio`
- `GET /portfolio/profile`
- `GET /portfolio/holdings`
- `GET /portfolio/positions`
- `POST /portfolio/positions/convert`
- `GET /instruments`
- `GET /margins?segment=equity|commodity`
- `POST /margins/orders`
- `POST /margins/basket`
- `GET /orders`
- `GET /orders/:orderId/history`
- `GET /orders/:orderId/trades`
- `POST /orders`
- `PUT /orders/:orderId`
- `DELETE /orders/:orderId`

## Sample order payload

```json
{
  "variety": "regular",
  "exchange": "NSE",
  "tradingsymbol": "INFY",
  "transaction_type": "BUY",
  "quantity": 1,
  "product": "CNC",
  "order_type": "MARKET"
}
```

## Notes

- Zerodha access tokens expire at the next-day reset unless invalidated earlier.
- This project stores one local user session. If you need multiple users, replace the file store with a database-backed session model.
