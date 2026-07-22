# Architecture notes

## Boundaries

SourceLens separates HTTP transport, application services, and persistence adapters:

- `app/api` validates transport inputs and maps domain failures to HTTP responses.
- `app/services` owns ingestion and question-answering workflows.
- `app/repositories` owns MongoDB and LanceDB implementation details.
- `app/schemas.py` provides the explicit data contracts shared by the layers and exposed in OpenAPI.

The current `AppContainer` is intentionally small. It provides one composition root without introducing a dependency-injection framework. Repositories can be replaced by fakes in service-level tests.

## Ingestion consistency

MongoDB is the application source of truth. A document moves through `processing → ready` or `processing → failed`. Vector insertion happens before the ready transition so the UI never selects a document that has no searchable chunks.

The local first draft processes ingestion in the request. Production should use an idempotent job keyed by document SHA-256. A compensating cleanup job should detect failed or abandoned uploads and remove any orphaned file/vector data.

## Retrieval constraints

- Search is always filtered by the conversation's persisted document IDs.
- Candidate and final-context limits are configurable.
- Cosine distance is converted to a bounded relevance value.
- Sources below the minimum threshold are removed before generation.
- Model-returned citation numbers are checked against the actual retrieval list.
- No valid citations means no supported answer.

## Threat model highlights

Uploaded text is attacker-controlled. It is never executed and is explicitly labelled untrusted in the generation instructions. File paths are generated from server-side UUIDs. The service applies extension, size, empty-file, duplicate, UTF-8, PDF parsing, and extractable-text checks.

The MVP is single-user and must not be exposed publicly without authentication and object-level authorisation. Production also needs malware scanning, quotas, encryption, retention/deletion controls, tenant filters in every repository query, and audit events.

## Known first-draft limitations

- Ingestion is synchronous.
- There is no OCR.
- Vector retrieval has no lexical component or reranker.
- Conversation history is persisted but not yet used for follow-up-question rewriting.
- Citation excerpts are returned, but there is no PDF preview/deep link yet.
- The local two-store deletion sequence is best-effort rather than transactional.
