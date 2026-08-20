import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type JSX } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { restoreSession, signOut } from './api/session.js';
import { ComposeScreen } from './screens/ComposeScreen.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { NotificationsScreen } from './screens/NotificationsScreen.js';
import { useSession } from './hooks/useSession.js';

type Tab = 'home' | 'compose' | 'notifications';

/**
 * Top-level shell: sign-in gate, then a manual tab switcher (no react-navigation/expo-router
 * — `docs/research/expo-react-native.md` §1 confirms `blank-typescript` supports this and
 * it keeps this slice's native-dependency surface small).
 */
export default function App(): JSX.Element {
  const actor = useSession();
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>('home');

  useEffect(() => {
    void restoreSession().finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="light" />
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (actor === null) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <LoginScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.handle} numberOfLines={1}>
          @{actor.handle}
        </Text>
        <TouchableOpacity onPress={() => void signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        {tab === 'home' ? <HomeScreen /> : null}
        {tab === 'compose' ? <ComposeScreen onPosted={() => setTab('home')} /> : null}
        {tab === 'notifications' ? <NotificationsScreen /> : null}
      </View>
      <View style={styles.tabBar}>
        <TabButton label="Home" active={tab === 'home'} onPress={() => setTab('home')} />
        <TabButton label="Post" active={tab === 'compose'} onPress={() => setTab('compose')} />
        <TabButton
          label="Alerts"
          active={tab === 'notifications'}
          onPress={() => setTab('notifications')}
        />
      </View>
    </SafeAreaView>
  );
}

interface TabButtonProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function TabButton({ label, active, onPress }: TabButtonProps): JSX.Element {
  return (
    <TouchableOpacity style={styles.tabButton} onPress={onPress}>
      <Text style={active ? styles.tabLabelActive : styles.tabLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0b0c' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b0c' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2c',
  },
  handle: { color: '#fff', fontWeight: '700', flexShrink: 1 },
  signOut: { color: '#7c9cff' },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2c',
  },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabLabel: { color: '#888' },
  tabLabelActive: { color: '#fff', fontWeight: '700' },
});
