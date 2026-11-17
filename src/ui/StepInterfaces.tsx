import { Callout, Checkbox, StepHeader, TagInput } from './controls';
import type { StepProps } from './appTypes';

export function StepInterfaces({ config, update, issues }: StepProps) {
  return (
    <>
      <StepHeader
        title="Interfaces & management"
        description="Interface-list membership and the source ranges allowed to reach router services. The generated firewall avoids negative interface matches, so an empty list cannot accidentally match every interface."
      />

      <Callout tone="danger" title="Lockout risk">
        SSH and Winbox are restricted to the management interface list and the
        management source ranges. Keep a second access path (console, MAC Winbox,
        or a VM snapshot) open while importing the generated script.
      </Callout>

      <div className="section">
        <h3>Interface lists</h3>
        <div className="grid two">
          <TagInput
            id="if-wan"
            label="WAN / public interfaces"
            field="interfaces.wan"
            issues={issues}
            values={config.interfaces.wan}
            onChange={(values) => update((draft) => { draft.interfaces.wan = values; })}
            placeholder="ether1"
            mono
            hint="Used for WAN-specific drops. Interfaces must exist on the router."
          />
          <TagInput
            id="if-lan"
            label="LAN interfaces"
            field="interfaces.lan"
            issues={issues}
            values={config.interfaces.lan}
            onChange={(values) => update((draft) => { draft.interfaces.lan = values; })}
            placeholder="bridge"
            mono
            hint="DNS/DHCP server rules are scoped to this list."
          />
          <TagInput
            id="if-management"
            label="Management interfaces"
            field="interfaces.management"
            issues={issues}
            values={config.interfaces.management}
            onChange={(values) => update((draft) => { draft.interfaces.management = values; })}
            placeholder="ether2"
            mono
            hint="SSH/Winbox, MAC server and discovery are restricted to this list."
          />
          <TagInput
            id="if-ospf"
            label="OSPF neighbours"
            field="interfaces.ospf"
            issues={issues}
            values={config.interfaces.ospf}
            onChange={(values) => update((draft) => { draft.interfaces.ospf = values; })}
            placeholder="sfp-sfpplus1"
            mono
            hint="Optional. OSPF is accepted only on these interfaces."
          />
          <TagInput
            id="if-bfd"
            label="BFD neighbours"
            field="interfaces.bfd"
            issues={issues}
            values={config.interfaces.bfd}
            onChange={(values) => update((draft) => { draft.interfaces.bfd = values; })}
            placeholder="sfp-sfpplus1"
            mono
            hint="Optional. UDP 3784/4784 accepted on these interfaces."
          />
          <TagInput
            id="if-discovery"
            label="Discovery / MNDP interfaces"
            field="interfaces.discovery"
            issues={issues}
            values={config.interfaces.discovery}
            onChange={(values) => update((draft) => { draft.interfaces.discovery = values; })}
            placeholder="bridge"
            mono
            hint="Empty disables neighbour discovery."
          />
        </div>
      </div>

      <div className="section">
        <h3>Management access</h3>
        <TagInput
          id="mgmt-ranges"
          label="Management source ranges"
          field="management.ranges"
          issues={issues}
          values={config.management.ranges}
          onChange={(values) => update((draft) => { draft.management.ranges = values; })}
          placeholder="10.0.0.0/8"
          mono
          hint="Used for /ip service address= and the management address list. IPv6 ranges are supported."
        />
        <Checkbox
          id="mgmt-ssh"
          label="Generate SSH access to the router"
          checked={config.management.sshRouter}
          onChange={(checked) => update((draft) => { draft.management.sshRouter = checked; })}
        />
        <Checkbox
          id="mgmt-winbox"
          label="Generate Winbox access to the router"
          checked={config.management.winboxRouter}
          onChange={(checked) => update((draft) => { draft.management.winboxRouter = checked; })}
        />
        <TagInput
          id="mgmt-ssh-forward"
          label="Sources allowed to SSH through the router"
          field="management.sshForwardRanges"
          issues={issues}
          values={config.management.sshForwardRanges}
          onChange={(values) => update((draft) => { draft.management.sshForwardRanges = values; })}
          placeholder="192.0.2.0/24"
          mono
          hint="Forwarded SSH to internal clients, not SSH to the router."
        />
        <TagInput
          id="mgmt-snmp"
          label="SNMP source ranges"
          field="management.snmpServers"
          issues={issues}
          values={config.management.snmpServers}
          onChange={(values) => update((draft) => { draft.management.snmpServers = values; })}
          placeholder="10.10.0.0/16"
          mono
          hint="Empty disables SNMP input. Add an IPv6 range if you need IPv6 polling."
        />
        <TagInput
          id="mgmt-bgp-extra"
          label="Extra BGP source ranges"
          field="management.extraBgpAllowed"
          issues={issues}
          values={config.management.extraBgpAllowed}
          onChange={(values) => update((draft) => { draft.management.extraBgpAllowed = values; })}
          placeholder="203.0.113.0/24"
          mono
          hint="Peers selected elsewhere are added automatically. Use this for additional peer ranges."
        />
      </div>

      <div className="section">
        <h3>Router services</h3>
        <Checkbox
          id="mgmt-lan-dns"
          label="Router serves DNS to LAN clients"
          checked={config.management.allowLanDns}
          onChange={(checked) => update((draft) => { draft.management.allowLanDns = checked; })}
          hint="Enables /ip dns allow-remote-requests and allows UDP/TCP 53 from the LAN list."
        />
        <TagInput
          id="mgmt-dns-upstreams"
          label="Upstream DNS servers"
          field="management.dnsUpstreams"
          issues={issues}
          values={config.management.dnsUpstreams}
          onChange={(values) => update((draft) => { draft.management.dnsUpstreams = values; })}
          placeholder="1.1.1.1"
          mono
          hint="IP addresses only. Used by the router and by stateless reply rules."
        />
        <TagInput
          id="mgmt-ntp"
          label="NTP servers"
          field="management.ntpServers"
          issues={issues}
          values={config.management.ntpServers}
          onChange={(values) => update((draft) => { draft.management.ntpServers = values; })}
          placeholder="pool.ntp.org"
          mono
          hint="Hostnames or addresses. Configures /system ntp client and stateless NTP reply rules."
        />
        <Checkbox
          id="mgmt-update"
          label="Allow MikroTik update and cloud time traffic"
          checked={config.management.allowMikrotikUpdate}
          onChange={(checked) => update((draft) => { draft.management.allowMikrotikUpdate = checked; })}
          hint="Adds update.mikrotik.com and cloud.mikrotik.com to the stateless reply allowlist."
        />
      </div>
    </>
  );
}
