# researcher-admin-access Specification

## Purpose

Defines how a member of the research team is recognized as such, how that recognition is
established on the server and carried as an opaque session, and how the admin area refuses a
request that has not been verified.

## Requirements

### Requirement: Researcher access is configured as an operator credential, never as a collected identity

The platform SHALL recognize a member of the research team from an operator credential supplied by
the deployment environment. It SHALL NOT collect, store, require, or infer a name, email address,
phone number, student identifier, address, or any other datum that identifies a person in order to
establish that access, and SHALL NOT create a schema column, table, or default whose purpose is to
hold one. Access SHALL be a property of the credential presented, not of a device, a browser, or a
person.

#### Scenario: Establishing access stores nothing that identifies a researcher

- **WHEN** a researcher is signed in
- **THEN** the resulting session and every persisted artifact carry no name, email address, phone
  number, student identifier, or address for that researcher

#### Scenario: Access is not bound to a device or a browser

- **WHEN** the same operator credential is presented from a different browser on a different
  machine
- **THEN** access is established, because nothing binds the credential to the device that first used
  it

#### Scenario: No identifying column is added to accommodate the admin area

- **WHEN** the schema is inspected after this capability exists
- **THEN** no table has gained a column whose declared purpose is to identify a researcher

### Requirement: Researcher access is decided on the server

The platform SHALL decide whether a request is authorized on the server. The client SHALL NOT be
able to assert, influence, shorten, or skip that decision, and no value supplied by the client SHALL
count as evidence of researcher status unless the server itself issued it. Comparison of a
presented credential against the configured credentials SHALL NOT disclose, through its timing or
through its result, which configured credentials exist or how nearly a presented value matched.

#### Scenario: A client-asserted claim of researcher status is ignored

- **WHEN** a request carries a header, cookie, field, or body value asserting researcher status that
  the server did not issue
- **THEN** the request is refused, and the value has no effect on the outcome

#### Scenario: A refusal does not disclose which credentials exist

- **WHEN** a presented credential matches no configured operator credential
- **THEN** the refusal is the same refusal produced by an empty submission, and does not report how
  many operator credentials are configured

#### Scenario: A near miss is not a match

- **WHEN** a presented credential is a prefix of a configured credential, a configured credential is
  a prefix of the presented value, or the two differ only in letter case or trailing whitespace
- **THEN** access is refused, because credential comparison is exact

### Requirement: An established session is opaque and integrity-protected

The platform SHALL issue a session that the browser cannot read or forge: its integrity SHALL be
protected with a secret the browser does not possess, it SHALL be marked so that page scripts cannot
read it, it SHALL be restricted from being sent on cross-site requests, and it SHALL NOT contain the
operator credential that established it. The secret that protects session integrity SHALL be a
separate value from every operator credential.

#### Scenario: A modified session is refused

- **WHEN** any part of an issued session is altered and the altered session is presented
- **THEN** the request is refused

#### Scenario: A session presented without its protecting secret cannot be forged

- **WHEN** a session whose signature is missing, truncated, or produced with a different secret is
  presented
- **THEN** the request is refused

#### Scenario: The operator credential never reaches the browser

- **WHEN** a session is issued
- **THEN** the response and the session contents contain no operator credential, and the credential
  that established the session is not recoverable from the session

#### Scenario: The session-protection secret is not an operator credential

- **WHEN** the deployment environment is inspected
- **THEN** the value protecting session integrity is distinct from every configured operator
  credential

### Requirement: Admin routes refuse an unverified request with a distinguishable refusal

Every admin route SHALL refuse to render or serve any research content unless the request carries a
session that verifies. The refusal SHALL be distinguishable from a successful request that found no
data, SHALL NOT disclose whether the requested dataset entry, validator, or figure exists, and SHALL
NOT be stored or served from a shared cache in a way that could deliver one researcher's content to
another. Admin routes SHALL NOT be indexed by a search engine.

#### Scenario: A request with no session is refused

