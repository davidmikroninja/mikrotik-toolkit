import {
  Callout,
  Checkbox,
  StepHeader,
  TagInput,
  TextInput,
} from './controls';
import type { StepProps } from './appTypes';

export function StepRouter({ config, update, issues }: StepProps) {
  return (
    <>
      <StepHeader
        title="Router & prefixes"
        description="Identity, originating prefixes and the allowed prefix-length ranges. The generator refuses to emit a default route as an owned prefix."
      />
      <div className="grid two">
        <TextInput
          id="router-name"
          label="Router name"
          field="router.name"
          issues={issues}
          value={config.router.name}
          onChange={(value) => update((draft) => { draft.router.name = value; })}
          placeholder="edge-cpt-01"
          hint="Used in comments and file names. No quotes or newlines."
        />
        <TextInput
          id="router-asn"
          label="Local ASN"
          field="router.asn"
          issues={issues}
          value={config.router.asn}
          onChange={(value) => update((draft) => { draft.router.asn = value; })}
          placeholder="64500"
          inputMode="numeric"
          mono
          hint="Your public ASN. Private and documentation ASNs produce a warning."
        />
        <TextInput
          id="router-id"
          label="BGP router ID"
          field="router.routerId"
          issues={issues}
          value={config.router.routerId}
          onChange={(value) => update((draft) => { draft.router.routerId = value; })}
          placeholder="192.0.2.1"
          mono
          hint="A stable IPv4 address, normally a loopback."
        />
        <TextInput
          id="router-version"
          label="RouterOS target"
          field="router.targetVersion"
          issues={issues}
          value={config.router.targetVersion}
          onChange={() => undefined}
          disabled
          mono
          hint="The generator emits 7.20+ syntax (afi=, not address-families)."
        />
      </div>

      <Callout tone="info" title="Prefix ranges">
        The advertised range controls the outbound filter. List every aggregate and
        more-specific you want announced; the generator adds a blackhole route for
        each entry when no route already exists.
      </Callout>

      <div className="section">
        <h3>IPv4</h3>
        <TagInput
          id="ipv4-prefixes"
          label="Originating prefixes"
          field="addressFamilies.ipv4.prefixes"
          issues={issues}
          values={config.addressFamilies.ipv4.prefixes}
          onChange={(values) => update((draft) => { draft.addressFamilies.ipv4.prefixes = values; })}
          placeholder="192.0.2.0/24"
          mono
          hint="Paste a list separated by newlines or commas. Overlaps are allowed for aggregates plus more-specifics."
        />
        <div className="grid two">
          <TextInput
            id="ipv4-lengths"
            label="Advertise prefix lengths"
            field="addressFamilies.ipv4.advertiseLengths"
            issues={issues}
            value={config.addressFamilies.ipv4.advertiseLengths}
            onChange={(value) => update((draft) => { draft.addressFamilies.ipv4.advertiseLengths = value; })}
            placeholder="22-24"
            mono
            hint="A range like 22-24, or a single length like 24."
          />
          <TextInput
            id="ipv4-reject"
            label="Reject inbound prefixes longer than"
            field="addressFamilies.ipv4.rejectLongerThan"
            issues={issues}
            value={config.addressFamilies.ipv4.rejectLongerThan}
            onChange={(value) => update((draft) => { draft.addressFamilies.ipv4.rejectLongerThan = value; })}
            placeholder="24"
            inputMode="numeric"
            mono
            hint="Empty disables the check. This is a per-input-chain policy, not a bogon filter."
          />
        </div>
      </div>

      <div className="section">
        <h3>IPv6</h3>
        <Checkbox
          id="ipv6-enabled"
          label="Configure IPv6"
          checked={config.addressFamilies.ipv6.enabled}
          onChange={(checked) => update((draft) => { draft.addressFamilies.ipv6.enabled = checked; })}
          hint="Enables IPv6 BGP objects and, unless turned off in the firewall step, IPv6 firewall rules."
        />
        {config.addressFamilies.ipv6.enabled ? (
          <>
            <TagInput
              id="ipv6-prefixes"
              label="Originating IPv6 prefixes"
              field="addressFamilies.ipv6.prefixes"
              issues={issues}
              values={config.addressFamilies.ipv6.prefixes}
              onChange={(values) => update((draft) => { draft.addressFamilies.ipv6.prefixes = values; })}
              placeholder="2001:db8::/32"
              mono
            />
            <div className="grid two">
              <TextInput
                id="ipv6-lengths"
                label="Advertise prefix lengths"
                field="addressFamilies.ipv6.advertiseLengths"
                issues={issues}
                value={config.addressFamilies.ipv6.advertiseLengths}
                onChange={(value) => update((draft) => { draft.addressFamilies.ipv6.advertiseLengths = value; })}
                placeholder="32-48"
                mono
                hint="Unlike the original script, this is configurable rather than hardcoded to /32."
              />
              <TextInput
                id="ipv6-reject"
                label="Reject inbound prefixes longer than"
                field="addressFamilies.ipv6.rejectLongerThan"
                issues={issues}
                value={config.addressFamilies.ipv6.rejectLongerThan}
                onChange={(value) => update((draft) => { draft.addressFamilies.ipv6.rejectLongerThan = value; })}
                placeholder="48"
                inputMode="numeric"
                mono
                hint="Empty disables the check."
              />
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
