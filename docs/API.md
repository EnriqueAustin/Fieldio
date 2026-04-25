# API Reference

Base URL: `http://localhost:3001` or `/api` (via Next.js rewrite)

## Authentication

### Login
`POST /auth/login`

**Request Body:**
```json
{
  "email": "admin@fieldio.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "user": { ... },
    "accessToken": "ey..."
  }
}
```

### Me (Current User)
`GET /auth/me`
*Headers: `Authorization: Bearer <token>`*

---

## Jobs

### List Jobs
`GET /jobs`
*Query Params:* `page`, `limit`, `status`

### Get Job Details
`GET /jobs/:id`

### Create Job
`POST /jobs`

**Request Body:**
```json
{
  "customerId": "uuid",
  "title": "Leaking Faucet",
  "description": "Kitchen sink dripping.",
  "scheduledDate": "2023-12-25T14:00:00Z",
  "estimatedDuration": 60
}
```

### Update Status
`PATCH /jobs/:id/status`

**Request Body:**
```json
{
  "status": "EN_ROUTE" // REQUESTED, ASSIGNED, EN_ROUTE, ON_SITE, IN_PROGRESS, COMPLETED, CANCELLED
}
```

---

## Customers

### List Customers
`GET /customers`
*Query Params:* `search`, `page`, `limit`

### Create Customer
`POST /customers`

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "555-123-4567"
}
```

---

## Error Handling
All errors follow this format:
```json
{
  "status": "error",
  "message": "Description of the error"
}
```
