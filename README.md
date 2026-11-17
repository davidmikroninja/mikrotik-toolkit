# MikroTik Edge Config Generator

**Live:** <https://davidmikroninja.github.io/mikrotik-toolkit/>

A static web tool that generates a hardened RouterOS **7.20+** edge firewall
and BGP configuration from a validated form. It replaces hand-editing the two
public MikroTikSA scripts:

- [`MikroTikSA/edge-firewall-ROSv7`](https://github.com/MikroTikSA/edge-firewall-ROSv7)
- [`MikroTikSA/INX-bgp-setup`](https://github.com/MikroTikSA/INX-bgp-setup)

The generator exists because most defects in those scripts are not typos you
can spot in one file — they are cross-field and cross-file inconsistencies:
a peer missing from the firewall allowlist, a v4 list in a v6 template, RPKI
configured but never applied, a negative interface match that changes meaning
when a list is empty. A form can validate those before generating a line.

**All generation happens in the browser. There is no backend, no account, and
no telemetry.** See [docs/REVIEW.md](docs/REVIEW.md) for the audit that drove
the design and [docs/IMPORTING.md](docs/IMPORTING.md) for the deployment and
rollback procedure.

## What it generates

| File | Purpose |
| --- | --- |
| `00-preflight.rsc` | RouterOS 7.20+ version gate, binary backup and readable export. |
| `10-firewall.rsc` | Interface lists, address lists, service hardening, IPv4/IPv6 firewall. Default-drop rules are installed **disabled**. |
| `20-bgp.rsc` | Network lists, blackhole routes, RPKI RTR entries, filter chains, templates and sessions. |
| `90-finalize.rsc` | Enables the generated default-drop rules after verification. |
| `README.txt` | Import order, verification commands, rollback and caveats. |
| `config.json` | The exact input, for review or re-import. |

The output is deterministic apart from the timestamp: the same input and date
produce the same files.

## Safety model

- **Staged default-deny.** The drop rules are created `disabled=yes` and only
  enabled by an explicit finalize import. This is the main defence against
  locking yourself out with a generated firewall.
- **No negative interface matches.** The original used
  `in-interface-list=!management`, which matches every interface when the list
  is empty. The generator uses positive matches and shows a warning when a
  list is empty.
- **Peers drive the allowlist.** Every selected transit, route server,
  bilateral and custom peer is added to `bgp-allowed`; the two files cannot
  disagree about who may reach port 179.
- **IPv6 is explicit.** If IPv6 is enabled, an IPv6 firewall is generated
  unless you deliberately turn it off (and the form warns).
- **No NAT assumptions.** Stateful mode is the default. Stateless mode
  disables conntrack, and the form warns that NAT will stop working.
- **Placeholders are rejected.** Private/documentation ASNs, documentation
  prefixes and missing management ranges are warnings or errors, not silent
  defaults.

The generator cannot see your topology, your peering agreements or the services
that terminate on your router. Review the output and keep a second access path.

## Verification

The current package has been imported into a disposable RouterOS **7.24.2 CHR**
in both stateful and stateless modes. The test verified preflight, firewall,
BGP object creation, finalize behaviour (management SSH survives, WAN SSH is
dropped) and MNDP. It found and fixed five issues that static analysis missed;
see [docs/CHR-TEST.md](docs/CHR-TEST.md). Real BGP sessions, RPKI RTR
synchronisation and 7.20–7.23 remain untested.

## Development

Requires Node.js 22+.

```sh
npm ci
npm run dev       # http://localhost:5173
npm test          # vitest
npm run build     # type-check + static build into dist/
npm run preview   # serve the production build
```

The generator core is plain TypeScript under `src/generator/` and has no React
dependency. The UI is React + Vite under `src/ui/`.

### Tests

`npm test` covers:

- IPv4/IPv6 parsing, prefix normalisation and overlap detection
- configuration validation (ASN, prefixes, management ranges, stateless rules,
  wrong-fabric peers, RPKI groups, extra ports)
- generated firewall and BGP regressions for every bug in the review
- a RouterOS linter (brace balance, chain/template references, `afi` vs
  `address-families`, IPv6 network-list mismatches, duplicate names)
- the store-only ZIP writer and config hydration

The linter is also run against every generated file at build time in the UI.

## Deployment

The repo ships two GitHub Actions workflows:

- `ci.yml` — install, test and build on every push and pull request.
- `pages.yml` — build and publish `dist/` to GitHub Pages on `main`.

In the repository settings, set **Pages → Build and deployment → Source** to
**GitHub Actions**. The workflow then publishes on every push to `main`.

`vite.config.ts` uses `base: './'`, so the same `dist/` works on a project
Pages site, a custom domain, or a plain nginx directory behind
oauth2-proxy/Authentik.

## Repository layout

```
src/generator/   pure generator core, validation, linter, catalog
src/ui/          React form, review screen, downloads, ZIP writer
src/styles.css   theme and layout
docs/            review findings and import/rollback guide
examples/sample/ a generated package (documentation ranges only)
.github/         CI and Pages workflows
```

## Peer catalog

`src/generator/catalog.ts` contains the NAP Africa route-server and bilateral
session data transcribed from `INX-bgp-setup`. Treat it as data that needs
review: peers move addresses, and bilateral sessions require an agreement.
Selecting a peer generates an **enabled** session; the original script shipped
them disabled.

## Security

There are no secrets in the form. Do not enter credentials, SNMP communities or
API keys into any field. The RPKI RTR endpoints and public peer addresses are
from the original public script; verify them against your own records before
enabling.

Please report security issues privately to the repository owner rather than
opening a public issue.

## License

MIT. See [LICENSE](LICENSE).
