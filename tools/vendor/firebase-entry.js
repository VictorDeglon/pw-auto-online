export { initializeApp } from 'firebase/app';
export { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
export { getDatabase, connectDatabaseEmulator, ref, child, set, update, remove, push, get, onValue, onChildAdded, onChildChanged, onChildRemoved, onDisconnect, runTransaction, serverTimestamp, query, limitToLast, orderByChild, endAt, off, goOffline, goOnline } from 'firebase/database';
