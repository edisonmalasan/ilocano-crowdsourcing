# Spec Delta

## ADDED Requirements

### Requirement: Product copy carries no em dash except the site title

No rendered participant- or researcher-facing English or Filipino string SHALL contain U+2014, except the two `meta.siteTitle` values (`Sadino — validate Ilocano navigation data`, `Sadino — suriin ang datos ng nabigasyon sa Ilocano`), which SHALL stay byte-identical as intentional title typography. Rewrites SHALL use periods, commas, or colons where each reads naturally, SHALL NOT add, remove, or rename a catalog key, SHALL NOT change what any string promises, and SHALL NOT alter sentence counts, guard vocabularies, or research text. Developer comments, docs, migrations, archived history, and the dataset (which holds zero U+2014) are out of scope and SHALL NOT be rewritten to reduce a grep count.

#### Scenario: English product copy has no em dash outside the site title

- **WHEN** every rendered English catalog value and non-catalog interface literal is scanned
- **THEN** none contains U+2014 except `meta.siteTitle`

#### Scenario: Filipino product copy has no em dash outside the site title

- **WHEN** every rendered Filipino catalog value and non-catalog interface literal is scanned
- **THEN** none contains U+2014 except `meta.siteTitle`

#### Scenario: The site titles keep their exact em dash

- **WHEN** both `meta.siteTitle` values are read
- **THEN** each contains exactly the intentional U+2014 and is otherwise unchanged

#### Scenario: A new em dash in product copy fails the guard

- **WHEN** a future edit adds U+2014 to any localized product-copy value or covered literal outside the site titles
- **THEN** the copy guard fails naming the key or site, while a changed comment does not fail it

#### Scenario: The dataset is untouched

- **WHEN** the dataset file is compared before and after
- **THEN** it is byte-identical with an unchanged SHA-256, and no migration, reset, or reseed happened in this change
