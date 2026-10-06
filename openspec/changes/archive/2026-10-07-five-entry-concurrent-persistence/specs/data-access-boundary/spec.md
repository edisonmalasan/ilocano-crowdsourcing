# Spec Delta

## MODIFIED Requirements

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
