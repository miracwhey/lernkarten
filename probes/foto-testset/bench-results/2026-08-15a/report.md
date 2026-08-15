# Erkennungs-Bench — 2026-08-15T11:34

Reine Messung, keine Wertung. Latenz inkl. Bild-Upload, Modelle parallel gefahren.

## openai/gpt-5.6-luna-pro
Tokens gesamt: 153323 in / 9492 out · Provider: OpenAI

| Fall | Latenz | Ist (typ · quelle · thema · sicherheit) | Soll |
|---|---|---|---|
| IMG_2840 | 8.3s | objekt · Tabakverpackung · Gesundheitsrisiken des Tabakrauchens · hoch | objekt · Tabakbeutel-Warnhinweis · Tabak & Gesundheit |
| IMG_2841 | 5.8s | cover · Crime and Punishment, Fyodor Dostoyevsky · Schuld, Sühne und moralische Konflikte · hoch | cover · Crime and Punishment, Dostojewski · Schuld & Sühne (Überblick) |
| IMG_2842 | 8.5s | textseite · – · Moralische Verantwortung und gesellschaftliche Konventionen · mittel | textseite · Crime and Punishment S.349 · Raskolnikow–Swidrigailow |
| IMG_2843 | 7.7s | textseite · – · Schuld, Reue und moralische Verantwortung im literarischen Dialog · mittel | textseite · Crime and Punishment S.348 · Luschins Rechtfertigung |
| IMG_2844 | 4.8s | cover · The 33 Strategies of War, Robert Greene · Strategien und Prinzipien der Kriegsführung im übertragenen Sinn · hoch | cover · The 33 Strategies of War, Robert Greene · 33 Strategien (Überblick) |
| IMG_2845 | 9.8s | textseite · – · Einkreisungsstrategie und psychologischer Druck in Konflikten · hoch | textseite · 33 Strategies S.249 · Einkreisungs-Strategie/Rockefeller |
| IMG_2846 | 6.0s | textseite · – · Strategische Einkreisung und psychologischer Druck im Konflikt · hoch | textseite · 33 Strategies S.248 · Psychologische Einkreisung |
| IMG_2847 | 4.8s | cover · Die Kunst der Psychologie – Menschen lesen, Annika Durand · Psychologie, Manipulationen erkennen und emotionale Intelligenz trainieren · hoch | cover · Die Kunst der Psychologie, Annika Durand · Menschen lesen (Überblick) |
| IMG_2848 | 9.5s | textseite · – · Psychologische Beeinflussung durch Priming und die Sokrates-Methode · hoch | textseite · Kunst der Psychologie S.45 · Priming & Sokrates-Methode |
| serie-a | 37.5s | textseite · Crime and Punishment, Fyodor Dostoevsky · Schuld, Reue und moralische Verantwortung im zwischenmenschlichen Konflikt · hoch | EINE Quelle: Crime and Punishment · Thema der Seiten |
| serie-b | 31.0s | textseite · The 33 Strategies of War, Robert Greene · Einkesselung und psychologischer Druck in Konflikten · hoch | EINE Quelle: 33 Strategies of War · Einkreisung |
| serie-c | 12.1s | textseite · Die Kunst der Psychologie – Menschen lesen –, Annika Durand · Psychologische Manipulation durch Priming und die Sokrates-Methode · hoch | EINE Quelle: Die Kunst der Psychologie · Priming/Menschen lesen |

## qwen/qwen3-vl-235b-a22b-instruct
Tokens gesamt: 36426 in / 847 out · Provider: Alibaba, Parasail

