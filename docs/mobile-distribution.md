# Distribuzione FTB — Android e iPhone

## Canale attuale

Pagina pubblica `/installa.html`, disponibile senza autenticazione. È statica e non richiede l’API per mostrare istruzioni e download. Il collegamento è presente anche nella pagina di accesso al club.

Android: per scelta esplicita dell’utente si distribuisce la stessa versione **di prova**, con firma Android Debug, installata e verificata sull’Honor il 2 novembre 2026. Non è una release di produzione o una pubblicazione Google Play. Pacchetto `com.footballtrainingboard.app`, versione 1.0/code 1, server statico HTTPS e zoom abilitato. Il file `/downloads/ftb-android.apk` è accompagnato dal suo SHA-256. Chi ha un’app con lo stesso package ma una firma diversa non può aggiornarla direttamente: non disinstallare automaticamente e non cancellare dati per risolvere il conflitto. La pagina invita a contattare il club.

iPhone: aggiunta alla Home tramite Safari, non download di un file IPA né App Store. Icona Apple PNG 180×180 derivata dal logo esistente; manifest con icone 192 e 512, nome FTB, display standalone, scope root e avvio `/login-club`. I metadati Apple sono nel documento principale e nella pagina di installazione. L’utente deve aggiungere alla Home dalla pagina di accesso, così l’icona avvia FTB e non le istruzioni di installazione. Il comportamento effettivo va collaudato su iPhone reale.

## Aggiornamenti

Le funzionalità web si aggiornano dal sito statico. Non è stato aggiunto un service worker né una cache offline, per non introdurre contenuti o richieste autenticate obsolete. Internet richiesto; nessuna promessa di notifiche, audio/video o fotocamera su iOS prima del relativo collaudo. I permessi e i dati dei ruoli rimangono quelli del backend esistente.

Per aggiornare il download Android: compilare prima il contenitore con il server statico, verificare il package, la firma e `assets/capacitor.config.json`; copiare l’APK in `artifacts/football-training-board/public/downloads/ftb-android.apk`; aggiornare checksum e data/peso indicati in `installa.html`. Non includere chiavi private o password nella cartella pubblica. Conservare privatamente la chiave di firma usata se si vogliono mantenere aggiornamenti compatibili. Per un canale stabile futuro serve una decisione separata sulla firma release e sulla migrazione degli utenti di prova.

## Confini

Nessuna modifica ai salvataggi, alle disponibilità, all’appello, ai programmi congiunti o alle logiche tecniche del libro. Nessun servizio Render vecchio sospeso, nessuna modifica a database/API. Il file Android e le istruzioni sono pubblici; scaricarli non concede accesso ai dati del club.

## Riferimenti ufficiali

- https://developer.android.com/distribute/marketing-tools/alternative-distribution
- https://developer.android.com/studio/publish/app-signing
- https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
