# content-security-policy Specification

## Purpose

Defines the enforced Content Security Policy every served response
carries: the closed-by-default policy, its exact directives and source
lists, and its composition with the five existing hardening headers and
the researcher-area set. The policy closes off injected scripts, object
embeds, framed ancestors, and off-origin connections, forms, and base
URLs at the browser's own enforcement layer — while preserving the
legitimate Next.js runtime, same-origin Server Actions, self-hosted
fonts, and CSS assets the validation flows need.

## Requirements

### Requirement: Every served response carries an enforced Content Security Policy

Every HTTP response the platform serves, on every route, SHALL carry an
enforced `Content-Security-Policy` header whose policy includes, at
minimum, `default-src`, `base-uri`, `object-src`, `frame-ancestors`,
`form-action`, and a restricted `connect-src`, while preserving the five
existing hardening headers at their declared values.

#### Scenario: Public response carries the enforced policy

- **WHEN** the platform serves any public route (landing, screening,
  validation, ready)
- **THEN** the response carries the five existing headers unchanged AND
  an enforced `Content-Security-Policy` containing `default-src 'self'`,
  `base-uri 'self'`, `object-src 'none'`, `frame-ancestors 'none'`,
  `form-action 'self'`, and `connect-src 'self'`, with no `unsafe-eval`
  and no wildcard source

#### Scenario: Policy supports the legitimate app without external origins

- **WHEN** a validator completes the screening, validation, and export
  flows with the policy enforced
- **THEN** Next.js runtime scripts/styles, same-origin Server Actions,
  the same-origin validation-responses POST, self-hosted fonts, and the
  CSS `data:` grain all load with no CSP violation, and no external
  script, style, image, font, or connection origin is permitted

#### Scenario: Researcher response carries both the policy and the researcher header set

- **WHEN** the platform serves any route under `/researcher/`
- **THEN** the response carries the enforced policy AND the
  researcher-area `Cache-Control` plus `X-Robots-Tag` headers, with
  neither set dropping the other
