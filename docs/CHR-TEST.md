# CHR import test — 2026-11-17

The generated package was imported into a disposable RouterOS **7.24.2** CHR
running under QEMU on the development machine. No production router was
touched.

## Test setup

- CHR image: `chr-7.24.2.img`, 768 MB RAM, 2 vCPU, three e1000 NICs.
- `ether1` (WAN): QEMU user network `10.0.2.0/24`, host SSH forwarded to 2222.
- `ether2` (management): user network `10.10.0.0/24`, host SSH forwarded to 2223.
- `bridge` created as the LAN interface.
- Management range `10.0.0.0/8` covers both QEMU gateways (`10.0.2.2`,
  `10.10.0.2`).
- Generated files came from `src/generator/fixtures.ts` (documentation prefixes,
  private ASNs, both NAP fabrics, a transit, one catalog bilateral peer, one
  custom peer).

## Matrix

| Step | Result |
| --- | --- |
| `00-preflight.rsc` | Pass. Version gate accepted 7.24.2; `pre-gen-backup.backup` and `.rsc` written. |
| `10-firewall.rsc` (stateful) | Pass after fixes below. 15 IPv4 + 15 IPv6 filter rules, interface members and address lists created. |
| `20-bgp.rsc` | Pass after fixes below. 12 templates (including the built-in default), 21 connections, 99 filter rules, 4 RPKI entries, 3 blackhole routes. |
| `90-finalize.rsc` | Pass. Default-drop rules enabled; management SSH survived; WAN SSH dropped with `GEN-FW input drop` log entries. |
| `10-firewall.rsc` (stateless) | Pass. 17 IPv4 + 14 IPv6 raw rules; stateful filter rules removed; conntrack disabled; management SSH survived; WAN SSH dropped. |
| MNDP | Pass after fix. UDP 5678 accepted on `mndp-allowed`; prior drops every 30 s stopped. |

## Issues the CHR caught that static lint did not

1. `/ip cloud set ddns-enabled=no` — `ddns-enabled` is an enum of `auto|yes`
   on 7.24; `no` is a syntax error. Generated output now uses `auto`.
2. `/ip firewall service-port set [find] disabled=yes` — built-in `udplite`,
   `dccp` and `sctp` modules cannot be disabled; the import aborted. The
   generator now loops and catches per-module errors.
3. `router-id=` on `/routing/bgp/template` — not a 7.24 template property. The
   generated BGP file no longer emits it.
4. BGP connections require `instance=` on 7.24. The generator now creates
   `/routing/bgp/instance gen-main` with the ASN and router ID, and every
   connection references it.
5. MNDP was blocked by the generated default-deny even when discovery
   interfaces were configured. UDP 5678 accept rules were added for IPv4 and
   IPv6, stateful and stateless.

The target floor was raised from 7.19 to **7.20** because `afi`, the BGP
instance model and the mandatory connection `instance` are all part of the
7.20+ behaviour this package relies on.

## Limitations

- No real BGP peer was available in the CHR test; sessions imported and
  matched templates but did not establish. Peering behaviour must be verified
  on a lab router with a real or simulated peer.
- The RPKI RTR endpoints from the original script were unreachable from the
  QEMU user network. RPKI object creation was verified; RTR synchronisation
  was not.
- NAT, PPPoE, IPsec and other data-plane services were not exercised.
- Only RouterOS 7.24.2 was tested. The 7.20–7.23 range is supported by syntax
  but has not been run.

## Reproducing

The CHR setup is disposable and was not committed. The import procedure and
verification commands are in [IMPORTING.md](IMPORTING.md). If you reproduce
this, use a CHR or lab router, not a production device.
