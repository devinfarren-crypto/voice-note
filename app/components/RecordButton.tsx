import { MicIcon, StopIcon } from "./icons";

// The centrepiece: a small vinyl record that spins while it's listening.
export default function RecordButton({
  on,
  disabled,
  onClick,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`rec${on ? " on" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
    >
      <span className="disc">
        <span className="label" />
      </span>
      <span className="glyph">{on ? <StopIcon size={16} /> : <MicIcon size={18} />}</span>
    </button>
  );
}
