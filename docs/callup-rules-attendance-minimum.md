# Convocazioni: minimo settimanale e appelli incompleti

Una regola di una presenza su due sedute richiede una presenza effettiva registrata. Se il minimo è raggiunto, un secondo appello non compilato o una seconda seduta ancora futura non rendono il giocatore «Da verificare» per le presenze. La riga espone comunque le sedute/appelli mancanti come informazione, precisando che il minimo è raggiunto.

Restano i controlli distinti:

- Minimo non raggiunto e appelli incompleti: verifica ancora pendente; nessuna presenza inventata.
- Minimo non raggiunto con appelli completi: presenze insufficienti.
- Condotta non registrata: ammessa soltanto se la regola dell'annata lo prevede.
- Ultima condotta insufficiente: blocco anche se la condotta non valutata è ammessa.
- Disponibilità amministrativa, genitori e permessi del mister: invariati.

Il calcolo server è condiviso dalla verifica di convocabilità e dai controlli di salvataggio/pubblicazione. La registrazione di un appello invalida anche la verifica partite in cache. Nella lista si esplicita la modalità di sola lettura e il motivo della riga è associato alla casella anche per le tecnologie assistive.

Regressione: `node scripts/test-match-rotation-access.cjs @electric-sql/pglite --callup-rules`. Dati sintetici, PostgreSQL isolato: fallimento riprodotto prima della correzione; dopo, minimo 1/2 con condotta ammessa e seconda seduta futura consentito; 2/2 incompleto e condotta da verificare non ammessa ancora pendenti; insufficiente ancora bloccante. Conservate le prove su ruoli, annate separate e deduplicazione notifiche. Prove UI aggiunte a 390/1024 px nella suite prelaunch; la loro aggiunta non certifica il futuro esito CI.