- **WHEN** an admin route is requested without a session
- **THEN** no research content is served, and the response is a refusal

#### Scenario: An invalid, tampered, or expired session is refused

- **WHEN** an admin route is requested with a session that does not verify
- **THEN** no research content is served, and the response is the same refusal a request with no
  session receives

#### Scenario: A refusal does not disclose that the requested record exists

- **WHEN** an admin route for a dataset entry that does not exist is requested without a session
- **THEN** the response is indistinguishable from the response for a dataset entry that does exist

#### Scenario: A refusal is not a shared-cache entry

- **WHEN** an admin route is refused
- **THEN** the response is not marked as publicly cacheable, so a shared cache cannot replay one
  researcher's refusal or content to another

#### Scenario: Admin routes are not indexed

- **WHEN** an admin route is served to a crawler
- **THEN** the response instructs that it not be indexed

### Requirement: Missing or blank operator configuration refuses all access and leaves the public experience untouched

When the configured operator credentials or the session-protection secret are absent or blank, every
admin request SHALL be refused. Such a misconfiguration SHALL NOT grant access under any input, and
SHALL NOT degrade or prevent the public validator experience. The resulting operator error SHALL name
the variables that are missing or invalid and SHALL NOT include any value of any variable.

#### Scenario: Absent operator configuration refuses every admin request

- **WHEN** an admin route is requested in an environment with no operator credentials configured
- **THEN** no research content is served

#### Scenario: A blank value counts as absent

- **WHEN** the operator credential set or the session-protection secret is present but empty or
  only whitespace
- **THEN** every admin request is refused, exactly as if the variable were absent

#### Scenario: Misconfiguration does not affect the public validator experience

- **WHEN** an environment has no operator credentials configured
- **THEN** the public validation routes continue to serve, and their behavior is unchanged

#### Scenario: The operator error names variables and never values

- **WHEN** the admin configuration is invalid
- **THEN** the error identifies which variables are missing or invalid and contains no value of any
  variable, so it is safe to log

### Requirement: Sign-out ends the session, and sessions are time-bounded

Sign-out SHALL clear the session and SHALL NOT issue a replacement. Every issued session SHALL carry
an expiry and SHALL NOT be extended without an explicit, successful re-authentication. The maximum
lifetime of a session SHALL be bounded by a configured value. Because a session is verified from its
own contents, a session captured before sign-out SHALL remain usable until it expires, and the
platform SHALL state that residual window rather than imply that sign-out revokes it.

#### Scenario: Signing out clears the session

- **WHEN** a researcher signs out
- **THEN** the session is no longer presented by the browser, and a subsequent admin request without
  a new sign-in is refused

#### Scenario: Signing out does not mint a replacement

- **WHEN** a researcher signs out
- **THEN** no new session is issued as part of signing out

#### Scenario: An expired session is refused

- **WHEN** an admin route is requested with a session whose expiry has passed
- **THEN** the request is refused, with the same refusal a request with no session receives

#### Scenario: Use does not silently extend a session

- **WHEN** a researcher makes repeated requests within one session's lifetime
- **THEN** the session's expiry is unchanged by those requests, and extension occurs only after an
  explicit successful sign-in

#### Scenario: The residual window after sign-out is bounded

- **WHEN** a session is captured before sign-out and presented afterward
- **THEN** it is refused once its expiry passes, and no longer than the configured maximum session
  lifetime after it was issued

### Requirement: Repeated failed sign-in attempts are refused

The sign-in surface SHALL refuse further attempts after a configured number of consecutive failures,
and SHALL count attempts on the server rather than in the browser. Refusal SHALL NOT reveal whether
any particular credential exists, and SHALL NOT permanently lock the operator out by itself, so
that a legitimate researcher is not denied access by an unauthenticated party.

#### Scenario: Attempts stop at the configured limit

- **WHEN** sign-in is attempted repeatedly with an incorrect operator credential
- **THEN** further attempts are refused without the presented value being compared against the
  configured credentials

