# Importing a generated package

This procedure assumes RouterOS 7.20 or newer. Test on a disposable CHR or a
maintenance window first. The generated scripts can lock you out; treat the
default-drop staging and the backup as load-bearing.

## Before you start

1. **Take a VM snapshot** if the router is virtual. For physical hardware,
   confirm you have console access that does not depend on the IP stack you are
   about to change.
2. **Confirm the interface names** in the form match the router exactly
   (`/interface print`). A typo leaves an interface list empty; the generated
   rules then match nothing.
3. **Confirm the management source ranges** include the address you are
   connecting from. The generated SSH/Winbox rules require both the management
   interface list and the management address list.
4. **Keep a second session open** (a second SSH connection, MAC Winbox, or the
   serial console). Close it only after the finalize step.
5. **Download the package** and keep the `config.json` with it.

## Upload

Upload the `.rsc` files to the router's Files menu (Winbox) or via scp/sftp:

```sh
scp 00-preflight.rsc 10-firewall.rsc 20-bgp.rsc 90-finalize.rsc admin@router:
```

RouterOS filenames are case-sensitive and must not contain spaces.

The generated `/ip service set ssh address=...` uses the long-standing property
name. RouterOS 7.24 marks it deprecated in favour of `available-from` but still
accepts it; keeping `address` is what makes the same file work across the
7.20–7.24 range the generator targets.

## Import order

Open a terminal and, where possible, enable Safe Mode (`Ctrl+X`) for the
interactive import.

### 1. Preflight

```rsc
/import file-name=00-preflight.rsc
```

This aborts on RouterOS older than 7.20 and writes:

- `pre-gen-backup.backup` — binary backup
- `pre-gen-backup.rsc` — readable export

Download both before continuing.

### 2. Firewall

```rsc
/import file-name=10-firewall.rsc
```

The generated default-drop rules are installed **disabled**. Check that the
script completed without errors:

```rsc
/log print where message~"GEN"
/ip firewall filter print where comment~"GEN-FW"
/ipv6 firewall filter print where comment~"GEN-FW"
/interface list member print where comment~"GEN-FW"
```

### 3. Verify management access

