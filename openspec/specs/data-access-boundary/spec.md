# data-access-boundary Specification

## Purpose
Defines how the platform reaches its persistence layer: the distinct privileged and public
access paths to Supabase, the repository interface contracts that domain services depend on,
and the boundary that keeps privileged access and persistence internals out of browser code.

## Requirements

### Requirement: Distinct access paths for public, authenticated-server, and privileged access

The platform SHALL provide three distinct Supabase access paths, and SHALL keep them separately
constructed so their privilege cannot be confused:

1. A **browser** access path, usable from client components, which carries no privileged
   credential.
2. An **authenticated server** access path, usable from Server Components, Server Actions, and
   Route Handlers, which carries only the public-safe key.
3. A **privileged server** access path, restricted to server-only modules, which carries the
   service-role credential.

The privileged credential SHALL be readable only from server-side modules. No module that is
reachable from a client component SHALL import, reference, or forward a privileged credential,
and no privileged credential SHALL be embedded in any value sent to the browser.

Background validation-response writes SHALL travel as same-origin POST requests to a Route
Handler that validates input strictly (batch id, dataset entry id, response payload only),
derives validator/attempt ownership and timestamps server-side, and persists through exactly one
versioned `submit_validation_response` RPC executed with the privileged path. The browser SHALL
never call a privileged RPC directly and SHALL never supply validator id, response id,
timestamps, or batch ownership.

The response-submit RPC SHALL follow the established versioned-function posture: explicit
`search_path`, `SECURITY DEFINER`, and EXECUTE granted to `service_role` only with PUBLIC, anon,
and authenticated revoked. Client-called Server Actions remain for one-shot workflows and SHALL
NOT serve as the transport for individual background response writes.

#### Scenario: Privileged credential is unavailable to browser code

- **WHEN** the module graph reachable from a client component is inspected
- **THEN** no module on that path reads the service-role credential, and the browser access
  path is constructed without it

#### Scenario: Privileged access is server-only

- **WHEN** a module that reads the service-role credential is imported
- **THEN** importing that module from a client component fails, so the boundary is enforced by
  the runtime rather than by convention alone

#### Scenario: Browser access path uses the public-safe key

- **WHEN** the browser access path is constructed
- **THEN** it is configured with the public-safe key only

#### Scenario: A background save is a strict POST

- **WHEN** a malformed response POST arrives
- **THEN** it is refused with a typed reason before any database work

#### Scenario: The submit RPC is service-role only

- **WHEN** the RPC grants are inspected on the hosted project
- **THEN** only `service_role` may execute it and PUBLIC/anon/authenticated are revoked

### Requirement: Repository interfaces own persistence concerns

Persistence SHALL be reached only through explicitly declared repository interfaces, which are
injected into domain services. Repository implementations SHALL translate between persistence
records and domain types, SHALL not leak persistence-specific response shapes to callers, and
SHALL surface failures as explicit typed errors rather than by returning empty results that
could be mistaken for "no data".

#### Scenario: Domain service depends on the interface, not the implementation

- **WHEN** a domain service is unit-tested
- **THEN** it can be exercised against an in-memory implementation of the repository interface
  with no database present

#### Scenario: Failures are explicit

- **WHEN** a persistence call fails
- **THEN** the repository raises a typed error naming the operation, and the caller does not
  observe an empty result that would be indistinguishable from legitimate absence of data

#### Scenario: Unknown fields are not silently dropped

- **WHEN** a persistence record contains a field the current domain type does not model
- **THEN** the value is preserved and surfaced for analysis rather than discarded

### Requirement: Server-authoritative writes

Write operations SHALL be executed on the server. A client SHALL send intent — such as which
entry a validator judged and how — and SHALL NOT be able to dictate authoritative server state
such as a coverage count, a batch position, a completion status, or a proficiency eligibility
decision.

#### Scenario: Client cannot dictate authoritative state

- **WHEN** a client submits a write request, the server SHALL derive authoritative state itself
  from persisted state and the submitted intent
- **THEN** any authoritative value supplied by the client is ignored rather than trusted

#### Scenario: Untrusted input is rejected before persistence

- **WHEN** a write request fails shared schema validation
- **THEN** no persistence operation is attempted and the request is rejected

### Requirement: No client-side access to privileged persistence internals

Client components SHALL call server/domain service boundaries and SHALL NOT import Supabase
client constructors, raw SQL, or repository implementations. This SHALL be a statically
enforced rule rather than a review convention.

#### Scenario: Client component importing Supabase fails the build

- **WHEN** a file marked as a client module imports the Supabase client constructors or a
  repository implementation
- **THEN** the lint/type-check verification step fails and the violation is reported with the
  offending file

#### Scenario: Client component calling a service boundary

- **WHEN** a client component needs to start a validation, complete a screening, or request a
  batch
- **THEN** it calls the server-side service boundary and receives only the data needed to render
