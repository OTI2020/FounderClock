# FounderClock

FounderClock helps startup teams track time, expenses, and calculate equity shares — all inside Discord. Check in, check out with task description, log expenses, and get weekly summaries. Built for small founding teams of 2-5 people. Import and Export possible.

Discord-Bot für kleine Gründerteams: Zeiterfassung per Check-in/Check-out, Ausgabenerfassung, Wochenübersicht, CSV-Export/Import und eine quartalsweise Anteilsberechnung, die von allen Beteiligten bestätigt werden muss. Mehrsprachig (DE/EN), mit Fuzzy-Matching für Tippfehler.

## Tech-Stack

- **discord.js v14** (Slash-Commands, Buttons)
- **better-sqlite3** – lokale, dateibasierte Datenbank (keine externe DB nötig)
- **dayjs** – Datum/Zeit-Berechnungen (ISO-Kalenderwochen, Quartale)
- Hosting: **Railway.app**

## Projektstruktur

```
FounderClock/
├── index.js                  # Bot-Einstiegspunkt
├── deploy-commands.js        # Registriert Slash-Commands bei Discord
├── src/
│   ├── config.js             # Liest Umgebungsvariablen
│   ├── commands/              # Ein Command pro Datei
│   │   ├── checkin.js
│   │   ├── checkout.js
│   │   ├── log.js
│   │   ├── ausgabe.js
│   │   ├── stats.js
│   │   ├── help.js
│   │   ├── export.js
│   │   ├── import.js
│   │   ├── anteile.js
│   │   └── sprache.js
│   ├── events/
│   │   ├── ready.js
│   │   └── interactionCreate.js  # Command- & Button-Routing
│   ├── database/
│   │   ├── db.js              # SQLite-Setup & Schema
│   │   ├── members.js
│   │   ├── sessions.js
│   │   ├── expenses.js
│   │   └── equity.js
│   ├── i18n/
│   │   ├── index.js
│   │   ├── de.json
│   │   └── en.json
│   └── utils/
│       ├── fuzzy.js           # Levenshtein-Fuzzy-Matching
│       ├── time.js            # Dauer-/Datum-Parsing, Kalenderwochen, Quartale
│       ├── csv.js             # CSV-Export/-Import
│       └── embeds.js
└── data/                      # SQLite-Datei (gitignored, lokal automatisch angelegt)
```

## Setup

### 1. Discord-Bot anlegen

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Unter **Bot** → **Reset Token** → Token kopieren (`DISCORD_TOKEN`).
3. Unter **OAuth2 → General** die **Application ID** kopieren (`CLIENT_ID`).
4. Unter **OAuth2 → URL Generator**: Scopes `bot` + `applications.commands` auswählen, Berechtigungen mindestens `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`. Mit der generierten URL den Bot auf euren Server einladen.
5. Privilegierte Gateway-Intents werden **nicht** benötigt (der Bot nutzt nur Slash-Commands & Buttons, keine Message-Content- oder Member-Intents).

### 2. Lokale Installation

```bash
npm install
cp .env.example .env
# .env ausfüllen: DISCORD_TOKEN, CLIENT_ID, optional GUILD_ID für Dev
npm run deploy   # registriert die Slash-Commands bei Discord
npm start        # startet den Bot
```

Mit gesetzter `GUILD_ID` werden die Commands nur in diesem Server registriert (sofort sichtbar, ideal für Entwicklung). Ohne `GUILD_ID` erfolgt eine globale Registrierung (Rollout dauert bis zu 1 Stunde).

### 3. Umgebungsvariablen

| Variable | Beschreibung | Default |
|---|---|---|
| `DISCORD_TOKEN` | Bot-Token | – (erforderlich) |
| `CLIENT_ID` | Application ID | – (erforderlich) |
| `GUILD_ID` | Server-ID für schnelle Dev-Registrierung | leer = global |
| `DB_PATH` | Pfad zur SQLite-Datei | `./data/founderclock.sqlite` |
| `DEFAULT_HOURLY_RATE` | Standard-Stundensatz für `/anteile` | `25` |
| `DEFAULT_CURRENCY` | Währungskürzel für Ausgaben/Anteile | `EUR` |

## Deployment auf Railway

1. Repo mit Railway verbinden (New Project → Deploy from GitHub Repo).
2. Umgebungsvariablen aus der Tabelle oben in den Railway-Settings setzen.
3. **Persistenter Speicher:** SQLite liegt standardmäßig im Container-Dateisystem, das bei jedem Deploy zurückgesetzt wird. Legt in Railway unter **Volumes** ein Volume an (z. B. Mount-Pfad `/data`) und setzt `DB_PATH=/data/founderclock.sqlite`, damit Check-ins, Ausgaben und Anteile Deployments überleben.
4. Start-Command ist bereits über `railway.toml` / `package.json` (`npm start`) definiert.
5. Nach dem ersten Deploy einmalig lokal `npm run deploy` ausführen (oder als einmaligen Railway-Job), um die Slash-Commands zu registrieren – das passiert nicht automatisch beim Bot-Start.

## Befehlsübersicht