Open a **new** SSH/Winbox session from the management network. If it fails,
do not continue. See [Lockout recovery](#lockout-recovery).

Also check the services that should be open before the default-deny is
enabled:

- DHCP/DHCPv6 server (if used)
- DNS (if the router serves DNS)
- NTP server (if used; add an extra UDP port or a manual rule)
- VPN termination (IPsec, L2TP, SSTP, WireGuard, OpenVPN) — add the ports in
  the firewall step or manually
- VRRP (if used)
- SNMP
- BGP/OSPF/BFD
- Any other service that terminates on the router

Anything not represented in the generated rules will be dropped after the
finalize step.

### 4. BGP

```rsc
/import file-name=20-bgp.rsc
```

Verify:

```rsc
/routing bgp instance print
/routing/bgp/session print
/routing/bgp/advertisements print
/routing/bgp/template print where name~"^gen-"
/routing/bgp/connection print where name~"^gen-"
/routing/filter/rule print where comment~"^GEN-BGP:"
/routing rpki print
/ip route print where comment~"^GEN-BGP:blackhole"
/ipv6 route print where comment~"^GEN-BGP:blackhole"
```

Expected state:

- Route-server and transit sessions are established (or actively trying).
- `rpki` groups have data; `rpki-verify` is applied to the input chains.
- Each announced prefix has an active route: connected, static, or the
  generated blackhole.
- Session counts are within the `input.limit-process-routes-*` limits.
- The blackhole list does not override a real path. The generator adds a
  blackhole only when no exact route exists, but a blackhole for a
  more-specific can still win over a less-specific connected route. Check:

  ```rsc
  /ip route print where comment~"GEN-BGP:blackhole"
  /ipv6 route print where comment~"GEN-BGP:blackhole"
  ```

  If a more-specific is already covered by a connected route, remove the
  generated blackhole for it; the connected route already makes the prefix
  active for BGP.

### 5. Finalize

Only after management access and BGP are verified:

```rsc
/import file-name=90-finalize.rsc
```

This enables the generated default-drop rules. Re-check the ping/SSH path and
the BGP sessions immediately:

```rsc
/ip firewall filter print where comment~"GEN-FW:input-default-drop"
/log print where message~"GEN-FW"
```

## Rollback

### Preferred: restore the preflight backup

```rsc
/system backup load name=pre-gen-backup
```

You can also restore `pre-gen-backup.backup` from Winbox
(**Files → Restore**).

### Remove only the generated objects

If the router is reachable and you want to keep the rest of the configuration:

```rsc
/ip firewall filter remove [find where comment~"^GEN-FW:"]
/ip firewall raw remove [find where comment~"^GEN-FW:"]
/ipv6 firewall filter remove [find where comment~"^GEN-FW:"]
/ipv6 firewall raw remove [find where comment~"^GEN-FW:"]
/ip firewall address-list remove [find where comment~"^GEN-FW:"]
/ipv6 firewall address-list remove [find where comment~"^GEN-FW:"]
/interface list member remove [find where comment~"^GEN-FW:member"]
/routing/bgp/connection remove [find where name~"^gen-"]
/routing/bgp/template remove [find where name~"^gen-"]
/routing/filter/rule remove [find where comment~"^GEN-BGP:"]
/ip firewall address-list remove [find where comment~"^GEN-BGP:network"]
/ipv6 firewall address-list remove [find where comment~"^GEN-BGP:network"]
/ip route remove [find where comment~"^GEN-BGP:blackhole"]
/ipv6 route remove [find where comment~"^GEN-BGP:blackhole"]
```

RPKI entries are added only if they do not already exist, so they are not
removed by the generated cleanup. Remove them manually if needed:

```rsc
/routing rpki print
/routing rpki remove [find where group="NAPCT"]
```

## Lockout recovery

If the new firewall blocks your management session:

1. Use the still-open second session or the serial/MAC console.
2. If no session is available, reboot into Etherboot/Netinstall only as a last
   resort; prefer restoring the backup from the serial console.
3. From the console:

   ```rsc
   /ip firewall filter set [find where comment="GEN-FW:input-default-drop"] disabled=yes
   /ipv6 firewall filter set [find where comment="GEN-FW:input-default-drop"] disabled=yes
   /ip firewall raw set [find where comment="GEN-FW:input-default-drop"] disabled=yes
   /ipv6 firewall raw set [find where comment="GEN-FW:input-default-drop"] disabled=yes
   ```

4. Fix the management interface/range in the form, regenerate, and re-import.

## Re-importing

Re-importing `10-firewall.rsc` removes the generated rules and re-creates the
default-drop **disabled**. Re-importing `20-bgp.rsc` removes and recreates the
generated BGP objects. After either re-import, re-run the verification steps
and `90-finalize.rsc`.

Objects with other comments/names are never touched. The cleanup is deliberately
scoped to `GEN-FW:`, `GEN-FW:member`, `GEN-BGP:` and the `gen-` BGP name
prefix.

## Stateless mode

Stateless mode disables connection tracking. It cannot support NAT, stateful
matched rules, fasttrack or connection limits. The generated ACL allows replies
only for the router-originated services selected in the form. Any other
outbound TCP session that terminates on the router may be dropped by the final
default-deny.

Use stateful mode unless you specifically want the conntrack-off DoS posture
and know that the router does not NAT.

## CHR test checklist

A disposable CHR is the right place for the first import. Minimum checks:

1. `00-preflight.rsc` accepts the version and writes both backups.
2. `10-firewall.rsc` imports with no error; interface lists and address lists
   contain the expected members.
3. Management SSH/Winbox survives from the management range, and fails from a
   non-management source.
4. `20-bgp.rsc` creates the expected number of templates and connections.
   A local test peer (for example another CHR) establishes a session.
5. `90-finalize.rsc` enables the drop rules; the test peer stays up and
   management still works.
6. Re-import `10-firewall.rsc` and confirm no duplicate rules accumulate.
7. Restore `pre-gen-backup` and confirm the pre-change configuration returns.

Record the RouterOS version used for the test in the deployment ticket. The
generator targets 7.20+ but is currently tested against 7.24 syntax.
