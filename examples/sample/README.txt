MikroTik Edge Configuration Package
===================================
Generated: 2026-11-17T00:00:00.000Z
Generator: MikroTik Toolkit v0.1.0
Configuration id: 8a4c0f28
Target: RouterOS 7.20+ (tested on 7.24)
Router
------
Name:       test-edge
ASN:        65000
Router ID:  192.0.2.1
IPv4:       192.0.2.0/24, 198.51.100.0/24
IPv6:       2001:db8::/32
Transits:   ipt-primary AS65001
IXP peers:  NAP CT route servers, NAP JB route servers, Akamai, Netflix, local-peer
RPKI:       NAPCT, NAPJB
Firewall:   stateful mode, input policy drop
Services:   SSH on, Winbox on, DNS server on, DHCP server on, VRRP off
Extra in:   TCP (none) / UDP (none)
Management: 10.0.0.0/8
Files
-----
00-preflight.rsc   Version gate; writes pre-gen-backup.backup and .rsc.
10-firewall.rsc    Services, interface lists, address lists, IPv4/IPv6 firewall.
20-bgp.rsc         Filters, RPKI, templates and BGP sessions.
90-finalize.rsc    Enables the default-drop rules (run last).
config.json        The exact input used to generate this package.
Import order
------------
1. Take a VM snapshot if this is a virtual router, and download the backup
   files that 00-preflight.rsc creates.
2. Upload all .rsc files to the router (Winbox Files, or scp/sftp).
3. Open a console with a second management path available. Enable Safe Mode
   (Ctrl+X in the terminal) if your workflow supports it.
4. /import file-name=00-preflight.rsc
5. /import file-name=10-firewall.rsc
6. Verify management access from a NEW session before continuing. The
   default-drop rules are installed disabled so this step cannot lock you out.
7. /import file-name=20-bgp.rsc
8. Verify BGP and the generated objects:
     /routing/bgp/session print
     /routing/bgp/advertisements print
     /ip route print where comment~"GEN-BGP"
     /routing rpki print
     /ip firewall filter print where comment~"GEN-FW"
     /ipv6 firewall filter print where comment~"GEN-FW"
9. When everything is correct: /import file-name=90-finalize.rsc
What the scripts change
-----------------------
- 10-firewall.rsc removes and recreates every object whose comment starts
  with GEN-FW: (and GEN-FW:member on interface-list members). Address-list
  entries and interface-list members from other sources are left alone.
- 20-bgp.rsc removes and recreates every BGP connection/template/instance
  whose name starts with gen-, every routing-filter rule commented
  GEN-BGP:, and its own address-list and blackhole-route entries. The
  gen-main instance holds the configured router ID and ASN.
- Re-importing 10-firewall.rsc recreates the default-drop rules disabled.
  Run 90-finalize.rsc again only after re-verifying access and sessions.
Warnings and caveats
--------------------
- The default-deny rules are DISABLED until 90-finalize.rsc is imported.
- BEFORE running 90-finalize.rsc, confirm every service that terminates on
  the router is allowed: DHCP/DHCPv6 server, DNS, NTP server, VPN
  (IPsec/L2TP/SSTP/WireGuard), VRRP, SNMP, BGP/OSPF/BFD, and any extra
  ports you entered. Anything not listed is dropped by the default deny.
- If the router does NAT, do not use stateless mode: it disables connection
  tracking and NAT will stop working.
- The generated blackhole routes only exist when no route for that prefix
  already exists. BGP can only advertise an active route; make sure each
  announced prefix is connected, static, or covered by the blackhole.
- Bilateral peers are opt-in. Enable only sessions you have agreed with the
  other network; the original script shipped them disabled for this reason.
- RPKI validation only rejects routes marked invalid. If the RTR session is
  down, routes become unknown and are accepted. Monitor /routing rpki.
- Interface lists are populated only with the interface names entered in
  the form. A typo silently leaves a list empty; check `/interface list
  member print` after import.
- IPv6 is only filtered if it is enabled in the form AND the IPv6 firewall
  option is not off. IPv6 services on an unfiltered router are exposed.
Rollback
--------
Preferred: restore the preflight backup with
  /system backup load name=pre-gen-backup
or restore pre-gen-backup.backup from Winbox (Files -> Restore).
If the router is reachable and you only need to remove the generated rules:
  /ip firewall filter remove [find where comment~"^GEN-FW:"]
  /ip firewall raw remove [find where comment~"^GEN-FW:"]
  /ipv6 firewall filter remove [find where comment~"^GEN-FW:"]
  /ipv6 firewall raw remove [find where comment~"^GEN-FW:"]
  /routing/bgp/connection remove [find where name~"^gen-"]
  /routing/bgp/template remove [find where name~"^gen-"]
  /routing/filter/rule remove [find where comment~"^GEN-BGP:"]
Validation
----------
No blocking validation errors were present when this package was generated.
Non-blocking warnings from the generator:
- [router.asn] AS65000 is a private ASN; public networks will reject announcements carrying it.
- [addressFamilies.ipv4.prefixes.0] "192.0.2.0/24" is private, reserved, or documentation space; upstream networks will reject it.
- [addressFamilies.ipv4.prefixes.1] "198.51.100.0/24" is private, reserved, or documentation space; upstream networks will reject it.
- [addressFamilies.ipv6.prefixes.0] "2001:db8::/32" is private, reserved, or documentation space; upstream networks will reject it.
- [transits.0.asn] AS65001 is a private ASN; public networks will reject announcements carrying it.
- [peering.customPeers.0.asn] AS65002 is a private ASN; public networks will reject announcements carrying it.
- [management.ranges] IPv6 is enabled and SSH/Winbox are on, but no IPv6 management range is configured. IPv6 management is denied until you add one.
- [management.snmpServers] No IPv6 SNMP source is configured; IPv6 SNMP queries will be denied.
Generated by MikroTik Toolkit v0.1.0. Review the scripts
before importing. This tool cannot see your topology, routing policy, or
peering agreements.