| Fall | Latenz | Ist (typ · quelle · thema · sicherheit) | Soll |
|---|---|---|---|
| IMG_2840 | 3.1s | objekt · Zigarettenpackung mit Warnhinweis · Gesundheitsgefahren des Rauchens auf Deutsch · hoch | objekt · Tabakbeutel-Warnhinweis · Tabak & Gesundheit |
| IMG_2841 | 2.7s | cover · Crime and Punishment, Fyodor Dostoyevsky · Klassiker der russischen Literatur: Verbrechen und Strafe · hoch | cover · Crime and Punishment, Dostojewski · Schuld & Sühne (Überblick) |
| IMG_2842 | 2.0s | textseite · – · Englischer Roman-Text zur Lektüre und Sprachanalyse · mittel | textseite · Crime and Punishment S.349 · Raskolnikow–Swidrigailow |
| IMG_2843 | 2.1s | textseite · Crime and Punishment · Literarische Analyse von Fjodor Dostojewskis Roman · hoch | textseite · Crime and Punishment S.348 · Luschins Rechtfertigung |
| IMG_2844 | 2.6s | cover · The 33 Strategies of War, Robert Greene · Kriegsstrategien und taktisches Denken · hoch | cover · The 33 Strategies of War, Robert Greene · 33 Strategien (Überblick) |
| IMG_2845 | 3.4s | textseite · The History of Rome, Livy, 59 B.C.–A.D. 17 · Strategische Umzingelung im Geschäft und Krieg · hoch | textseite · 33 Strategies S.249 · Einkreisungs-Strategie/Rockefeller |
| IMG_2846 | 3.8s | textseite · Strategy 19 · Strategie und psychologische Kriegsführung · hoch | textseite · 33 Strategies S.248 · Psychologische Einkreisung |
| IMG_2847 | 4.6s | cover · Die Kunst der Psychologie, Annika Durand · Psychologie und Manipulation im Alltag verstehen · hoch | cover · Die Kunst der Psychologie, Annika Durand · Menschen lesen (Überblick) |
| IMG_2848 | 3.7s | textseite · Annika Durand · Primings und die Sokrates-Methode im Alltag · hoch | textseite · Kunst der Psychologie S.45 · Priming & Sokrates-Methode |
| serie-a | 6.3s | textseite · Crime and Punishment, Fyodor Dostoyevsky · Handlung und Charaktere aus dem Roman · hoch | EINE Quelle: Crime and Punishment · Thema der Seiten |
| serie-b | 4.5s | textseite · The 33 Strategies of War, Robert Greene · Kriegsstrategien und psychologische Kriegsführung · hoch | EINE Quelle: 33 Strategies of War · Einkreisung |
| serie-c | 3.8s | textseite · Die Kunst der Psychologie - Menschen lesen, Annika Durand · Manipulation erkennen und emotionale Intelligenz trainieren · hoch | EINE Quelle: Die Kunst der Psychologie · Priming/Menschen lesen |

## qwen/qwen3-vl-32b-instruct
Tokens gesamt: 36426 in / 890 out · Provider: Alibaba

