# Browser Extension API Contract

The browser extension must authenticate with the same JWT used by the web app. Send it as:

```http
Authorization: Bearer <jwt>
```

## Import Job Target

```http
POST /job-targets/import
Content-Type: application/json
```

```json
{
  "roleTitle": "Backend Engineer",
  "companyName": "Acme",
  "jobDescription": "Full job description text...",
  "sourceUrl": "https://example.com/jobs/123",
  "sourcePlatform": "linkedin",
  "location": "Remote",
  "metadata": {
    "externalJobId": "123"
  }
}
```

Validation:

- `jobDescription` must be readable text, at least 80 characters, and no more than 60,000 characters.
- `sourceUrl` must be an HTTP or HTTPS URL when provided.
- `metadata` must not contain secrets, cookies, access tokens, or raw browser storage.
- Duplicate submissions are detected by normalized content hash and source URL hash per user.

Response:

```json
{
  "success": true,
  "data": {
    "jobTargetId": "uuid",
    "duplicate": false,
    "redirectUrl": "/generate?jobTargetId=uuid"
  }
}
```

The extension should redirect the user to the returned `redirectUrl`. The web app loads the job target by ID from the backend and does not trust large job-description query strings.

## Read Job Target

```http
GET /job-targets/:id
```

Returns only job targets owned by the authenticated user.

## List Job Targets

```http
GET /job-targets?limit=25&platform=linkedin
```

Useful for extension status UIs or web prefill flows.

