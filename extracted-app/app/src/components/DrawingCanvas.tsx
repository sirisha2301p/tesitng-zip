import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { StrokeSegment } from '@protocol';
import type { Stroke } from '../store/game';
import { CANVAS_COLOR, colors } from '../theme';

/** Brush widths are relative to a 360px-wide canvas so lines look the same on every screen. */
const REFERENCE_WIDTH = 360;
/** How often the drawer's points are sent while drawing. */
const FLUSH_MS = 40;
/** Ignore movements smaller than this (fraction of the canvas) to keep messages small. */
const MIN_STEP = 0.003;

export interface DrawingTools {
  color: string;
  width: number;
  onSegment(segment: StrokeSegment): void;
}

interface ActiveStroke {
  id: string;
  color: string;
  width: number;
  pending: [number, number][];
  last: [number, number];
}

let strokeCounter = 0;
const newStrokeId = () => `${Date.now().toString(36)}-${(strokeCounter++).toString(36)}`;
const clamp01 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;

/**
 * A square canvas. Everyone sees the same picture because points are stored
 * as fractions of the canvas size. Pass `tools` to let this player draw.
 */
export function DrawingCanvas({ strokes, tools, maxSize }: { strokes: Stroke[]; tools?: DrawingTools; maxSize?: number }) {
  const [size, setSize] = useState(0);
  const sizeRef = useRef(0);
  const onSegmentRef = useRef(tools?.onSegment);
  const active = useRef<ActiveStroke | null>(null);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const canDraw = !!tools;

  useLayoutEffect(() => {
    onSegmentRef.current = tools?.onSegment;
  });

  const flush = () => {
    const stroke = active.current;
    if (!stroke || !stroke.pending.length) return;
    onSegmentRef.current?.({ strokeId: stroke.id, color: stroke.color, width: stroke.width, points: stroke.pending });
    stroke.pending = [];
  };

  const endStroke = () => {
    flush();
    active.current = null;
    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = null;
  };

  // Stop any stroke in progress when this player stops drawing or the canvas goes away.
  useEffect(() => {
    if (!canDraw) return;
    return () => {
      if (flushTimer.current) clearInterval(flushTimer.current);
      flushTimer.current = null;
      active.current = null;
    };
  }, [canDraw]);

  const pointFrom = (e: GestureResponderEvent): [number, number] | null => {
    const s = sizeRef.current;
    if (!s) return null;
    return [clamp01(e.nativeEvent.locationX / s), clamp01(e.nativeEvent.locationY / s)];
  };

  const onGrant = (e: GestureResponderEvent) => {
    const p = pointFrom(e);
    if (!tools || !p) return;
    active.current = { id: newStrokeId(), color: tools.color, width: tools.width, pending: [p], last: p };
    flush();
    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = setInterval(flush, FLUSH_MS);
  };

  const onMove = (e: GestureResponderEvent) => {
    const stroke = active.current;
    const p = pointFrom(e);
    if (!stroke || !p) return;
    if (Math.abs(p[0] - stroke.last[0]) < MIN_STEP && Math.abs(p[1] - stroke.last[1]) < MIN_STEP) return;
    stroke.pending.push(p);
    stroke.last = p;
    if (stroke.pending.length >= 200) flush();
  };

  const scale = size / REFERENCE_WIDTH;

  return (
    <View
      style={[styles.canvas, maxSize ? { maxWidth: maxSize } : null]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        sizeRef.current = w;
        setSize(w);
      }}
      accessibilityLabel={canDraw ? 'Drawing area. Draw with your finger.' : 'The drawing'}
      onStartShouldSetResponder={() => canDraw}
      onMoveShouldSetResponder={() => canDraw}
      onResponderTerminationRequest={() => false}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
      onResponderRelease={endStroke}
      onResponderTerminate={endStroke}
    >
      {size > 0 && (
        <Svg width={size} height={size} pointerEvents="none">
          {strokes.map((s) => {
            const w = Math.max(1, s.width * scale);
            if (s.points.length === 1) {
              const [x, y] = s.points[0]!;
              return <Circle key={s.id} cx={x * size} cy={y * size} r={w / 2} fill={s.color} />;
            }
            const d = s.points.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * size).toFixed(1)} ${(y * size).toFixed(1)}`).join(' ');
            return (
              <Path
                key={s.id}
                d={d}
                stroke={s.color}
                strokeWidth={w}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            );
          })}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: '100%',
    aspectRatio: 1,
    alignSelf: 'center',
    backgroundColor: CANVAS_COLOR,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
