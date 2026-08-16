import React from 'react';

// One stroke weight, one 24x24 viewBox, sized by prop. Keeps the icon set coherent
// instead of mixing weights from different libraries.
const Icon = ({ d, size = 15, children, ...rest }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
    >
        {children || <path d={d} />}
    </svg>
);

export const TrendIcon = (p) => <Icon {...p} d="M3 17l6-6 4 4 7-8" />;
export const PlusIcon = (p) => <Icon {...p} d="M12 5v14M5 12h14" />;
export const SearchIcon = (p) => (
    <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Icon>
);
export const MoonIcon = (p) => <Icon {...p} d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />;
export const SunIcon = (p) => (
    <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4m0-14.2l-1.4 1.4M6.3 17.7l-1.4 1.4" /></Icon>
);
export const GridIcon = (p) => (
    <Icon {...p}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Icon>
);
export const ListIcon = (p) => <Icon {...p} d="M4 6h16M4 12h16M4 18h10" />;
export const StarIcon = (p) => <Icon {...p} d="M12 3l2.6 5.6 6.4.7-4.8 4.3 1.3 6.4L12 16.8 6.5 20l1.3-6.4L3 9.3l6.4-.7z" />;
export const MedalIcon = (p) => (
    <Icon {...p}><circle cx="12" cy="9" r="6" /><path d="M8.5 14.5L7 22l5-2.5L17 22l-1.5-7.5" /></Icon>
);
export const FlameIcon = (p) => <Icon {...p} d="M12 3s5 4.5 5 9a5 5 0 01-10 0c0-1.5.6-2.8 1.4-3.8C9 10.5 12 8 12 3z" />;
export const TrashIcon = (p) => <Icon {...p} d="M5 7h14M10 7V5h4v2m-7 0l1 13h8l1-13" />;
export const CheckIcon = (p) => <Icon {...p} d="M4 12l6 6L20 6" />;
export const ClockIcon = (p) => (
    <Icon {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Icon>
);
export const LockIcon = (p) => (
    <Icon {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></Icon>
);
export const CalendarIcon = (p) => (
    <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4m8-4v4" /></Icon>
);
export const UploadIcon = (p) => <Icon {...p} d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />;
export const BoltIcon = (p) => <Icon {...p} d="M13 2L4 14h6l-1 8 9-12h-6z" />;

export default Icon;
