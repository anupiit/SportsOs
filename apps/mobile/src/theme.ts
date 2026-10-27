import { Platform } from 'react-native';

/** Proposal palette: deep navy primary, bright blue accents, terracotta warnings. */
export const colors = {
  navy: '#1e2a5a',
  navyDark: '#141c3d',
  blue: '#2f5bd3',
  blueSoft: '#e9eefc',
  terracotta: '#c8735a',
  terracottaSoft: '#fbeee9',
  terracottaDark: '#9e4f38',
  green: '#23845a',
  greenSoft: '#e5f4ec',
  amber: '#b7791f',
  amberSoft: '#fdf3e1',
  bg: '#f4f5f9',
  card: '#ffffff',
  text: '#151a2d',
  muted: '#5f6680',
  faint: '#9aa0b5',
  border: '#e1e4ee',
  white: '#ffffff',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.muted, bg: '#eceef4' },
  info: { fg: colors.blue, bg: colors.blueSoft },
  success: { fg: colors.green, bg: colors.greenSoft },
  warning: { fg: colors.amber, bg: colors.amberSoft },
  danger: { fg: colors.terracottaDark, bg: colors.terracottaSoft },
};

/** Platform monospace font (iOS has no generic 'monospace' family). */
export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
