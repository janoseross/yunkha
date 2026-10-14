/** Primitive values are the source of truth; semantic tokens describe their use. */
export const primitives = {
  color: {
    ink: '#16211A',
    pine: '#223329',
    pineRaised: '#2B4133',
    forest: '#4F785B',
    forestPressed: '#42684E',
    white: '#F1F5F1',
    mist: '#B8C9BB',
    line: '#415947',
    green: '#89C49C',
    amber: '#E3B86A',
    red: '#E88985',
    redPressed: '#8B3F3B',
    redDeep: '#71322F',
    muted: '#859C8C',
    scrim: '#0A160EAA',
    transparent: '#00000000',
  },
  space: { none: 0, x1: 4, x2: 8, x3: 12, x4: 16, x5: 20, x6: 24, x8: 32, x10: 40, x12: 48 } as const,
  radius: { none: 0, small: 8, medium: 12, large: 16, pill: 999 } as const,
  borderWidth: { none: 0, hairline: 1, strong: 2 } as const,
  fontFamily: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  fontWeight: { regular: '400', medium: '500', semibold: '600', bold: '700' } as const,
  fontSize: { metadata: 11, caption: 12, label: 14, body: 16, title: 20, heading: 26, display: 36 } as const,
  lineHeight: { metadata: 16, caption: 18, label: 20, body: 24, title: 28, heading: 34, display: 44 } as const,
  letterSpacing: { tight: -0.6, normal: 0, wide: 0.4, caps: 1.2 } as const,
  iconSize: { small: 16, medium: 20, large: 24, hero: 32 } as const,
  iconStroke: { regular: 1.75, strong: 2 } as const,
} as const;

export const colors = {
  background: primitives.color.ink,
  surface: primitives.color.pine,
  surfaceElevated: primitives.color.pineRaised,
  primary: primitives.color.forest,
  primaryPressed: primitives.color.forestPressed,
  secondary: primitives.color.pineRaised,
  secondaryPressed: primitives.color.line,
  text: primitives.color.white,
  textSecondary: primitives.color.mist,
  textDisabled: primitives.color.muted,
  border: primitives.color.line,
  borderFocus: primitives.color.green,
  success: primitives.color.green,
  warning: primitives.color.amber,
  error: primitives.color.red,
  destructive: primitives.color.redPressed,
  destructivePressed: primitives.color.redDeep,
  disabled: primitives.color.line,
  overlay: primitives.color.scrim,
  transparent: primitives.color.transparent,
} as const;

export const typography = {
  display: { fontFamily: primitives.fontFamily.bold, fontSize: primitives.fontSize.display, lineHeight: primitives.lineHeight.display, letterSpacing: primitives.letterSpacing.tight },
  heading: { fontFamily: primitives.fontFamily.semibold, fontSize: primitives.fontSize.heading, lineHeight: primitives.lineHeight.heading, letterSpacing: primitives.letterSpacing.tight },
  title: { fontFamily: primitives.fontFamily.semibold, fontSize: primitives.fontSize.title, lineHeight: primitives.lineHeight.title, letterSpacing: primitives.letterSpacing.normal },
  body: { fontFamily: primitives.fontFamily.regular, fontSize: primitives.fontSize.body, lineHeight: primitives.lineHeight.body, letterSpacing: primitives.letterSpacing.normal },
  bodyMedium: { fontFamily: primitives.fontFamily.medium, fontSize: primitives.fontSize.body, lineHeight: primitives.lineHeight.body, letterSpacing: primitives.letterSpacing.normal },
  label: { fontFamily: primitives.fontFamily.semibold, fontSize: primitives.fontSize.label, lineHeight: primitives.lineHeight.label, letterSpacing: primitives.letterSpacing.wide },
  caption: { fontFamily: primitives.fontFamily.regular, fontSize: primitives.fontSize.caption, lineHeight: primitives.lineHeight.caption, letterSpacing: primitives.letterSpacing.normal },
  metadata: { fontFamily: primitives.fontFamily.medium, fontSize: primitives.fontSize.metadata, lineHeight: primitives.lineHeight.metadata, letterSpacing: primitives.letterSpacing.caps },
} as const;

export const shadows = {
  none: { shadowOpacity: 0, elevation: 0 },
  raised: { shadowColor: primitives.color.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 3 },
} as const;

export const layout = {
  screenPadding: primitives.space.x5,
  sectionGap: primitives.space.x8,
  componentGap: primitives.space.x3,
  buttonMinHeight: 48,
  inputMinHeight: 52,
  touchTarget: 48,
  contentMaxWidth: 600,
  disabledOpacity: 0.5,
  swatchMinWidth: 150,
} as const;

export const tokens = {
  colors,
  typography,
  spacing: primitives.space,
  radii: primitives.radius,
  borderWidths: primitives.borderWidth,
  shadows,
  icons: { size: primitives.iconSize, stroke: primitives.iconStroke },
  layout,
} as const;

export type TextVariant = keyof typeof typography;
export type ColorToken = keyof typeof colors;