| Fall | Latenz | Ist (typ · quelle · thema · sicherheit) | Soll |
|---|---|---|---|
| IMG_2840 | 2.6s | objekt · Tabakverpackung mit Warnhinweis und Produktinformationen · Gesundheitsrisiken durch Tabakkonsum · hoch | objekt · Tabakbeutel-Warnhinweis · Tabak & Gesundheit |
| IMG_2841 | 2.1s | cover · Fyodor Dostoyevsky, Crime and Punishment · Russische Literatur, Kriminalroman, psychologischer Roman · hoch | cover · Crime and Punishment, Dostojewski · Schuld & Sühne (Überblick) |
| IMG_2842 | 2.1s | textseite · Crime and Punishment, Fyodor Dostoevsky · Dialog zwischen Charakteren über moralische Entscheidungen und Beziehungen · hoch | textseite · Crime and Punishment S.349 · Raskolnikow–Swidrigailow |
| IMG_2843 | 2.0s | textseite · Crime and Punishment, Fyodor Dostoevsky · Gespräch über Ehe, Geld und moralische Entscheidungen im Roman · hoch | textseite · Crime and Punishment S.348 · Luschins Rechtfertigung |
| IMG_2844 | 2.0s | cover · The 33 Strategies of War, Robert Greene · Kriegsstrategien und taktisches Denken in Konflikten · hoch | cover · The 33 Strategies of War, Robert Greene · 33 Strategien (Überblick) |
| IMG_2845 | 2.0s | textseite · The History of Rome, Livy · Strategien zur Überwindung von Wettbewerbern durch Druck und Kontrolle · hoch | textseite · 33 Strategies S.249 · Einkreisungs-Strategie/Rockefeller |
| IMG_2846 | 2.3s | textseite · – · Kriegsführung, psychologische Strategie und Raumwahrnehmung im Kampf · mittel | textseite · 33 Strategies S.248 · Psychologische Einkreisung |
| IMG_2847 | 2.3s | cover · Die Kunst der Psychologie - Menschen lesen, Annika Durand · Psychologie, menschliches Verhalten, emotionale Intelligenz · hoch | cover · Die Kunst der Psychologie, Annika Durand · Menschen lesen (Überblick) |
| IMG_2848 | 2.4s | textseite · – · Sokrates-Methode und kritisches Denken durch Fragen · hoch | textseite · Kunst der Psychologie S.45 · Priming & Sokrates-Methode |
| serie-a | 6.8s | textseite · Crime and Punishment, Fyodor Dostoyevsky · Russische Literatur, klassischer Roman, Charakterentwicklung und moralische Konflikte · hoch | EINE Quelle: Crime and Punishment · Thema der Seiten |
| serie-b | 3.2s | textseite · The 33 Strategies of War, Robert Greene · Strategien der Kriegsführung und psychologische Manipulation · hoch | EINE Quelle: 33 Strategies of War · Einkreisung |
| serie-c | 3.9s | textseite · Die Kunst der Psychologie, Annika Durand · Psychologische Methoden wie Priming und Sokrates-Methode · hoch | EINE Quelle: Die Kunst der Psychologie · Priming/Menschen lesen |

## z-ai/glm-4.6v
Tokens gesamt: 45595 in / 7050 out · Provider: Novita, Z.AI

| Fall | Latenz | Ist (typ · quelle · thema · sicherheit) | Soll |
|---|---|---|---|
| IMG_2840 | 12.9s | objekt · Zigarettenpackung mit Gesundheitswarnung · Gesundheitswarnung auf Zigarettenpackung: Krebserregende Stoffe im Tabakrauch · hoch | objekt · Tabakbeutel-Warnhinweis · Tabak & Gesundheit |
| IMG_2841 | 21.6s | cover · Crime and Punishment, Fyodor Dostoyevsky · Schuld und Sühne, Roman von Fjodor Dostojewski · hoch | cover · Crime and Punishment, Dostojewski · Schuld & Sühne (Überblick) |
| IMG_2842 | 28.7s | textseite · – · Englische Literatur, Romanlektüre · mittel | textseite · Crime and Punishment S.349 · Raskolnikow–Swidrigailow |
| IMG_2843 | 52.1s | textseite · Crime and Punishment, Fyodor Dostoevsky · Roman "Schuld und Sühne" von Fyodor Dostojewski · hoch | textseite · Crime and Punishment S.348 · Luschins Rechtfertigung |
| IMG_2844 | 33.0s | cover · The 33 Strategies of War, Robert Greene · Die 33 Strategien des Krieges · hoch | cover · The 33 Strategies of War, Robert Greene · 33 Strategien (Überblick) |
| IMG_2845 | 33.0s | textseite · The History of Rome · Historische Strategie aus der Geschichte Roms · mittel | textseite · 33 Strategies S.249 · Einkreisungs-Strategie/Rockefeller |
| IMG_2846 | 27.6s | textseite · Keys to Warfare, Miyamoto Musashi · Kriegsführung, psychologische Strategien und historische Beispiele · hoch | textseite · 33 Strategies S.248 · Psychologische Einkreisung |
| IMG_2847 | 21.7s | cover · DIE KUNST DER PSYCHOLOGIE - MENSCHEN LESEN, Annika Durand · Psychologie des Menschenlesens und emotionale Intelligenz · hoch | cover · Die Kunst der Psychologie, Annika Durand · Menschen lesen (Überblick) |
| IMG_2848 | 13.3s | textseite · ANNIKA DURAND · Psychologische Methoden wie Priming und Sokrates-Methode · hoch | textseite · Kunst der Psychologie S.45 · Priming & Sokrates-Methode |
| serie-a | 31.5s | LEER | EINE Quelle: Crime and Punishment · Thema der Seiten |
| serie-b | 24.3s | textseite · The 33 Strategies of War, Robert Greene · Strategien der Kriegsführung und psychologische Taktiken · hoch | EINE Quelle: 33 Strategies of War · Einkreisung |
| serie-c | 22.5s | LEER | EINE Quelle: Die Kunst der Psychologie · Priming/Menschen lesen |

