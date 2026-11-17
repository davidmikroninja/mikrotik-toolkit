import type { ForwardPolicy, InputPolicy, Ipv6Mode, NdMode, RouterService } from '../generator/types';
import {
  Callout,
  Checkbox,
  SelectInput,
  StepHeader,
  TextInput,
} from './controls';
import type { StepProps } from './appTypes';

const STATELESS_SERVICES: Array<{ value: RouterService; label: string; hint: string }> = [
  { value: 'dns', label: 'DNS replies', hint: 'From the configured upstream resolvers, source port 53.' },
  { value: 'ntp', label: 'NTP replies', hint: 'From the configured NTP servers, source port 123.' },
  { value: 'mikrotik-update', label: 'MikroTik update/cloud', hint: 'TCP 80/443 from update.mikrotik.com and cloud.mikrotik.com.' },
  { value: 'ssh-client', label: 'Outbound SSH client', hint: 'Best-effort: accepts source port 22 to high local ports. Not exact without conntrack.' },
  { value: 'smtp', label: 'Outbound SMTP client', hint: 'Accepts source port 25 to high local ports.' },
  { value: 'syslog', label: 'Outbound syslog', hint: 'One-way UDP; no reply rule is needed.' },
  { value: 'snmp-traps', label: 'Outbound SNMP traps', hint: 'One-way UDP; no reply rule is needed.' },
];

