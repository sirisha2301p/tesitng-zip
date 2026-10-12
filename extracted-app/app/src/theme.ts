/** Colours and type from the reference mockups. */
export const colors = {
  ground: '#F3F6EE',
  card: '#FFFFFF',
  ink: '#1E2B22',
  muted: '#5A665D',
  border: '#DCE3D6',
  dashed: '#B9C4B4',
  green: '#23704A',
  greenDark: '#174F33',
  greenTint: '#E3F0E7',
  yellow: '#F2B33D',
  disabled: '#C9D4C4',
  disabledText: '#3E4A41',
  onDarkMuted: '#C9D4C4',
  darkDivider: '#3A4A3E',
  closeText: '#8A5A00',
  danger: '#B4462B',
};

export const fonts = {
  display: 'Fredoka_700Bold',
  displaySemi: 'Fredoka_600SemiBold',
  body: 'Nunito_400Regular',
  bodySemi: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
  bodyHeavy: 'Nunito_800ExtraBold',
};

/** Brush colours offered to the drawer. The last entry is the canvas colour, used by the eraser. */
export const brushColors = ['#1E2B22', '#C8402A', '#2F5DA8', '#23704A', '#F2B33D', '#8B4FB8', '#8A5A2B'];
export const CANVAS_COLOR = '#FFFFFF';

const avatarColors = ['#F2B33D', '#9CC7E8', '#E8A99C', '#B9D99A', '#D7B8E8', '#F5C9A0', '#A9DCD3', '#E8D29C', '#C3C9F0', '#F0B3C8'];

/** A stable avatar colour for a player, based on their position in the room. */
export function avatarColor(index: number): string {
  return avatarColors[index % avatarColors.length]!;
}