#### Scenario: The attempt count is not client-supplied

- **WHEN** a sign-in request carries a value claiming an attempt count
- **THEN** the value is ignored and the server's own count is used

#### Scenario: A successful sign-in clears the failure count

- **WHEN** a sign-in succeeds after earlier failures
- **THEN** the count returns to its initial value

#### Scenario: A successful sign-in is not possible for an unauthenticated party

- **WHEN** the limit has been reached
- **THEN** no presented value grants access, so reaching the limit denies a party that cannot
  authenticate rather than granting one

### Requirement: The database's deny-all posture is preserved

The platform SHALL NOT add or relax any Row Level Security policy in order to admit a researcher,
and SHALL NOT create a primary key, foreign key, index, or default value referencing an
authentication subject. A privileged read SHALL occur through the existing server-only privileged
access path, and SHALL be reached only after the application has established that the request is
authorized.

#### Scenario: No policy admits a researcher directly

- **WHEN** a read is attempted on any research table with a public or authenticated credential
- **THEN** the result is unchanged from before this capability existed: the read is refused by the
  database's existing posture, and no policy names a researcher or a researcher's credential

#### Scenario: No schema object references an authentication subject

- **WHEN** the schema is inspected
- **THEN** no key, foreign key, index, or default value references an authentication subject

#### Scenario: The privileged read is reached only after the application check

- **WHEN** a privileged read is performed for an admin request
- **THEN** the request was authorized by the application first, because an unauthorized request is
  refused before any privileged read is attempted

### Requirement: The export download verifies its own request

The researcher export download SHALL verify the request's presented session with the same researcher-area guard before any privileged access, independently of any layout or route-group placement. A refused request SHALL receive the area's standard refusal with no reason, no corpus-derived bytes, and no indication of whether the area is configured.

#### Scenario: Verification precedes privilege on the download

- **WHEN** an export request arrives without a valid session
- **THEN** it is refused before any privileged client is constructed or any repository is read

#### Scenario: Refusal discloses nothing

- **WHEN** an export request is refused
- **THEN** the response is byte-identical to the refusal for a protected page, carrying no reason and no configuration fact

### Requirement: Sign-in refusals are server-observable without becoming client-distinguishable

In addition to the single outward refusal message, every researcher sign-in outcome SHALL emit one server log line: refused attempts carry the internal reason with the coarse origin key, successful attempts carry the credential ordinal with the origin key. The outward refusal SHALL remain exactly one indistinguishable message across all reasons, and no reason, credential, session token, or recoverable derivative SHALL reach the requester or the browser.

#### Scenario: Operator can distinguish causes that requesters cannot

- **WHEN** sign-ins are refused for different internal reasons
- **THEN** the server log distinguishes them while every requester receives the identical refusal message

#### Scenario: The outward message is unchanged

- **WHEN** any sign-in refusal is rendered
- **THEN** it is the same single refusal message as before this change, with no reason appended and no per-cause variation

### Requirement: A successful sign-in completes by returned result, never by a redirect exception

A successful researcher sign-in SHALL complete as a returned success result carrying no credential and no session content, and the sign-in form SHALL navigate to the researcher area on that result. The server action SHALL NOT end success by throwing a redirect: a redirect is control flow disguised as failure, and any client-side `catch` between the call and the navigation — including a future one — converts it into the refusal message, showing a refusal for an access that was granted.

#### Scenario: Correct credential navigates with no refusal ever rendered

- **WHEN** a researcher submits the correct operator credential
- **THEN** a session cookie is issued, the client navigates to `/researcher`, and no refusal message appears at any point

#### Scenario: A refused credential still renders the generic refusal

- **WHEN** a researcher submits an incorrect credential
- **THEN** the existing generic refusal is rendered exactly as before, and no navigation occurs

#### Scenario: Transport failures keep the generic failure treatment

- **WHEN** the sign-in request never produces an answer
- **THEN** the generic failure message is shown without confusing it with a successful redirect
