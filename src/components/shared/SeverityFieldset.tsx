import { memo } from 'react';
import { SEVERITY_TITLES } from '../../lib/severity';
import { SEVERITIES, type Severity } from '../../lib/types';

type Props = {
  /** Unique per form: the radios of two forms must not share a group. */
  name: string;
  value: Severity | null;
  onChange: (severity: Severity) => void;
};

/** The four severity radios, none checked until the person picks one. Used by the rate and the log dialogs. */
export const SeverityFieldset = memo(function SeverityFieldset({ name, value, onChange }: Props) {
  return (
    <fieldset className="flex flex-wrap gap-4">
      <legend className="mb-1 font-medium text-fg">Severity</legend>
      {SEVERITIES.map((severity, i) => (
        <label key={severity} className="flex items-center gap-2 text-fg">
          <input
            type="radio"
            name={name}
            value={severity}
            checked={value === severity}
            onChange={() => onChange(severity)}
            autoFocus={i === 0}
          />
          {i + 1}. {SEVERITY_TITLES[severity]}
        </label>
      ))}
    </fieldset>
  );
});
