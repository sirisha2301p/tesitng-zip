import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Chip, ConnectionBanner, ErrorText, IconButton, Label, Screen } from '../components/ui';
import { serverUrl } from '../lib/server';
import { useGame } from '../store/game';
import { colors, fonts } from '../theme';

// Mirrors the limits in server/src/protocol.ts.
const TEAM_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const TURN_TIMES = [5, 10, 15, 20, 25, 30];
const ROUNDS_MIN = 1;
const ROUNDS_MAX = 10;

interface Category {
  id: string;
  name: string;
}

/** Used until (or if) the server's list arrives. */
const FALLBACK_CATEGORIES: Category[] = [{ id: 'mixed', name: 'Mixed' }];

export default function CreateRoomScreen() {
  const { createRoom, connected } = useGame();
  const [teamSize, setTeamSize] = useState(4);
  const [turnTime, setTurnTime] = useState(20);
  const [category, setCategory] = useState('mixed');
  const [rounds, setRounds] = useState(3);
  const [categories, setCategories] = useState<Category[]>(FALLBACK_CATEGORIES);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${serverUrl()}/categories`)
      .then((r) => r.json() as Promise<{ categories: Category[] }>)
      .then((data) => !cancelled && setCategories(data.categories))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const create = async () => {
    setError(null);
    setCreating(true);
    try {
      await createRoom({ teamSize, turnTime, category, rounds });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text style={styles.title} accessibilityRole="header">
          Create a room
        </Text>
      </View>
      <ConnectionBanner connected={connected} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Label>Team size</Label>
            <Text style={styles.hint}>players incl. you</Text>
          </View>
          <View style={styles.grid}>
            {TEAM_SIZES.map((n) => (
              <Chip
                key={n}
                label={String(n)}
                selected={teamSize === n}
                onPress={() => setTeamSize(n)}
                style={styles.gridCell5}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Label>Time per turn</Label>
            <Text style={styles.hint}>seconds</Text>
          </View>
          <View style={styles.row}>
            {TURN_TIMES.map((t) => (
              <Chip key={t} label={String(t)} selected={turnTime === t} onPress={() => setTurnTime(t)} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Label>Category</Label>
          <View style={styles.wrap}>
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                shape="pill"
                selected={category === c.id}
                onPress={() => setCategory(c.id)}
              />
            ))}
          </View>
        </View>

        <View style={styles.rounds}>
          <View style={{ flex: 1 }}>
            <Label>Rounds</Label>
            <Text style={styles.hint}>Everyone draws once per round</Text>
          </View>
          <View style={styles.stepper}>
            <IconButton
              icon="minus"
              label="Fewer rounds"
              onPress={() => setRounds((r) => Math.max(ROUNDS_MIN, r - 1))}
              disabled={rounds <= ROUNDS_MIN}
              style={styles.stepButton}
            />
            <Text style={styles.roundsValue} accessibilityLabel={`${rounds} rounds`}>
              {rounds}
            </Text>
            <IconButton
              icon="plus"
              label="More rounds"
              onPress={() => setRounds((r) => Math.min(ROUNDS_MAX, r + 1))}
              disabled={rounds >= ROUNDS_MAX}
              style={styles.stepButton}
            />
          </View>
        </View>
      </ScrollView>

      <ErrorText message={error} />
      <Button label="Create & invite friends" onPress={create} loading={creating} disabled={!connected} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.displaySemi, fontSize: 26, color: colors.ink },
  content: { gap: 22, paddingBottom: 8 },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  hint: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Five per row: (100% - 4 gaps) / 5
  gridCell5: { flexGrow: 0, flexBasis: '18%' },
  row: { flexDirection: 'row', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rounds: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepButton: { borderWidth: 2, borderColor: colors.border },
  roundsValue: { fontFamily: fonts.display, fontSize: 22, minWidth: 24, textAlign: 'center', color: colors.ink },
});
