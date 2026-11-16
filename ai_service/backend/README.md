## OAuth2 Service Authentication

The AI Service protects API endpoints and static video/transcript routes using OAuth2 Bearer tokens.

### Configuration

Configure these environment variables:

- `OAUTH_ISSUER`: Expected JWT issuer.
- `OAUTH_AUDIENCE`: Expected token audience.
- `OAUTH_JWKS_URL`: Provider JWKS endpoint.
- `OAUTH_REQUIRED_SCOPE`: Required permission (default: `ai:access`).
- `CORS_ALLOWED_ORIGINS`: Comma-separated allowed frontend origins.

### Token requirements

- JWT signature must use RS256.
- Issuer and audience must match configuration.
- Token must contain valid expiry, issuer and audience claims.
- Token must include the required scope.

### Error responses

- `401`: Missing or invalid token.
- `403`: Insufficient permissions.
- `503`: OAuth authentication is not configured or provider is unavailable.

### Authorization provider

Configure the actual OAuth2 authorization provider before production deployment. Do not use placeholder credentials in production.
