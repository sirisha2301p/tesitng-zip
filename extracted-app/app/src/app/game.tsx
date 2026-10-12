import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { DrawerView } from '../components/game/DrawerView';
import { GameOverView } from '../components/game/GameOverView';
import { GuesserView } from '../components/game/GuesserView';
import { TurnResultView } from '../components/game/TurnResultView';
import { ConnectionBanner, Screen } from '../components/ui';
import { confirmLeave } from '../lib/confirm';
import { useGame, useMe } from '../store/game';

/** One route for the whole game; the view follows the room's phase and this player's role. */
export default function GameScreen() {
  const status = useGame((s) => s.room?.status);
  const connected = useGame((s) => s.connected);
  const leaveRoom = useGame((s) => s.leaveRoom);
  const me = useMe();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmLeave(() => void leaveRoom());
      return true;
    });
    return () => sub.remove();
  }, [leaveRoom]);

  return (
    <Screen style={{ gap: 12 }}>
      <ConnectionBanner connected={connected} />
      {status === 'playing' && (me?.isDrawer ? <DrawerView /> : <GuesserView />)}
      {status === 'intermission' && <TurnResultView />}
      {status === 'finished' && <GameOverView />}
    </Screen>
  );
}
