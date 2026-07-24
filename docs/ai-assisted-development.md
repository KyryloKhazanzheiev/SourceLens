# How I used AI

I used AI-assisted tools to compare architecture options, scaffold repetitive code,
suggest test cases, refine the interface, and review documentation.

## Working rules

1. I own the architecture and product decisions.
2. I review generated code in context; compiling is not enough.
3. I use type checks, static analysis, tests, runtime checks, and visual inspection as
   separate verification layers.
4. I do not put secrets or production customer data into prompts.
5. Prompts and generated artefacts do not override security or licensing obligations.
6. I check suggested dependencies for maintenance, licence, security, and fit.
7. I document trade-offs and limitations instead of presenting generated confidence
   as evidence.

## Decisions I made myself

- I chose direct RAG instead of an agent framework for a deterministic two-stage flow.
- I rejected MongoDB inside App Runner because stateful storage does not belong in
  ephemeral application instances.
- I treat model citations as untrusted output and validate them on the server.
- I added model-free RRF to combine semantic and lexical results without adding a
  second model dependency.
- I kept OCR and cloud deployment outside the MVP critical path.
- I label retrieval similarity as source relevance rather than model confidence.

## Reproducibility

The repository contains the architecture rationale, environment contract, dependency
lock files, generated OpenAPI contract, tests, and local run commands needed for
another engineer to inspect or reproduce the work.
