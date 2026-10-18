// Online configuration: the five servers and the Firebase project behind them.
//
// Each "server" is a separate area of one Firebase Realtime Database (servers/<id>/...). Players on the same server
// see each other, chat, and can fight; servers never mix. The browser talks to the database directly, so there is
// no server process to run. database.rules.json (deployed with `firebase deploy --only database`) is what keeps
// players from writing anything but their own state, and keeps usernames unique per server.
//
// FIREBASE_CONFIG is the project's web config from the Firebase console (Project settings > General > Your apps >
// Web app). These values are public by design: they identify the project, they don't grant access. Access is
// controlled by the rules file and by Anonymous sign-in, which must be enabled under Authentication > Sign-in method.

// The home game server (server/), optional. Leave null to use the address the server publishes in the database
// (config/home, needs its service-account key), or set a fixed wss:// address here (a named tunnel or a domain).
export const HOME_SERVER_URL = null;

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDcXrPy8TLEUE6VnVLeymVgPmORmeUeUsQ",
  appId: "1:836485738852:web:35cce5616109629a4c8a71",
  authDomain: "pw-auto-online.firebaseapp.com",
  databaseURL: "https://pw-auto-online-default-rtdb.firebaseio.com",
  projectId: "pw-auto-online",
  storageBucket: "pw-auto-online.firebasestorage.app"
};

// Local testing against the Firebase emulators: open the game with ?emu=1 (or ?emu=host) and run
//   npx firebase emulators:start --only auth,database --project demo-pw-auto-online
export const EMULATOR_PROJECT = 'demo-pw-auto-online';

export const MAX_PLAYERS = 20; // per server; the free Spark plan allows 100 connections across all five

export const SERVERS = [
  { id: 'silverwood', name: 'Silverwood', tag: 'Old-growth oaks and quiet cul-de-sacs', accent: '#c9d4dc' },
  { id: 'elysium', name: 'Elysium', tag: 'Golden hour on every street', accent: '#ffd23f' },
  { id: 'asgard', name: 'Asgard', tag: 'Thunder on the canyon roads', accent: '#5aa9ff' },
  { id: 'avalon', name: 'Avalon', tag: 'The lake, the mist, the getaway', accent: '#7dd3a8' },
  { id: 'vaeloria', name: 'Vaeloria', tag: 'Neon nights and fast cars', accent: '#c48bff' },
];

// usernames: 3 to 16 letters, digits or underscores; unique per server, compared without case
export const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
