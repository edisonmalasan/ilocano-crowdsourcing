# Spec Delta

## ADDED Requirements

### Requirement: Every served response carries the browser-hardening headers

Every HTTP response the platform serves, on every route, SHALL carry the
five browser-hardening headers at their declared values:
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Strict-Transport-Security: max-age=63072000; includeSubDomains`, and
`Permissions-Policy: camera=(), microphone=(), geolocation=()`.

#### Scenario: Public validation response carries all five headers

- **WHEN** the platform serves any public route (landing, screening,
  validation, ready)
- **THEN** the response carries each of the five headers at its declared
  value, and no route relies on framing, MIME-sniffing, or ambient
  camera/microphone/geolocation access

#### Scenario: Researcher response carries both the global and the researcher header sets

- **WHEN** the platform serves any route under `/researcher/`
- **THEN** the response carries the five global headers AND the
  researcher-area `Cache-Control` plus `X-Robots-Tag` headers, with neither
  set dropping the other
