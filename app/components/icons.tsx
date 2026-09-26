// Hand-tuned 24px line icons, drawn to match the serif/handmade feel.

type P = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const QuillIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M20 4c-6 0-11 4-13 11l-2 5" />
    <path d="M20 4c0 6-4 10-10 11" />
    <path d="M9 13h4" />
  </svg>
);

export const NoteIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6.5" cy="18" r="2.5" fill="currentColor" />
    <circle cx="17.5" cy="16" r="2.5" fill="currentColor" />
  </svg>
);

export const MicIcon = ({ size = 22 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}>
    <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);

export const StopIcon = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" />
  </svg>
);

export const PlayIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </svg>
);

export const PauseIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

export const MailIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </svg>
);

export const ShareIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M12 15V3M8 7l4-4 4 4" />
    <path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
  </svg>
);

export const SaveIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h7V4M8 20v-6h8v6" />
  </svg>
);

export const TrashIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

export const CopyIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);

export const RedoIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4" />
  </svg>
);

export const StackIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="m12 3 9 5-9 5-9-5z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

export const GiftIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="9" width="18" height="12" rx="1.5" />
    <path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1.5S12 9 12 9zm0 0c2-4 6-4 6-1.5S12 9 12 9z" />
  </svg>
);
