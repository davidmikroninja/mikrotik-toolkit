# Security policy

This is a client-side configuration generator. It has no backend, no accounts
and no data collection. The generated configuration is only as safe as the
inputs you provide, so review the generated files before importing them.

## Reporting

Report generator bugs that could produce an unsafe configuration privately to
the repository owner rather than in a public issue. Include:

- the `config.json` that produced the output (remove any sensitive addresses
  first),
- the generated file and the RouterOS version,
- what you expected and what happened.

Do not include router credentials, SNMP communities, API keys or customer data
in a report.

## Scope

In scope:

- generated rules that fail to import,
- rules whose meaning changes when an interface list is empty,
- a selected peer missing from the firewall allowlist,
- IPv6 enabled without generated IPv6 filtering,
- default-deny enabled before verification,
- invalid RouterOS syntax in generated files.

Out of scope:

- a correct configuration applied to a topology it was not written for,
- peer addresses or RPKI endpoints in the catalog being stale (report them,
  but they are data, not a code vulnerability),
- RouterOS itself.
