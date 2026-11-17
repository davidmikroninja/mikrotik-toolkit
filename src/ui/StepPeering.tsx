import { FABRICS, peerGroupsForFabric, type PeerGroup } from '../generator/catalog';
import { newCustomPeer } from '../generator/defaults';
import type { FabricId } from '../generator/types';
import { Callout, Checkbox, SelectInput, StepHeader, TextInput } from './controls';
import type { StepProps } from './appTypes';

function PeerGroupRow({
  group,
  selected,
  onToggle,
}: {
  group: PeerGroup;
  selected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <label className="peer-row">
      <input type="checkbox" checked={selected} onChange={(event) => onToggle(event.target.checked)} />
      <span>
        <strong>{group.name}</strong>
        <span className="muted"> AS{group.asn}</span>
        <span className="peer-addresses mono">
          {group.sessions.map((session) => `${session.label}: ${session.v4} / ${session.v6}`).join('  ·  ')}
        </span>
      </span>
    </label>
  );
}

export function StepPeering({ config, update, issues }: StepProps) {
  const toggleGroup = (fabric: FabricId, id: string, checked: boolean) => {
    update((draft) => {
      const selected = draft.peering[fabric].bilaterals;
      if (checked) {
        if (!selected.includes(id)) selected.push(id);
      } else {
        draft.peering[fabric].bilaterals = selected.filter((item) => item !== id);
      }
    });
  };

  return (
    <>
      <StepHeader
        title="Peering"
        description="IXP route servers and bilateral sessions. Route-server sessions are usually safe to enable; bilateral sessions are opt-in and should only be enabled with an agreed relationship."
      />

      <Callout tone="warning" title="Bilateral peers are not automatic">
        The original script shipped every bilateral session disabled. Selecting a
        peer here generates an enabled session. Confirm the agreement, the remote
        ASN and the addresses before importing.
      </Callout>

      {(['ct', 'jb'] as const).map((fabric) => {
        const data = FABRICS[fabric];
        const selection = config.peering[fabric];
        return (
          <article className="card" key={fabric}>
            <div className="card-heading">
              <h3>{data.label}</h3>
              <span className="muted mono">{data.rpkiGroup}</span>
            </div>
            <Checkbox
              id={`peer-${fabric}-rs`}
              label="Enable route-server sessions"
              checked={selection.routeServers}
              onChange={(checked) =>
                update((draft) => {
                  draft.peering[fabric].routeServers = checked;
                })
              }
              hint={`${data.routeServers.length} sessions: ${data.routeServers
                .map((session) => `${session.label} ${session.v4}`)
                .join(', ')}`}
            />
            <h4>Bilateral peers</h4>
            <div className="peer-list">
              {peerGroupsForFabric(fabric).map((group) => (
                <PeerGroupRow
                  key={group.id}
                  group={group}
                  selected={selection.bilaterals.includes(group.id)}
                  onToggle={(checked) => toggleGroup(fabric, group.id, checked)}
                />
              ))}
            </div>
          </article>
        );
      })}

      <article className="card">
        <div className="card-heading">
          <h3>Custom peers</h3>
          <button
            type="button"
            className="button small"
            onClick={() =>
              update((draft) => {
                draft.peering.customPeers.push(newCustomPeer('ct'));
              })
            }
          >
            Add custom peer
          </button>
        </div>
        {config.peering.customPeers.length === 0 ? (
          <p className="muted">No custom peers. Use this for private interconnects or a peer not in the catalog.</p>
        ) : null}
        {config.peering.customPeers.map((peer, index) => (
          <div className="card inset" key={peer.id}>
            <div className="card-heading">
              <h4>Custom peer {index + 1}</h4>
              <button
                type="button"
                className="button danger small"
                onClick={() =>
                  update((draft) => {
                    draft.peering.customPeers.splice(index, 1);
                  })
                }
              >
                Remove
              </button>
            </div>
            <div className="grid three">
              <TextInput
                id={`custom-${index}-name`}
                label="Name"
                field={`peering.customPeers.${index}.name`}
                issues={issues}
                value={peer.name}
                onChange={(value) =>
                  update((draft) => {
                    draft.peering.customPeers[index].name = value;
                  })
                }
                placeholder="private-peer"
                mono
              />
              <SelectInput
                id={`custom-${index}-fabric`}
                label="Fabric"
                field={`peering.customPeers.${index}.fabric`}
                issues={issues}
                value={peer.fabric}
                onChange={(value) =>
                  update((draft) => {
                    draft.peering.customPeers[index].fabric = value as FabricId;
                  })
                }
                options={[
                  { value: 'ct', label: 'NAP Cape Town' },
                  { value: 'jb', label: 'NAP Johannesburg' },
                ]}
              />
              <TextInput
                id={`custom-${index}-asn`}
                label="Remote ASN"
                field={`peering.customPeers.${index}.asn`}
                issues={issues}
                value={peer.asn}
                onChange={(value) =>
                  update((draft) => {
                    draft.peering.customPeers[index].asn = value;
                  })
                }
                inputMode="numeric"
                mono
              />
              <TextInput
                id={`custom-${index}-v4`}
                label="Peer IPv4 address"
                field={`peering.customPeers.${index}.v4`}
                issues={issues}
                value={peer.v4}
                onChange={(value) =>
                  update((draft) => {
                    draft.peering.customPeers[index].v4 = value;
                  })
                }
                mono
              />
              <TextInput
                id={`custom-${index}-v6`}
                label="Peer IPv6 address"
                field={`peering.customPeers.${index}.v6`}
                issues={issues}
                value={peer.v6}
                onChange={(value) =>
                  update((draft) => {
                    draft.peering.customPeers[index].v6 = value;
                  })
                }
                mono
              />
              <TextInput
                id={`custom-${index}-pref`}
                label="Local preference"
                field={`peering.customPeers.${index}.localPref`}
                issues={issues}
                value={peer.localPref}
                onChange={(value) =>
                  update((draft) => {
                    draft.peering.customPeers[index].localPref = value;
                  })
                }
                inputMode="numeric"
                mono
              />
              <TextInput
                id={`custom-${index}-max-v4`}
                label="Max IPv4 prefixes"
                field={`peering.customPeers.${index}.maxPrefixesV4`}
                issues={issues}
                value={peer.maxPrefixesV4}
                onChange={(value) =>
                  update((draft) => {
                    draft.peering.customPeers[index].maxPrefixesV4 = value;
                  })
                }
                inputMode="numeric"
                mono
              />
              <TextInput
                id={`custom-${index}-max-v6`}
                label="Max IPv6 prefixes"
                field={`peering.customPeers.${index}.maxPrefixesV6`}
                issues={issues}
                value={peer.maxPrefixesV6}
                onChange={(value) =>
                  update((draft) => {
                    draft.peering.customPeers[index].maxPrefixesV6 = value;
                  })
                }
                inputMode="numeric"
                mono
              />
            </div>
          </div>
        ))}
      </article>

      <details className="details">
        <summary>Advanced routing priorities</summary>
        <p className="hint">
          Lower local preference is less preferred. The defaults keep IXP routes
          ahead of transit, with Cape Town ahead of Johannesburg and bilaterals
          least preferred. These values are used for the generated chains.
        </p>
        <div className="grid four">
          <TextInput
            id="prio-transit-default"
            label="Transit default"
            field="priorities.transitDefault"
            issues={issues}
            value={config.priorities.transitDefault}
            onChange={(value) => update((draft) => { draft.priorities.transitDefault = value; })}
            inputMode="numeric"
            mono
          />
          <TextInput
            id="prio-transit-backup-default"
            label="Backup transit default"
            field="priorities.transitBackupDefault"
            issues={issues}
            value={config.priorities.transitBackupDefault}
            onChange={(value) => update((draft) => { draft.priorities.transitBackupDefault = value; })}
            inputMode="numeric"
            mono
          />
          <TextInput
            id="prio-transit-routes"
            label="Transit routes"
            field="priorities.transitRoutes"
            issues={issues}
            value={config.priorities.transitRoutes}
            onChange={(value) => update((draft) => { draft.priorities.transitRoutes = value; })}
            inputMode="numeric"
            mono
          />
          <TextInput
            id="prio-transit-backup-routes"
            label="Backup transit routes"
            field="priorities.transitBackupRoutes"
            issues={issues}
            value={config.priorities.transitBackupRoutes}
            onChange={(value) => update((draft) => { draft.priorities.transitBackupRoutes = value; })}
            inputMode="numeric"
            mono
          />
          <TextInput
            id="prio-nap-ct"
            label="NAP CT routes"
            field="priorities.napCt"
            issues={issues}
            value={config.priorities.napCt}
            onChange={(value) => update((draft) => { draft.priorities.napCt = value; })}
            inputMode="numeric"
            mono
          />
          <TextInput
            id="prio-nap-jb"
            label="NAP JB routes"
            field="priorities.napJb"
            issues={issues}
            value={config.priorities.napJb}
            onChange={(value) => update((draft) => { draft.priorities.napJb = value; })}
            inputMode="numeric"
            mono
          />
          <TextInput
            id="prio-blp-ct"
            label="Bilateral CT routes"
            field="priorities.blpCt"
            issues={issues}
            value={config.priorities.blpCt}
            onChange={(value) => update((draft) => { draft.priorities.blpCt = value; })}
            inputMode="numeric"
            mono
          />
          <TextInput
            id="prio-blp-jb"
            label="Bilateral JB routes"
            field="priorities.blpJb"
            issues={issues}
            value={config.priorities.blpJb}
            onChange={(value) => update((draft) => { draft.priorities.blpJb = value; })}
            inputMode="numeric"
            mono
          />
        </div>
      </details>
    </>
  );
}
