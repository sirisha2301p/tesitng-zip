import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'back'
  | 'plus'
  | 'minus'
  | 'share'
  | 'copy'
  | 'eye'
  | 'eraser'
  | 'undo'
  | 'trash'
  | 'skip'
  | 'check'
  | 'send'
  | 'pencil';

/** Stroke icons drawn to match the mockups. */
export function Icon({ name, size = 22, color = 'currentColor', strokeWidth = 2 }: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const common = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'back' && <Path d="M15 18l-6-6 6-6" {...common} />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...common} />}
      {name === 'minus' && <Path d="M5 12h14" {...common} />}
      {name === 'share' && (
        <>
          <Circle cx={18} cy={5} r={3} {...common} />
          <Circle cx={6} cy={12} r={3} {...common} />
          <Circle cx={18} cy={19} r={3} {...common} />
          <Path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" {...common} />
        </>
      )}
      {name === 'copy' && (
        <>
          <Rect x={9} y={9} width={12} height={12} rx={2} {...common} />
          <Path d="M5 15V5a2 2 0 0 1 2-2h10" {...common} />
        </>
      )}
      {name === 'eye' && (
        <>
          <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" {...common} />
          <Circle cx={12} cy={12} r={3} {...common} />
        </>
      )}
      {name === 'eraser' && <Path d="M7 21h10M3.5 14.5 13 5a2 2 0 0 1 3 0l3 3a2 2 0 0 1 0 3l-8 8H8Z" {...common} />}
      {name === 'undo' && <Path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" {...common} />}
      {name === 'trash' && <Path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" {...common} />}
      {name === 'skip' && <Path d="M5 4l10 8-10 8ZM19 5v14" {...common} />}
      {name === 'check' && <Path d="M5 12l5 5 9-10" {...common} />}
      {name === 'send' && <Path d="M5 12h14M13 6l6 6-6 6" {...common} />}
      {name === 'pencil' && <Path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" {...common} />}
    </Svg>
  );
}
