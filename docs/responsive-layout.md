# Layout adattivo e accesso ai compensi membri

## Problema riprodotto

A 850 px, la vecchia pagina Membri manteneva la barra laterale da 288 px e due colonne di card. Avatar, pulsante Scheda membro e comandi di modifica sottraevano quasi tutto lo spazio al nome e alle etichette: alcune scritte diventavano una lettera per riga. La soglia dipendeva dalla finestra, anziché dallo spazio realmente disponibile dopo il menu.

## Regole condivise

- Barra laterale in modalità cassetto sotto 1024 px, con larghezza limitata al viewport. La preferenza desktop viene conservata durante il ridimensionamento; il cassetto mobile ha uno stato separato.
- Contenitori nominati `app-shell`, `app-page` e `app-dialog`. Intestazione estesa/compatta e dettagli account dipendono dalla larghezza utilizzabile del pannello, non da quella totale della finestra.
- `responsive-layout.css` limita le griglie responsive standard da due a sei colonne in base alla larghezza del contenitore: sotto 40 rem una colonna; da 40 a 56 rem massimo due; da 56 a 72 rem massimo tre. La regola si applica quando il breakpoint originale è attivo; le griglie base senza prefisso restano tali. Tabelle scorrevoli, lavagna a pieno schermo e template di griglia specifici non vengono convertiti. Una griglia intenzionalmente fissa può dichiarare `data-fixed-grid`.
- `responsive-card-grid` e `responsive-form-grid` usano colonne automatiche con dimensione minima limitata al 100% del contenitore. Non comprimono i campi per mantenere artificiosamente il numero di colonne.
- Modali con margine dal bordo, altezza massima legata a `dvh`, scorrimento verticale e titolo distanziato dalla chiusura. Campi input e select con larghezza minima zero e limite al contenitore. Nei moduli delle schede i selettori occupano la larghezza del campo.

## Membri e compensi

Le card separano dati e comandi nel piè di card. Nomi ed email possono andare a capo. **Contratti e compensi**, visibile agli stessi ruoli economici già autorizzati, apre direttamente Ruoli e contratti; **Scheda membro** apre i dati generali. Il pulsante a matita è etichettato Modifica anagrafica e accesso. Testo introduttivo e messaggio di errore degli incarichi rendono il percorso riconoscibile.

Percorso completo: Membri → Contratti e compensi → Aggiungi incarico. Qui si impostano ruolo, stagione, contratto, mesi, importo mensile/totale, compenso, rimborso, 30/60/90 gg FM, termine ultimo e ripartizione per annata. Il piano dei pagamenti si consulta nella scheda Piano uscite o da Pagamenti → Compensi e rimborsi membri.

Le squadre storiche prive di `season_id` sono utilizzabili negli accordi della sola stagione attiva, scelta in modo deterministico per data e ID. Il collegamento della squadra non viene modificato; le squadre con stagione esplicita conservano quella assegnazione. Il server rifiuta l'uso delle squadre prive di stagione in accordi di stagioni storiche. Nessun ampliamento dei permessi e nessun contratto reale creato durante la verifica.

## Verifica

Componenti reali AppLayout, Sidebar, Membri e Scheda membro con API e dati simulati, osservati tramite browser a 320, 390, 768, 850, 1024 e 1440 px. Larghezza documento coincidente con il viewport; comandi dell'intestazione senza sconfinamenti; nomi lunghi su più righe; card con comandi separati; apertura diretta dei contratti; input leggibili a 390 px; cassetto da 288 px dentro uno schermo da 320 px. Il percorso reale dei parametri è stato aperto in una seconda scheda senza chiudere il modulo preesistente e senza salvare dati.

Test HTTP/PostgreSQL `--member-services` esteso al caso squadra senza stagione e al rifiuto della ripartizione in una stagione storica. TypeScript e build frontend/API. Le verifiche visive riguardano le superfici indicate e i componenti condivisi; non costituiscono un collaudo individuale di ogni pagina dell'app.
