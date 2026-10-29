import type { CSSProperties } from 'react';

const paths = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  book: 'M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1z M12 5v15',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  chart: 'M4 3v18h17 M8 16v-4 M13 16V7 M18 16v-7',
  building: 'M4 21V4h12v17 M16 10h4v11 M8 8h4 M8 12h4 M8 16h4 M2 21h20',
  hospital: 'M5 21V4h14v17 M9 21v-5h6v5 M12 7v6 M9 10h6 M3 21h18',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  search: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M15 15l6 6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  check: 'M5 12l4 4L19 6',
  close: 'M6 6l12 12 M18 6L6 18',
  spark: 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
  target:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21v-2c0-3 3-5 8-5s8 2 8 5v2',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 11v6 M12 7h.01',
  file: 'M6 2h8l5 5v15H6z M14 2v6h5 M9 12h7 M9 16h7',
  bolt: 'M13 2L4 14h7l-1 8 10-13h-8z',
  chevron: 'M9 5l7 7-7 7',
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
