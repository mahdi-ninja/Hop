import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PlusIcon = (p: IconProps) => (
  <Icon strokeWidth={2.2} {...p}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);
export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="5" width="9" height="9" rx="2" />
    <path d="M11 5V4a2 2 0 00-2-2H4a2 2 0 00-2 2v5a2 2 0 002 2h1" />
  </Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M3 8.5l3.2 3L13 4.5" />
  </Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </Icon>
);
export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1" />
  </Icon>
);
export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.5 9.5A6 6 0 016.5 2.5a6 6 0 107 7z" />
  </Icon>
);
export const AutoThemeIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 2v12" />
    <path d="M8 2a6 6 0 010 12z" fill="currentColor" stroke="none" />
  </Icon>
);
export const ExternalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3h4v4M13 3L7.5 8.5M12 9.5V12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h2.5" />
  </Icon>
);
export const EditIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.5 2.5l3 3L6 13H3v-3z" />
  </Icon>
);
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4" />
  </Icon>
);
export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2v8M4.5 7L8 10.5 11.5 7M3 13h10" />
  </Icon>
);
export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 8H3M7 4L3 8l4 4" />
  </Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon strokeWidth={1.8} {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);
export const DesktopIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5" />
    <path d="M5.5 14h5M8 11v3" />
  </Icon>
);
export const MobileIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" />
    <path d="M7.25 12.25h1.5" />
  </Icon>
);
export const TabletIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" />
    <path d="M7.25 12.25h1.5" />
  </Icon>
);
export const DeviceOtherIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="1.5" y="3" width="13" height="8" rx="1.5" />
    <path d="M4 13.5h8" />
  </Icon>
);
export const BotIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="5" width="11" height="8" rx="2" />
    <path d="M8 2.5V5M6 9h.01M10 9h.01" strokeWidth={2} />
  </Icon>
);

/** The Hop logo. Brand colours are fixed so the mark looks the same in both themes. */
export function HopMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="15" fill="#0f7a61" />
      <g transform="translate(2 -4)">
        <path d="M14 46 C21 12, 43 13, 46.5 39" fill="none" stroke="#ffffff" strokeWidth="6.5" strokeLinecap="round" />
        <path d="M48 49 L52.2 37.2 L40.4 39 Z" fill="#ffffff" stroke="#ffffff" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="14" cy="46" r="7" fill="#f2a15e" />
      </g>
    </svg>
  );
}
