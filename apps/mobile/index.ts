// `./src/polyfills` must run before anything that imports `@patches/client` — it installs
// `globalThis.crypto.randomUUID`, which `@patches/client`'s `bindService` calls on every
// RPC and which Hermes (React Native's JS engine) does not provide natively
// (docs/research/expo-react-native.md §3). ES module evaluation order guarantees a
// side-effect-only import with no dependents of its own runs before later imports that do
// depend on it, so this ordering is safe as long as this stays the first import.
import './src/polyfills.js';

import { registerRootComponent } from 'expo';

import App from './src/App.js';

registerRootComponent(App);