export function StepFirewall({ config, update, issues }: StepProps) {
  const firewall = config.firewall;
  const toggleService = (service: RouterService, checked: boolean) => {
    update((draft) => {
      const values = draft.firewall.statelessRouterServices;
      if (checked) {
        if (!values.includes(service)) values.push(service);
      } else {
        draft.firewall.statelessRouterServices = values.filter((item) => item !== service);
      }
    });
  };

  return (
    <>
      <StepHeader
        title="Firewall policy"
        description="Stateful filtering is the default and supports NAT. Stateless mode disables connection tracking for DoS resistance and cannot support NAT or stateful matches."
      />

      <Callout tone="info" title="Staged default-deny">
        The default-drop rules are generated disabled. They are enabled only by
        90-finalize.rsc, after you have verified management access and BGP.
      </Callout>

      <div className="section">
        <h3>Mode</h3>
        <div className="grid two">
          <SelectInput
            id="fw-mode"
            label="Firewall mode"
            field="firewall.mode"
            issues={issues}
            value={firewall.mode}
            onChange={(value) =>
              update((draft) => {
                draft.firewall.mode = value as 'stateful' | 'stateless';
              })
            }
            options={[
              { value: 'stateful', label: 'Stateful (conntrack, supports NAT)' },
              { value: 'stateless', label: 'Stateless (no conntrack, no NAT)' },
            ]}
          />
          <SelectInput
            id="fw-input"
            label="Input default policy"
            field="firewall.inputPolicy"
            issues={issues}
            value={firewall.inputPolicy}
            onChange={(value) =>
              update((draft) => {
                draft.firewall.inputPolicy = value as InputPolicy;
              })
            }
            options={[
              { value: 'drop', label: 'Drop (default deny)' },
              { value: 'accept', label: 'Accept (advisory rules only)' },
            ]}
          />
          <SelectInput
            id="fw-forward"
            label="Forward default policy"
            field="firewall.forwardPolicy"
            issues={issues}
            value={firewall.forwardPolicy}
            onChange={(value) =>
              update((draft) => {
                draft.firewall.forwardPolicy = value as ForwardPolicy;
              })
            }
            options={[
              { value: 'accept', label: 'Accept (routing edge)' },
              { value: 'drop', label: 'Drop (host/edge with no transit)' },
            ]}
          />
          <SelectInput
            id="fw-ipv6"
            label="IPv6 firewall"
            field="firewall.ipv6Mode"
            issues={issues}
            value={firewall.ipv6Mode}
            onChange={(value) =>
              update((draft) => {
                draft.firewall.ipv6Mode = value as Ipv6Mode;
              })
            }
            options={[
              { value: 'mirror', label: 'Mirror IPv4 input and forward policy' },
              { value: 'input-only', label: 'Input only (no forward filtering)' },
              { value: 'off', label: 'Off (IPv6 unfiltered)' },
            ]}
          />
          <SelectInput
            id="fw-nd"
            label="IPv6 neighbour discovery"
            field="firewall.ndMode"
            issues={issues}
            value={firewall.ndMode}
            onChange={(value) =>
              update((draft) => {
                draft.firewall.ndMode = value as NdMode;
              })
            }
            options={[
              { value: 'unchanged', label: 'Leave unchanged' },
              { value: 'disable-wan', label: 'Disable on WAN interfaces' },
            ]}
          />
          <TextInput
            id="fw-icmp"
            label="ICMP rate limit (ms)"
            field="firewall.icmpRateLimitMs"
            issues={issues}
            value={firewall.icmpRateLimitMs}
            onChange={(value) => update((draft) => { draft.firewall.icmpRateLimitMs = value; })}
            inputMode="numeric"
            mono
            hint="Kernel minimum spacing between ICMP responses. Empty leaves it unchanged."
          />
        </div>
      </div>

      <div className="section">
        <h3>Router services that terminate here</h3>
        <Checkbox
          id="fw-dhcp"
          label="DHCP server on the LAN"
          checked={firewall.allowDhcpServer}
          onChange={(checked) => update((draft) => { draft.firewall.allowDhcpServer = checked; })}
          hint="Without this, a default-deny input policy breaks DHCP for LAN clients."
        />
        {config.addressFamilies.ipv6.enabled ? (
          <Checkbox
            id="fw-dhcpv6"
            label="DHCPv6 server on the LAN"
            checked={firewall.allowDhcpv6Server}
            onChange={(checked) => update((draft) => { draft.firewall.allowDhcpv6Server = checked; })}
            hint="Allows UDP 547 from the LAN list."
          />
        ) : null}
        <Checkbox
          id="fw-vrrp"
          label="VRRP (IP protocol 112)"
          checked={firewall.allowVrrp}
          onChange={(checked) => update((draft) => { draft.firewall.allowVrrp = checked; })}
          hint="Allows VRRP to the 224.0.0.18 / ff02::12 multicast groups."
        />
        <div className="grid two">
          <TextInput
            id="fw-extra-tcp"
            label="Extra TCP ports to the router"
            field="firewall.extraInputTcp"
            issues={issues}
            value={firewall.extraInputTcp}
            onChange={(value) => update((draft) => { draft.firewall.extraInputTcp = value; })}
            placeholder="500,4500,1194"
            mono
            hint="Comma-separated ports/ranges. Accepted from every interface; restrict manually if needed."
          />
          <TextInput
            id="fw-extra-udp"
            label="Extra UDP ports to the router"
            field="firewall.extraInputUdp"
            issues={issues}
            value={firewall.extraInputUdp}
            onChange={(value) => update((draft) => { draft.firewall.extraInputUdp = value; })}
            placeholder="500,4500,51820"
            mono
            hint="Use this for IPsec, WireGuard, L2TP and other services that terminate on the router."
          />
        </div>
      </div>

      <div className="section">
        <h3>Hardening options</h3>
        <Checkbox
          id="fw-log"
          label="Log drops"
          checked={firewall.logDrops}
          onChange={(checked) => update((draft) => { draft.firewall.logDrops = checked; })}
          hint="Adds log=yes and a log-prefix to the default-drop rules. Monitor the log rate."
        />
        {firewall.mode === 'stateless' ? (
          <Checkbox
            id="fw-amp"
            label="Drop common amplification ports on the WAN"
            checked={firewall.dropAmplificationPorts}
            onChange={(checked) => update((draft) => { draft.firewall.dropAmplificationPorts = checked; })}
            hint="UDP 19, 137-139, 445, 1900, 389, 5000, 10001, 11211 and TCP 137-139/445."
          />
        ) : null}
        <Checkbox
          id="fw-alg"
          label="Disable all firewall service-port helpers"
          checked={firewall.disableServicePorts}
          onChange={(checked) => update((draft) => { draft.firewall.disableServicePorts = checked; })}
          hint="Recommended unless you need SIP/H.323/FTP ALGs."
        />
      </div>

      {firewall.mode === 'stateless' ? (
        <div className="section">
          <h3>Stateless reply services</h3>
          <Callout tone="warning" title="Stateless has no established/related match">
            Only the selected router-originated services are allowed back in.
            Any other outbound TCP session that terminates on the router can be
            dropped by the final default-deny.
          </Callout>
          {STATELESS_SERVICES.map((service) => (
            <Checkbox
              key={service.value}
              id={`fw-service-${service.value}`}
              label={service.label}
              checked={firewall.statelessRouterServices.includes(service.value)}
              onChange={(checked) => toggleService(service.value, checked)}
              hint={service.hint}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
