# Review: the two original scripts

Audit date: 2026-11-17. Sources:

- [`MikroTikSA/edge-firewall-ROSv7/Edge_Firewall_V7_3.rsc`](https://github.com/MikroTikSA/edge-firewall-ROSv7/blob/main/Edge_Firewall_V7_3.rsc)
- [`MikroTikSA/INX-bgp-setup/INX_bgpSetup-ROSv7.rsc`](https://github.com/MikroTikSA/INX-bgp-setup/blob/main/INX_bgpSetup-ROSv7.rsc)

The review was cross-checked against the RouterOS 7.24 CLI reference. Line
numbers refer to the commit reviewed on 2026-11-17. "Fix" describes what the
generator does now.

## Firewall

The original is a stateless `/ip firewall raw` ACL plus service hardening, with
connection tracking deliberately disabled. It never creates `/ip firewall
filter` rules, so forwarded traffic is not statefully filtered. That can be a
valid design for a pure router that does not NAT, but the script does not say
so and does not complete the stateless allowlist.

### Critical / high

1. **Default-deny is disabled** (`:L133`). As imported, the script permits all
   input traffic except the specific drops above it. If enabled, stateless raw
   has no `established` equivalent, so outbound syslog, SMTP, SNMP traps and
   SSH-client sessions lose their replies.
   *Fix:* generate the default-drop `disabled=yes`, then enable it explicitly
   with `90-finalize.rsc` after verification. Stateful mode is the default.
2. **Connection tracking is globally disabled** (`:L88-89`) and service ports
   are disabled. NAT, `connection-state`, fasttrack and connection limits stop
   working.
   *Fix:* stateful mode is the default; stateless is an explicit option that
   warns that NAT will not work and generates reply rules only for selected
   router-originated services.
3. **Empty interface lists plus negative matches are a lockout trap.**
   `management` is created but never populated, and
   `in-interface-list=!management` (`:L124`) / `!public-in` (`:L108`) match
   every interface when the list is empty. A wrong `$ipman` locks out SSH and
   Winbox, and MAC server/discovery are disabled too.
   *Fix:* interface names are collected in the form, members are generated,
   and the firewall uses positive list matches only. Empty lists produce
   warnings.
4. **`ssh-allowed-in` is referenced but never defined** (`:L111`). The rule
   matches nothing.
   *Fix:* removed; the generator does not emit undefined lists.
5. **The DNS/NTP/SNMP drop is over-broad** (`:L126`). It lacks
   `dst-address-type=local`, so it also blocks public DNS/NTP/SNMP traffic
   through the router to internal servers.
   *Fix:* the generated WAN drop is scoped to `dst-address-type=local`.
6. **Multiple management ranges do not work.** The comment says to add more
   ranges to the address list, but `/ip service ssh address=$ipman` and
   `winbox address=$ipman` only use the single global CIDR.
   *Fix:* a comma-joined management list is used for both `/ip service` and
   the address list.
7. **SSH policy is inconsistent.** `ssh-allowed` only accepts forwarded SSH to
   internal clients (`:L110`); SSH to the router from that list is never
   accepted, and the service-level address restriction blocks it anyway.
   *Fix:* router SSH and forwarded SSH are separate form fields and separate
   rules.

### Medium / low

8. **No IPv6 firewall.** `/ip firewall raw` is IPv4-only, while the BGP script
   enables IPv6. If both are used, the IPv6 side is unfiltered.
   *Fix:* an IPv6 filter/raw policy is generated whenever IPv6 is enabled.
9. **`ipv6 nd` is disabled on all interfaces** (`:L151-152`), which kills
   SLAAC/LAN IPv6. *Fix:* ND is left alone by default; "disable on WAN" is an
   explicit option.
10. **`mik-update` accepts every protocol and port** (`:L117`). The hardcoded
    159.148.x addresses age.
    *Fix:* hostname entries and TCP 80/443 reply matches only.
11. **`/ip cloud set ddns-enabled=no` is invalid on RouterOS 7.24** (`:L25`).
    The property is an enum of `auto|yes`; `no` is rejected as a syntax error,
    which aborts the import at that line. The CHR test caught this.
    *Fix:* the generator emits `ddns-enabled=auto` and the linter rejects `no`.
12. **`pool.ntp.org` in an address list** (`:L60`) is brittle at import time.
    *Fix:* NTP servers are a form field; the router NTP client is configured
    from them.
13. **`/ip firewall service-port set [find] disabled=yes` aborts on 7.24**
    (`:L92`). The built-in `udplite`, `dccp` and `sctp` modules cannot be
    disabled, and the import stops at that line. The CHR test caught this.
    *Fix:* the generator loops over the entries and catches the per-module
    error, so valid ALGs are disabled and built-ins are skipped.
14. **No logging on drops.** The original default-deny logs everything (log
    flood risk) and the other drops are silent.
    *Fix:* log prefixes are generated, optional, and centralized on the
    default-drop rules.
15. **No idempotency.** Re-importing duplicates raw rules and address-list
    entries. *Fix:* every generated object is tagged `GEN-FW:` and removed
    before re-creation.

## BGP

### Import-breaking

1. **Stray `}` at `:L87`.** The IPv6 conditional closes on `:L85`; `:L86` then
   adds the IPv6 list unconditionally, and `:L87` is an unmatched close brace.
   *Fix:* generated braces are balanced and linted.
2. **`address-families=` is the pre-7.19 property.** RouterOS 7.19 renamed it
   to `afi=`, and the 7.24 reference documents `afi`. All ten template lines
   (`:L111-123`) fail on current 7.x.
   *Fix:* the generator targets 7.20+ and emits `afi=ip` / `afi=ipv6`; the
   linter rejects `address-families=`.
3. **`template=` instead of `templates=`** on the Cape Town IPv6 collector
   (`:L289`). `template` is not a connection property.
   *Fix:* only `templates=` is emitted; the linter rejects the singular.
4. **Four IPv6 templates point at the IPv4 network list** — `:L117`, `:L119`,
   `:L122`, `:L123` use `.network=bgp-networks-v4` on IPv6 templates.
   *Fix:* v6 templates use `bgp-networks-v6`; the linter checks this.
5. **Cape Town IPv6 uses the Johannesburg input filter** (`:L123`:
   `input.filter=nap-in-v6-jb`), giving CT IPv6 peers the JB local preference.
   *Fix:* chain selection is derived per fabric and address family.
6. **"Do not accept own prefix" only rejects /32s.** All six rules use
   `dst-len >= 32` (`:L143,146,161,164,169,172`), so the aggregate and any
   more-specific still pass.
   *Fix:* `if (dst in bgp-networks-v4) { reject; }` (and the v6 equivalent).
7. **`router-id=` is not a template/connection property on RouterOS 7.20+.**
   Every template line (`:L111-123`) would fail with `bad parameter router-id`.
   The CHR test caught this. *Fix:* the generator creates a BGP instance with
   the router ID and ASN, and each connection references it.

### Security / correctness

8. **RPKI is decorative.** The `rpki-nap-ct` / `rpki-nap-jb` chains
   (`:L257-260`) are never referenced. *Fix:* `rpki-verify` and invalid-route
   rejection are in the generated input chains, including IPv6.
9. **No max-prefix limits.** *Fix:* `input.limit-process-routes-ipv4/ipv6` is
   generated per template with sensible guardrails.
10. **`rfc5735` rejects all /25–/32 routes** (`:L181`) inside the bogon chain,
   blocking legitimate customer more-specifics and anycast host routes.
   *Fix:* prefix-length policy is a separate, configurable input check, not
   part of the bogon chain.
11. **IPv6 output policy is inconsistent.** `nap-out-v6` / `blp-out-v6` only
    accept `dst-len == 32` (`:L219,227`), while `ipt-out-primary-v6` has no
    length check (`:L209`).
    *Fix:* both address families use configurable advertise-length ranges.
12. **All sessions use `local.role=ebgp`.** *Fix:* route-server sessions use
    `ebgp-rs-client`, transits use `ebgp-customer`/`ebgp-provider`, and
    bilaterals use `ebgp-peer`, enabling RFC 9234 OTC handling.
13. **Dangerous placeholders are live defaults.** ASN 65530, RID 0.1.2.3,
    IPT peer 0.2.0.0/AS65532, IPv6 2c0f::/32 and `addipt=yes` would be imported
    as real values. *Fix:* the form has no live placeholder defaults, and
    validation warns/errors on private/documentation ASNs and prefixes.
14. **No backup IPT.** `ipt-in-backup-*` / `ipt-out-backup-*` chains exist, but
    no template or connection uses them. *Fix:* primary and backup transits are
    first-class; backup announcements prepend AS3.
15. **Blackholes for every list entry.** The comment tells the user to add
    /23s and /24s; the loop blackholes all of them, which can drop real traffic
    in gaps. *Fix:* blackholes are generated per entry only when no route
    already exists, and the README explains the active-route requirement.
16. **No idempotency.** Re-running duplicates templates, connections and
    filter rules. *Fix:* generated connections/templates use a `gen-` name
    prefix, filter rules use `GEN-BGP:` comments, and all are removed before
    re-creation.

### Operational

17. `:global` variables pollute the router's global environment. *Fix:*
    generated scripts use no global variables.
18. No BGP logging/monitoring, BFD, peer comments or version header. *Fix:*
    generated headers, comments and a README with verification commands; BFD
    remains a future extension.
19. No README, license, tests or CI in either repository. *Fix:* this repo
    adds all four, plus a linter.

## Cross-script problems

- **`bgp-allowed` is not derived from the BGP peers.** The firewall only
  allows the NAP route-server ranges; IPT and bilateral addresses are missing.
  With default-deny enabled those sessions break.
  *Fix:* the firewall allowlist is derived from every selected peer.
- **IPv6 is enabled by BGP but not firewalled by the firewall.**
  *Fix:* IPv6 policy is generated with the firewall.
- **Neither script populates interface lists**, and the firewall's negative
  matches depend on them.
  *Fix:* interface-list membership is generated from the form.
- **No shared version/consistency check.** *Fix:* both files come from one
  config object and one generator run; the linter checks cross-references.

## Verification status

The generated output is covered by the test suite and the RouterOS linter, and
has been imported into a **disposable RouterOS 7.24.2 CHR** in both stateful
and stateless modes. The CHR test verified:

- preflight version gate and backups,
- firewall import, interface lists and address lists,
- BGP instance, templates, connections, filters, RPKI entries and blackholes,
- default-drop finalization with management access surviving and WAN SSH
  dropped,
- stateless raw ACL import and management/WAN behaviour.

The test also found five issues static analysis missed (cloud DDNS enum,
built-in service-port modules, `router-id` on BGP templates, the mandatory BGP
`instance`, and blocked MNDP). All are fixed in the generator and covered by
regression tests. Details: [CHR-TEST.md](CHR-TEST.md).

**Still unverified:** BGP sessions against a real peer, RPKI RTR
synchronisation, NAT/PPPoE/IPsec data paths, and RouterOS 7.20–7.23. Test in
your own lab before applying to a production router. The import procedure in
[IMPORTING.md](IMPORTING.md) assumes a disposable CHR or a maintenance window
with a backup.
