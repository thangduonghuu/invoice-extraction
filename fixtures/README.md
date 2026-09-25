# Fixtures

Drop the 6 sample PDFs here, named exactly:

- `IB-55871.pdf`
- `IB-55902.pdf`
- `IB-56010.pdf`
- `IB-56088.pdf`
- `IB-56150.pdf`
- `IB-STMT47.pdf`

`packages/engine/tests/fixtures.test.ts` reads them from this directory. Until a
given file is present, its test is skipped (reported as pending, not failing)
so `pnpm test` stays green for everyone else's work in the meantime.
