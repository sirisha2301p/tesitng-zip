import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useGame } from '../../store/game';
import { brushColors, CANVAS_COLOR, colors, fonts } from '../../theme';
import { DrawingCanvas } from '../DrawingCanvas';
import { Icon } from '../Icon';
import { Button, ErrorText, IconButton } from '../ui';
import { WordImage } from '../WordImage';
import { GameHeader } from './GameHeader';

const BRUSH_WIDTH = 5;
const ERASER_WIDTH = 22;

export function DrawerView() {
  const { room, drawerWord, strokes, drawSegment, undoStroke, clearCanvas, skipWord } = useGame();
  const { height } = useWindowDimensions();
  const [color, setColor] = useState(brushColors[0]!);
  const [erasing, setErasing] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!room) return null;

  const guessers = room.players.filter((p) => !p.isDrawer);
  const guessed = guessers.filter((p) => p.hasGuessed);
  const stillGuessing = guessers.filter((p) => p.connected && !p.hasGuessed).length;
  const skipsLeft = drawerWord?.skipsLeft ?? 0;
  const canSkip = !!drawerWord && skipsLeft > 0 && guessed.length === 0;

  const skip = async () => {
    setError(null);
    setSkipping(true);
    try {
      await skipWord();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSkipping(false);
    }
  };

  return (
    <View style={styles.container}>
      <GameHeader title="Your turn to draw" />

      <View style={styles.wordCard}>
        <View style={styles.wordImage}>
          <WordImage imageUrl={drawerWord?.imageUrl ?? null} label={drawerWord?.word ?? ''} size={60} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.secretRow}>
            <Icon name="eye" size={14} color={colors.onDarkMuted} strokeWidth={2.2} />
            <Text style={styles.secret}>ONLY YOU CAN SEE THIS</Text>
          </View>
          <Text style={styles.word} numberOfLines={1} adjustsFontSizeToFit>
            {drawerWord ? drawerWord.word.toUpperCase() : 'Getting your word…'}
          </Text>
          {drawerWord && (
            <Text style={styles.meta}>
              <Text style={{ textTransform: 'capitalize' }}>{drawerWord.category}</Text> ·{' '}
              <Text style={{ textTransform: 'capitalize' }}>{drawerWord.difficulty}</Text>
            </Text>
          )}
        </View>
      </View>

      <DrawingCanvas
        strokes={strokes}
        maxSize={height * 0.45}
        tools={{
          color: erasing ? CANVAS_COLOR : color,
          width: erasing ? ERASER_WIDTH : BRUSH_WIDTH,
          onSegment: drawSegment,
        }}
      />

      <View style={styles.toolbar}>
        {brushColors.map((c) => {
          const selected = !erasing && c === color;
          return (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={`Colour ${c}`}
              accessibilityState={{ selected }}
              onPress={() => {
                setColor(c);
                setErasing(false);
              }}
              hitSlop={6}
              style={[styles.swatch, { backgroundColor: c }, selected && styles.swatchSelected]}
            />
          );
        })}
        <View style={{ flex: 1 }} />
        <IconButton
          icon="eraser"
          label="Eraser"
          onPress={() => setErasing((e) => !e)}
          style={[styles.tool, erasing && styles.toolActive]}
        />
        <IconButton icon="undo" label="Undo" onPress={undoStroke} style={styles.tool} />
        <IconButton icon="trash" label="Clear canvas" onPress={clearCanvas} style={styles.tool} />
      </View>

      <View style={styles.skipRow}>
        <Button
          label="Skip word"
          icon="skip"
          variant="outline"
          size="medium"
          onPress={skip}
          disabled={!canSkip}
          loading={skipping}
          style={!canSkip && { opacity: 0.5 }}
        />
        <Text style={styles.skipNote}>
          {guessed.length > 0
            ? 'Someone guessed it, so no more skips.'
            : `${skipsLeft} ${skipsLeft === 1 ? 'skip' : 'skips'} left. Skipped words are never shown to others.`}
        </Text>
      </View>
      <ErrorText message={error} />

      <View style={styles.statusRow}>
        {guessed.length > 0 && <Icon name="check" size={18} color={colors.green} strokeWidth={2.6} />}
        <Text style={styles.status}>
          {guessed.length > 0
            ? `${guessed.map((p) => p.name).join(', ')} guessed it! · ${stillGuessing} still guessing`
            : `${stillGuessing} ${stillGuessing === 1 ? 'player is' : 'players are'} guessing`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12 },
  wordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.ink,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  wordImage: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  secretRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  secret: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: colors.onDarkMuted },
  word: { fontFamily: fonts.display, fontSize: 28, letterSpacing: 1, color: '#FFFFFF' },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.onDarkMuted },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  swatch: { width: 26, height: 26, borderRadius: 13 },
  swatchSelected: { width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: colors.yellow },
  tool: { backgroundColor: colors.ground },
  toolActive: { backgroundColor: colors.yellow },
  skipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skipNote: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.muted, lineHeight: 17 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
});
