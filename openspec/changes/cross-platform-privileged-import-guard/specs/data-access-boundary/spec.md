# Spec Delta

## ADDED Requirements

### Requirement: The privileged-import gate fires on any host path separator

The static privileged-import rule SHALL treat a presentation component as
browser-side on every host operating system: a file under `src/components/`
that imports a privileged persistence or server-environment module SHALL fail
lint whether the host reports its path with forward slashes or backslashes.

#### Scenario: Directive-less component importing a privileged module fails lint on Windows paths

- **WHEN** a file under `src/components/` without its own `"use client"`
  directive imports a privileged module and the host reports a backslash path
- **THEN** the lint verification step fails and the violation is reported with
  the offending file, exactly as on a forward-slash host
