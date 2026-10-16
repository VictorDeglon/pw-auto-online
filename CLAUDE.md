# Poway Automobile Online

Browser game (three.js 0.160 from jsDelivr, pinned with SRI) with online play over Firebase Realtime Database.
README.md covers running, the emulators and the Firebase setup.

- Run: `python3 -m http.server 8642`, open http://localhost:8642/ (`file://` won't load the scripts). Add `?emu=1` to
  use the local Firebase emulators (`npx firebase emulators:start --only auth,database --project demo-pw-auto-online`).
- This repo is public. Never commit personal information: real names, home addresses or house coordinates, school
  schedules tied to a person, machine names, IP addresses, local paths, or credentials. The Firebase web config is
  public by design; service-account keys and CI tokens are not.
- `poway-data.js` is generated data; don't regenerate it by hand.
- Online state: `src/online/net.js` (database), `src/online/remote.js` (other players as Peds), `database.rules.json`
  (who may write what). Change the rules and the client together, and test with two emulator clients.
- `.gitattributes` enforces LF.