| Befehl | Beschreibung |
|---|---|
| `/checkin` | Öffnet ein Panel mit Check-in-Button (öffentlich, jeder im Kanal kann klicken). |
| `/checkout beschreibung:"..."` | Checkt dich aus, Beschreibung ist Pflicht. Berechnet automatisch die Dauer. |
| `/log dauer:2h beschreibung:"..." [datum]` | Trägt nachträglich eine Zeit ein, z. B. `/log 2h "Kundencall" 2026-09-14`. |
| `/ausgabe betrag:200 beschreibung:"..." [kategorie] [datum]` | Erfasst eine Ausgabe, z. B. `/ausgabe 200 "3D Drucker"`. |
| `/stats [woche]` | Wochenübersicht aller Mitglieder (Stunden, Check-ins, Ausgaben). `woche:0` = aktuell, `1` = letzte Woche usw. |
| `/help` | Zeigt alle Befehle in der eigenen Sprache. |
| `/export [typ] [von] [bis]` | Lädt Zeiten und/oder Ausgaben als CSV herunter. |
| `/import zeiten\|ausgaben datei:*.csv` | Importiert eine CSV-Datei (nur Mitglieder mit „Server verwalten“). |
| `/anteile start [stundensatz]` | Startet eine neue Anteilsberechnung fürs laufende Quartal (nur Admins). |
| `/anteile status` | Zeigt den Bestätigungsstatus der laufenden Berechnung. |
| `/sprache wert:de\|en` | Stellt deine persönliche Sprache um. |

## Anteilsberechnung – wie die Formel funktioniert

Ähnlich dem "Slicing Pie"-Modell für dynamische Gründeranteile:

```
Beitragswert(Mitglied) = geleistete Stunden × Stundensatz + eingereichte Ausgaben
Anteil(Mitglied) %     = Beitragswert(Mitglied) / Summe aller Beitragswerte × 100
```

- `/anteile start` berücksichtigt **alle bisher erfassten** Stunden und Ausgaben (kumulativ), nicht nur das laufende Quartal – die Anteile spiegeln so immer den aktuellen Gesamtbeitrag wider.
- Pro Server ist maximal eine Berechnung pro Quartal möglich (basierend auf Serverzeit/UTC).
- Bestätigen müssen alle Mitglieder, die Stunden **oder** Ausgaben beigetragen haben (nicht der gesamte Discord-Server). Klickt jemand auf „Ablehnen“, wird die Berechnung komplett verworfen und kann neu gestartet werden.
- Der Stundensatz kann pro Berechnung über die Option `stundensatz` überschrieben werden; der Wert wird dann als neuer Standard gespeichert.

## CSV Export/Import

**Zeiten** (`zeiten.csv`): `user_id, username, date, hours, description, source`
**Ausgaben** (`ausgaben.csv`): `user_id, username, date, amount, currency, description, category`

Beim Import sind nur `user_id`, `date` und `hours`/`amount` Pflichtfelder – `username` wird ignoriert (dient nur der Lesbarkeit). Der Import ist tolerant gegenüber Spaltennamen: Sowohl deutsche als auch englische Varianten sowie leichte Tippfehler in der Kopfzeile werden per Fuzzy-Matching erkannt (z. B. „Beschreibng“ → `description`, „Stunden“ → `hours`). `user_id` muss die numerische Discord-User-ID sein.

## Mehrsprachigkeit

Jedes Mitglied kann per `/sprache` seine eigene Sprache (Deutsch/Englisch) einstellen – die Einstellung gilt pro Server und wirkt sich auf alle an dieses Mitglied gerichteten Antworten aus. Öffentliche, gemeinsam genutzte Elemente (Check-in-Panel, Anteile-Bestätigungsbuttons) sind bewusst zweisprachig beschriftet, da sie von allen Teammitgliedern gemeinsam genutzt werden.

## Fuzzy-Matching bei Tippfehlern

Wird an drei Stellen eingesetzt (Levenshtein-Distanz, `src/utils/fuzzy.js`):

1. **Dauer-Einheiten** in `/log`: `"2 stnden"` wird als `"2 Stunden"` erkannt.
2. **Ausgaben-Kategorien**: Bei `/ausgabe kategorie:"Buerobedarf"` wird automatisch die bereits existierende Kategorie `"Bürobedarf"` verwendet, um Duplikate durch Tippfehler zu vermeiden.
3. **CSV-Import-Spaltennamen**: Erkennt abweichende/falsch geschriebene Kopfzeilen in hochgeladenen CSV-Dateien.

## Bekannte Grenzen (v1)

- Eine Währung pro Server (`DEFAULT_CURRENCY`), kein Multi-Currency-Handling.
- Quartale werden nach Systemzeit des Hosts (i. d. R. UTC) berechnet.
- Keine Bearbeiten/Löschen-Befehle für einzelne Einträge – Korrekturen aktuell über direkten DB-Zugriff oder erneuten `/log`-Eintrag.
- SQLite ist pro Server-Instanz nicht horizontal skalierbar, für Teams von 2–5 Personen aber mehr als ausreichend.