## mistralai/mistral-small-3.2-24b-instruct
Tokens gesamt: 43812 in / 814 out · Provider: DeepInfra, Parasail

| Fall | Latenz | Ist (typ · quelle · thema · sicherheit) | Soll |
|---|---|---|---|
| IMG_2840 | 4.6s | objekt · Zigarettenpackung · Warnhinweis auf Tabakprodukten · hoch | objekt · Tabakbeutel-Warnhinweis · Tabak & Gesundheit |
| IMG_2841 | 5.0s | cover · Crime and Punishment, Fyodor Dostoevsky · Buchcover von Dostoevskys 'Schuld und Sühne' · hoch | cover · Crime and Punishment, Dostojewski · Schuld & Sühne (Überblick) |
| IMG_2842 | 3.3s | textseite · Crime and Punishment, Fjodor Dostojewski · Dialog zwischen zwei Personen · mittel | textseite · Crime and Punishment S.349 · Raskolnikow–Swidrigailow |
| IMG_2843 | 2.6s | textseite · Raskolnikov, Fjodor Dostojewski · Dialog über Schuld und Sühne · mittel | textseite · Crime and Punishment S.348 · Luschins Rechtfertigung |
| IMG_2844 | 4.1s | cover · The 33 Strategies of War, Robert Greene · Kriegsstrategien und ihre Anwendung · hoch | cover · The 33 Strategies of War, Robert Greene · 33 Strategien (Überblick) |
| IMG_2845 | 4.5s | textseite · The History of Rome, Livy · Strategien der Belagerung und Einschließung · mittel | textseite · 33 Strategies S.249 · Einkreisungs-Strategie/Rockefeller |
| IMG_2846 | 2.2s | textseite · Strategy 19 · Militärische Strategie und Psychologie · mittel | textseite · 33 Strategies S.248 · Psychologische Einkreisung |
| IMG_2847 | 2.5s | cover · Die Kunst der Psychologie - Menschen lesen, Annika Durand · Psychologie und Manipulation · hoch | cover · Die Kunst der Psychologie, Annika Durand · Menschen lesen (Überblick) |
| IMG_2848 | 4.5s | textseite · Annika Durand · Sokratische Methode · hoch | textseite · Kunst der Psychologie S.45 · Priming & Sokrates-Methode |
| serie-a | 6.3s | textseite · Fjodor Dostojewski, Verbrechen und Strafe · Dialog über Schuld und Sühne · hoch | EINE Quelle: Crime and Punishment · Thema der Seiten |
| serie-b | 6.8s | textseite · The 33 Strategies of War, Robert Greene · Strategien der Kriegsführung und Psychologie · hoch | EINE Quelle: 33 Strategies of War · Einkreisung |
| serie-c | 6.7s | textseite · Die Kunst der Menschenlesen, Annika Durand · Psychologie der Manipulation und Kommunikation · hoch | EINE Quelle: Die Kunst der Psychologie · Priming/Menschen lesen |
