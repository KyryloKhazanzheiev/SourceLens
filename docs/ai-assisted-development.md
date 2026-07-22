# AI-assisted development record

AI-assisted tools were used to accelerate architecture comparison, scaffold repetitive code, suggest test cases, refine the product interface, and review documentation.

## Working rules

1. The developer owns every architecture and product decision.
2. Generated code is reviewed in context; it is not accepted because it compiles.
3. Type checks, static analysis, tests, runtime checks, and visual inspection provide separate verification layers.
4. Secrets, production data, and private documents are never placed in prompts.
5. Prompts and generated artefacts do not override repository security or licensing obligations.
6. Material AI-suggested dependencies are checked for maintenance, licence, security, and fit.
7. The README states meaningful trade-offs and limitations instead of presenting generated confidence as evidence.

## Examples of human judgment retained

- Selecting direct RAG instead of an agent framework for a deterministic two-stage workflow.
- Rejecting MongoDB inside App Runner because stateful storage does not belong in ephemeral application instances.
- Treating model citations as untrusted output and validating them server-side.
- Keeping OCR, reranking, and cloud deployment out of the MVP critical path.
- Requiring evaluation evidence before making the retrieval stack more complex.

## Reproducibility

The repository contains the architecture rationale, explicit environment contract, dependency lock files, generated OpenAPI contract, tests, and local run commands needed for another engineer to inspect or reproduce the work.
