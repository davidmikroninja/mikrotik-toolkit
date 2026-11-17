import { Callout, Checkbox, StepHeader, TagInput, TextInput } from './controls';
import type { StepProps } from './appTypes';

export function StepRpki({ config, update, issues }: StepProps) {
  return (
    <>
      <StepHeader
        title="RPKI"
        description="RouterOS RTR groups used by the generated input filters. Unlike the original script, the generated chains actually call rpki-verify and reject invalid routes."
      />

      <Checkbox
        id="rpki-enabled"
        label="Enable RPKI validation"
        checked={config.rpki.enabled}
        onChange={(checked) => update((draft) => { draft.rpki.enabled = checked; })}
        hint="Routes marked invalid are rejected. Unknown routes (for example, while the RTR session is down) are still accepted."
      />

      {config.rpki.enabled ? (
        <>
          <Checkbox
            id="rpki-transits"
            label="Apply RPKI to transit sessions as well as IXP sessions"
            checked={config.rpki.enforceOnTransits}
            onChange={(checked) => update((draft) => { draft.rpki.enforceOnTransits = checked; })}
            hint="Uses the first enabled group below. Transit providers may already filter invalid routes, but enforcing locally is stronger."
          />
          {config.rpki.groups.map((group, index) => (
            <article className="card" key={group.id}>
              <div className="card-heading">
                <h3>{group.label}</h3>
                <Checkbox
                  id={`rpki-${index}-enabled`}
                  label="Enabled"
                  checked={group.enabled}
                  onChange={(checked) =>
                    update((draft) => {
                      draft.rpki.groups[index].enabled = checked;
                    })
                  }
                />
              </div>
              <div className="grid three">
                <TextInput
                  id={`rpki-${index}-name`}
                  label="RouterOS group name"
                  field={`rpki.groups.${index}.groupName`}
                  issues={issues}
                  value={group.groupName}
                  onChange={(value) =>
                    update((draft) => {
                      draft.rpki.groups[index].groupName = value;
                    })
                  }
                  mono
                  hint="Must match the name used by rpki-verify."
                />
                <TextInput
                  id={`rpki-${index}-port`}
                  label="RTR port"
                  field={`rpki.groups.${index}.port`}
                  issues={issues}
                  value={group.port}
                  onChange={(value) =>
                    update((draft) => {
                      draft.rpki.groups[index].port = value;
                    })
                  }
                  inputMode="numeric"
                  mono
                  hint="Routinator commonly uses 3323; RFC 8210 default is 323."
                />
              </div>
              <TagInput
                id={`rpki-${index}-servers`}
                label="RTR servers"
                field={`rpki.groups.${index}.servers`}
                issues={issues}
                values={group.servers}
                onChange={(values) =>
                  update((draft) => {
                    draft.rpki.groups[index].servers = values;
                  })
                }
                placeholder="196.60.70.2"
                mono
                hint="Verify these are the NAP RPKI RTR endpoints, not the route-server addresses."
              />
            </article>
          ))}
        </>
      ) : (
        <Callout tone="info" title="RPKI disabled">
          The generated filters will not reject invalid routes. RPKI is the
          cheapest protection against route-origin mistakes and leaks; enable it
          if your IXP or transit offers an RTR feed.
        </Callout>
      )}
    </>
  );
}
