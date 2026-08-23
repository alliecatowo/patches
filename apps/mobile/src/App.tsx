import type { Post } from '@patches/proto/es';
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
import { composeTargetKey } from './compose/draft.js';
import { ComposeScreen, type ComposeTarget } from './screens/ComposeScreen.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { NotificationsScreen } from './screens/NotificationsScreen.js';
import { RegisterScreen } from './screens/RegisterScreen.js';
import { useSession } from './hooks/useSession.js';

type Tab = 'home' | 'compose' | 'notifications';
type AuthView = 'login' | 'register';

/**
 * Top-level shell: sign-in gate, then a manual tab switcher (no react-navigation/expo-router
 * — `docs/research/expo-react-native.md` §1 confirms `blank-typescript` supports this and
 * it keeps this slice's native-dependency surface small).
 */
export default function App(): JSX.Element {
  const actor = useSession();
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>('home');
  const [authView, setAuthView] = useState<AuthView>('login');
  const [composeTarget, setComposeTarget] = useState<ComposeTarget>({ kind: 'post' });

  const openCompose = (nextTarget: ComposeTarget): void => {
    setComposeTarget(nextTarget);
    setTab('compose');
  };

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
        {authView === 'login' ? (
          <LoginScreen onSwitchToRegister={() => setAuthView('register')} />
        ) : (
          <RegisterScreen onSwitchToLogin={() => setAuthView('login')} />
        )}
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
        {tab === 'home' ? (
          <HomeScreen
            viewerActorId={actor.id}
            onReply={(post: Post) => openCompose({ kind: 'reply', replyTo: post })}
            onQuote={(post: Post) => openCompose({ kind: 'quote', quote: post })}
            onEdit={(post: Post) => openCompose({ kind: 'edit', editing: post })}
          />
        ) : null}
        {tab === 'compose' ? (
          <ComposeScreen
            key={composeTargetKey(composeTarget)}
            target={composeTarget}
            onCancel={() => {
              setComposeTarget({ kind: 'post' });
              setTab('home');
            }}
            onPosted={() => {
              setComposeTarget({ kind: 'post' });
              setTab('home');
            }}
          />
        ) : null}
        {tab === 'notifications' ? <NotificationsScreen /> : null}
      </View>
      <View style={styles.tabBar}>
        <TabButton label="Home" active={tab === 'home'} onPress={() => setTab('home')} />
        <TabButton
          label="Post"
          active={tab === 'compose'}
          onPress={() => openCompose({ kind: 'post' })}
        />
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
