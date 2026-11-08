# Kit giocatori e Magazzino

In **Magazzino → Abbigliamento** la Segreteria può collegare una variante o tutte le varianti di un articolo alle voci del kit. Il menu del kit salva l'identificativo della variante e mostra codice, taglia, dettagli e disponibilità. I suggerimenti iniziali coprono i cataloghi esistenti. I collegamenti espliciti della società prevalgono sui suggerimenti.

La scheda giocatore ha un solo pannello Kit, con Allenamento, Gara, Rappresentanza e il filtro **Da collegare**. La stessa vista **Da collegare** in Magazzino riunisce i giocatori e apre direttamente il kit da correggere. **Salva collegamenti** conserva prezzi manuali, quantità e pagamenti. **Pantalone + felpa** usa due varianti con la stessa quantità.

**Richiedi a Magazzino** registra la richiesta. La disponibilità viene riservata e la quantità mancante va in **Da ordinare**. Dalle **Richieste kit giocatori** la Segreteria registra ordine, arrivo e consegna. L'arrivo incrementa la giacenza e la riserva. La consegna consuma entrambe. Annullare una riserva libera i pezzi. L'area genitori mostra lo stato del kit del proprio figlio.

Salvare un collegamento o un pagamento non apre richieste. Il badge **Da riordinare** del catalogo indica scorte sotto soglia. Le transizioni e le scorte sono aggiornate in transazione e separate per società. L'API inizializza lo schema in modo idempotente al primo utilizzo.
