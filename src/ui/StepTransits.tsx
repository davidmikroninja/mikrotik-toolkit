import { newTransit } from '../generator/defaults';
import type { TransitKind } from '../generator/types';
import { Callout, Checkbox, SelectInput, StepHeader, TextInput } from './controls';
import type { StepProps } from './appTypes';

function addTransit(update: StepProps['update'], kind: TransitKind) {
  update((draft) => {
    draft.transits.push(newTransit(kind));
  });
}

export function StepTransits({ config, update, issues }: StepProps) {
  return (
    <>
      <StepHeader
        title="Transits"
        description="Upstream providers. A primary transit normally receives a default route; a backup transit can receive one at lower preference and announces with an AS-path prepend."
      />

      {config.transits.length === 0 ? (
        <Callout tone="info" title="No transits yet">
          Add at least one transit if this router has upstream connectivity. A
          firewall-only or IXP-only router can skip this step.
        </Callout>
      ) : null}

      {config.transits.map((transit, index) => (
        <article className="card" key={transit.id}>
          <div className="card-heading">
            <h3>
              Transit {index + 1}
              {transit.name ? <span className="muted"> — {transit.name}</span> : null}
            </h3>
            <button
              type="button"
              className="button danger small"
              onClick={() => update((draft) => { draft.transits.splice(index, 1); })}
            >
              Remove
            </button>
          </div>
          <div className="grid three">
            <TextInput
              id={`transit-${index}-name`}
              label="Name"
              field={`transits.${index}.name`}
              issues={issues}
              value={transit.name}
              onChange={(value) => update((draft) => { draft.transits[index].name = value; })}
              placeholder="ipt-primary"
              mono
              hint="Letters, digits, dot, underscore, hyphen."
            />
            <SelectInput
              id={`transit-${index}-kind`}
              label="Transit type"
              field={`transits.${index}.kind`}
              issues={issues}
              value={transit.kind}
              onChange={(value) =>
                update((draft) => {
                  const item = draft.transits[index];
                  const previous = item.kind;
                  item.kind = value as TransitKind;
                  if (previous !== item.kind) {
                    if (item.kind === 'backup') {
                      if (item.defaultLocalPref === '110') item.defaultLocalPref = '100';
                      if (item.routesLocalPref === '130') item.routesLocalPref = '120';
                    } else {
                      if (item.defaultLocalPref === '100') item.defaultLocalPref = '110';
                      if (item.routesLocalPref === '120') item.routesLocalPref = '130';
                    }
                  }
                })
              }
              options={[
                { value: 'primary', label: 'Primary transit' },
                { value: 'backup', label: 'Backup transit (prepend AS3)' },
              ]}
            />
            <SelectInput
              id={`transit-${index}-role`}
              label="Remote role"
              field={`transits.${index}.role`}
              issues={issues}
              value={transit.role}
              onChange={(value) =>
                update((draft) => {
                  draft.transits[index].role = value as 'customer' | 'provider';
                })
              }
              options={[
                { value: 'customer', label: 'They are my provider (I am the customer)' },
                { value: 'provider', label: 'I am their provider' },
              ]}
            />
            <TextInput
              id={`transit-${index}-asn`}
              label="Remote ASN"
              field={`transits.${index}.asn`}
              issues={issues}
              value={transit.asn}
              onChange={(value) => update((draft) => { draft.transits[index].asn = value; })}
              placeholder="64501"
              inputMode="numeric"
              mono
            />
            <TextInput
              id={`transit-${index}-v4`}
              label="Peer IPv4 address"
              field={`transits.${index}.v4`}
              issues={issues}
              value={transit.v4}
              onChange={(value) => update((draft) => { draft.transits[index].v4 = value; })}
              placeholder="203.0.113.1"
              mono
            />
            <TextInput
              id={`transit-${index}-v6`}
              label="Peer IPv6 address"
              field={`transits.${index}.v6`}
              issues={issues}
              value={transit.v6}
              onChange={(value) => update((draft) => { draft.transits[index].v6 = value; })}
              placeholder="2001:db8:ffff::1 (optional)"
              mono
            />
          </div>
          <Checkbox
            id={`transit-${index}-default`}
            label="Accept a default route from this transit"
            checked={transit.defaultRoute}
            onChange={(checked) =>
              update((draft) => {
                draft.transits[index].defaultRoute = checked;
              })
            }
            hint="When off, the bogon filter rejects 0.0.0.0/0 and ::/0 from this peer."
          />
          <div className="grid four">
            <TextInput
              id={`transit-${index}-default-pref`}
              label="Default-route local pref"
              field={`transits.${index}.defaultLocalPref`}
              issues={issues}
              value={transit.defaultLocalPref}
              onChange={(value) =>
                update((draft) => {
                  draft.transits[index].defaultLocalPref = value;
                })
              }
              inputMode="numeric"
              mono
            />
            <TextInput
              id={`transit-${index}-routes-pref`}
              label="Other routes local pref"
              field={`transits.${index}.routesLocalPref`}
              issues={issues}
              value={transit.routesLocalPref}
              onChange={(value) =>
                update((draft) => {
                  draft.transits[index].routesLocalPref = value;
                })
              }
              inputMode="numeric"
              mono
            />
            <TextInput
              id={`transit-${index}-max-v4`}
              label="Max IPv4 prefixes"
              field={`transits.${index}.maxPrefixesV4`}
              issues={issues}
              value={transit.maxPrefixesV4}
              onChange={(value) =>
                update((draft) => {
                  draft.transits[index].maxPrefixesV4 = value;
                })
              }
              inputMode="numeric"
              mono
              hint="Guardrail against a full table. Empty uses 1,500,000."
            />
            <TextInput
              id={`transit-${index}-max-v6`}
              label="Max IPv6 prefixes"
              field={`transits.${index}.maxPrefixesV6`}
              issues={issues}
              value={transit.maxPrefixesV6}
              onChange={(value) =>
                update((draft) => {
                  draft.transits[index].maxPrefixesV6 = value;
                })
              }
              inputMode="numeric"
              mono
              hint="Empty uses 300,000."
            />
          </div>
        </article>
      ))}

      <div className="button-row">
        <button type="button" className="button" onClick={() => addTransit(update, 'primary')}>
          Add primary transit
        </button>
        <button type="button" className="button secondary" onClick={() => addTransit(update, 'backup')}>
          Add backup transit
        </button>
      </div>
    </>
  );
}
