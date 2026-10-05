# Spec Delta

## ADDED Requirements

### Requirement: Double Transit Mode pair is stored losslessly beside the scalar column

`dataset_entries` SHALL carry the Double Transit Mode pair in a new nullable `transit_modes text[]` column with CHECKs: scalar categories SHALL keep `transit_modes IS NULL`; Double Transit Mode rows SHALL keep scalar `transit_mode IS NULL` with `transit_modes` holding exactly two ordered elements, both in (`walking`, `jeepney`, `taxi`, `private_vehicle`) and distinct, and present (never null for that category). `source_payload` SHALL stay the untouched source record. The `source_entry_id` 1..800 range CHECK SHALL NOT be re-migrated. The pair SHALL be written only through the versioned function `dataset_entries_import_v3` (invoker security, empty search path, instruction/payload/`created_at` immutable, named divergence refusal, `service_role` grant with anon/authenticated revoke); v1 and v2 SHALL stay deployed unchanged. No applied migration SHALL be edited.

#### Scenario: A DTM pair round-trips ordered

- **WHEN** `DTM_1` with `["jeepney", "walking"]` is imported through v3 and read back
- **THEN** scalar `transit_mode` is null, `transit_modes` is exactly `["jeepney", "walking"]` in order, and the domain value is the same ordered pair

#### Scenario: A malformed pair is refused by the database

- **WHEN** a row carries one, three, duplicated, or out-of-vocabulary modes, or a scalar category carries a non-null pair column
- **THEN** the write is refused by the named CHECK rather than stored lossily

#### Scenario: Scalar categories are unchanged

- **WHEN** categories 1-5 are imported through v3
- **THEN** their scalar `transit_mode` values and nulls are stored exactly as before with `transit_modes` null
