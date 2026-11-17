# Sample package

These files are a real generator output, produced from
`src/generator/fixtures.ts` with a fixed timestamp. They use documentation
prefixes (`192.0.2.0/24`, `198.51.100.0/24`, `2001:db8::/32`) and private ASNs,
so **do not deploy them**. They exist to show the shape of the output and to
let reviewers inspect the generated rules without running the UI.

- `00-preflight.rsc` — version gate and backup
- `10-firewall.rsc` — stateful firewall with the default-drop staged disabled
- `20-bgp.rsc` — filters, RPKI, templates and sessions
- `90-finalize.rsc` — enable the default-drop rules
- `README.txt` — the generated import/rollback notes
- `config.json` — load this into the UI with **Load input** to explore the form

The fixture also exercises both NAP fabrics, a transit, a catalog bilateral
peer and a custom peer. See [../docs/REVIEW.md](../docs/REVIEW.md) for the
defects these outputs fix.
