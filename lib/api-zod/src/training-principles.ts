// Catalog derived from the approved training-principles CSV, with distinct age-context extensions.
export type TrainingPrincipleSection = "scuola_calcio" | "settore_giovanile" | "prima_squadra";
export type TrainingPrinciple = { value: string; section: TrainingPrincipleSection; area: string; principle: string; subprinciple: string | null; detail: string | null; parent: string | null; depth: number };
export const TRAINING_PRINCIPLES: readonly TrainingPrinciple[] = [
  {
    "value": "ftb1:scuola_calcio:8d68906558ae",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Efficacia Individuale e Finalizzazione",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:54948a579f11",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Efficacia Individuale e Finalizzazione",
    "subprinciple": "Il Dribbling e il Duello",
    "detail": null,
    "parent": "ftb1:scuola_calcio:8d68906558ae",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:66fb4706dd25",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Efficacia Individuale e Finalizzazione",
    "subprinciple": "Il Dribbling e il Duello",
    "detail": "Duello 1v1 frontale con finta",
    "parent": "ftb1:scuola_calcio:54948a579f11",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:2156ce44956c",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Efficacia Individuale e Finalizzazione",
    "subprinciple": "Il Dribbling e il Duello",
    "detail": "Protezione della palla col corpo (Difesa del pallone)",
    "parent": "ftb1:scuola_calcio:54948a579f11",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:7c1d81a0e40f",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Efficacia Individuale e Finalizzazione",
    "subprinciple": "Il Tiro in Porta",
    "detail": null,
    "parent": "ftb1:scuola_calcio:8d68906558ae",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:a14f614622e4",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Efficacia Individuale e Finalizzazione",
    "subprinciple": "Il Tiro in Porta",
    "detail": "Tiro immediato d'istinto (Vedere la porta e calciare)",
    "parent": "ftb1:scuola_calcio:7c1d81a0e40f",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:b1e8e15ac8be",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Efficacia Individuale e Finalizzazione",
    "subprinciple": "Il Tiro in Porta",
    "detail": "Conclusione dopo un cambio di direzione",
    "parent": "ftb1:scuola_calcio:7c1d81a0e40f",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:6e9fdfe82405",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Prima Collaborazione e Sviluppo",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:b9203b2e2cc9",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Prima Collaborazione e Sviluppo",
    "subprinciple": "Gestione dello Spazio Comune",
    "detail": null,
    "parent": "ftb1:scuola_calcio:6e9fdfe82405",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:591ea053d981",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Prima Collaborazione e Sviluppo",
    "subprinciple": "Gestione dello Spazio Comune",
    "detail": "Scaglionamento a triangolo / diamante (Non allinearsi)",
    "parent": "ftb1:scuola_calcio:b9203b2e2cc9",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:c993e2e859a4",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Prima Collaborazione e Sviluppo",
    "subprinciple": "Gestione dello Spazio Comune",
    "detail": "Ricezione orientata per scappare dalla pressione",
    "parent": "ftb1:scuola_calcio:b9203b2e2cc9",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:4011be0e2f4a",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Prima Collaborazione e Sviluppo",
    "subprinciple": "Avanzamento della Palla",
    "detail": null,
    "parent": "ftb1:scuola_calcio:6e9fdfe82405",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:887026110c2e",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Prima Collaborazione e Sviluppo",
    "subprinciple": "Avanzamento della Palla",
    "detail": "Guida la palla nello spazio libero (Vedo spazio, vado)",
    "parent": "ftb1:scuola_calcio:4011be0e2f4a",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:b1f6cc52c3d0",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Prima Collaborazione e Sviluppo",
    "subprinciple": "Avanzamento della Palla",
    "detail": "trasmissione palla rasoterra al compagno libero (Dai e vai)",
    "parent": "ftb1:scuola_calcio:4011be0e2f4a",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:03bec1eff789",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Conquista del Pallone",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:890a5765e284",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Conquista del Pallone",
    "subprinciple": "Aggressione al Portatore",
    "detail": null,
    "parent": "ftb1:scuola_calcio:03bec1eff789",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:5bae0257fd76",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Conquista del Pallone",
    "subprinciple": "Aggressione al Portatore",
    "detail": "Presa di posizione rapida 1v1 (Accorciare subito)",
    "parent": "ftb1:scuola_calcio:890a5765e284",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:081d646ccf7b",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Conquista del Pallone",
    "subprinciple": "Aggressione al Portatore",
    "detail": "Contrasto e rubata del tempo di giocata",
    "parent": "ftb1:scuola_calcio:890a5765e284",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:2ef2da8f5dab",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Protezione Spaziale",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:8a3321f60b5a",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Protezione Spaziale",
    "subprinciple": "Difesa della Porta",
    "detail": null,
    "parent": "ftb1:scuola_calcio:2ef2da8f5dab",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:c6c59b7b54f5",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Protezione Spaziale",
    "subprinciple": "Difesa della Porta",
    "detail": "Posizionarsi sempre tra la palla e la propria porta",
    "parent": "ftb1:scuola_calcio:8a3321f60b5a",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:1ab0496abff1",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Protezione Spaziale",
    "subprinciple": "Difesa della Porta",
    "detail": "Intercettazione delle linee di trasmissione palla preventive/evidenti",
    "parent": "ftb1:scuola_calcio:8a3321f60b5a",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:8609a440943f",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Transizione Negativa",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:77f34f07db2c",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Transizione Negativa",
    "subprinciple": "Reazione all'Errore",
    "detail": null,
    "parent": "ftb1:scuola_calcio:8609a440943f",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:88d100f844cf",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Transizione Negativa",
    "subprinciple": "Reazione all'Errore",
    "detail": "Rincorsa immediata del portatore (Ho perso palla, la inseguo)",
    "parent": "ftb1:scuola_calcio:77f34f07db2c",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:de8f4448a275",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Transizione Positiva",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:ea3b049ac710",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Transizione Positiva",
    "subprinciple": "Transizione Offensiva Primaria",
    "detail": null,
    "parent": "ftb1:scuola_calcio:de8f4448a275",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:cdf710c78891",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Transizione Positiva",
    "subprinciple": "Transizione Offensiva Primaria",
    "detail": "Guarda avanti e conduci fuori dalla densità",
    "parent": "ftb1:scuola_calcio:ea3b049ac710",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:158fda792769",
    "section": "scuola_calcio",
    "area": "Coordinazione e motricità",
    "principle": "Schemi Motori di Base e Coordinazione Dinamica generale",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:98ac4cb929a1",
    "section": "scuola_calcio",
    "area": "Coordinazione e motricità",
    "principle": "Schemi Motori di Base e Coordinazione Dinamica generale",
    "subprinciple": "Capacità Coordinative Speciali",
    "detail": null,
    "parent": "ftb1:scuola_calcio:158fda792769",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:f556e64918f2",
    "section": "scuola_calcio",
    "area": "Coordinazione e motricità",
    "principle": "Schemi Motori di Base e Coordinazione Dinamica generale",
    "subprinciple": "Capacità Coordinative Speciali",
    "detail": "Orientamento spazio-temporale (Gestione dello spazio e distanze)",
    "parent": "ftb1:scuola_calcio:98ac4cb929a1",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:da85c7e285a2",
    "section": "scuola_calcio",
    "area": "Coordinazione e motricità",
    "principle": "Schemi Motori di Base e Coordinazione Dinamica generale",
    "subprinciple": "Capacità Coordinative Speciali",
    "detail": "Equilibrio statico/dinamico e recupero dell'equilibrio dopo un contrasto",
    "parent": "ftb1:scuola_calcio:98ac4cb929a1",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:271dc8a9eba3",
    "section": "scuola_calcio",
    "area": "Coordinazione e motricità",
    "principle": "Schemi Motori di Base e Coordinazione Dinamica generale",
    "subprinciple": "Capacità Coordinative Speciali",
    "detail": "Capacità di reazione (Risposta a stimoli visivi/acustici improvvisi)",
    "parent": "ftb1:scuola_calcio:98ac4cb929a1",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:85e0db60d876",
    "section": "scuola_calcio",
    "area": "Coordinazione e motricità",
    "principle": "Schemi Motori di Base e Coordinazione Dinamica generale",
    "subprinciple": "Capacità Coordinative Speciali",
    "detail": "Capacità di ritmo (Differenziazione della velocità dei passi)",
    "parent": "ftb1:scuola_calcio:98ac4cb929a1",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:40735ac68c82",
    "section": "scuola_calcio",
    "area": "Coordinazione e motricità",
    "principle": "Schemi Motori di Base e Coordinazione Dinamica generale",
    "subprinciple": "Schemi Motori di Base",
    "detail": null,
    "parent": "ftb1:scuola_calcio:158fda792769",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:34232953dac9",
    "section": "scuola_calcio",
    "area": "Coordinazione e motricità",
    "principle": "Schemi Motori di Base e Coordinazione Dinamica generale",
    "subprinciple": "Schemi Motori di Base",
    "detail": "Correre, saltare, calciare, lanciare, strisciare, rotolare",
    "parent": "ftb1:scuola_calcio:40735ac68c82",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:9c4dbde59c65",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Sensibilità e Gestione della Palla",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:355e16ffdcfb",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Sensibilità e Gestione della Palla",
    "subprinciple": "Tecnica Applicata Individuale",
    "detail": null,
    "parent": "ftb1:scuola_calcio:9c4dbde59c65",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:48e873c580af",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Sensibilità e Gestione della Palla",
    "subprinciple": "Tecnica Applicata Individuale",
    "detail": "Conduzione della palla con interno piede e esterno piede",
    "parent": "ftb1:scuola_calcio:355e16ffdcfb",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:103f1e1e79f4",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Sensibilità e Gestione della Palla",
    "subprinciple": "Tecnica Applicata Individuale",
    "detail": "Conduzione della palla con interno collo piede e esterno collo piede",
    "parent": "ftb1:scuola_calcio:355e16ffdcfb",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:818bd7a3edd6",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Sensibilità e Gestione della Palla",
    "subprinciple": "Tecnica Applicata Individuale",
    "detail": "Conduzione della palla con la pianta del piede",
    "parent": "ftb1:scuola_calcio:355e16ffdcfb",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:f9f6db08b789",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Sensibilità e Gestione della Palla",
    "subprinciple": "Tecnica Applicata Individuale",
    "detail": "Spostamento della palla (trasversale/laterale) con esterno piede",
    "parent": "ftb1:scuola_calcio:355e16ffdcfb",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:21a228e3341c",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Sensibilità e Gestione della Palla",
    "subprinciple": "Tecnica Applicata Individuale",
    "detail": "Ricezione/Arresto della palla con interno piede",
    "parent": "ftb1:scuola_calcio:355e16ffdcfb",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:382f87f3aede",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Sensibilità e Gestione della Palla",
    "subprinciple": "Tecnica Applicata Individuale",
    "detail": "Ricezione/Arresto della palla con la pianta del piede",
    "parent": "ftb1:scuola_calcio:355e16ffdcfb",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:fa79d15eac94",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Sensibilità e Gestione della Palla",
    "subprinciple": "Tecnica Applicata Individuale",
    "detail": "Calcio/trasmissione palla della palla con interno piede",
    "parent": "ftb1:scuola_calcio:355e16ffdcfb",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:5b56bfba8437",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Sensibilità e Gestione della Palla",
    "subprinciple": "Tecnica Applicata Individuale",
    "detail": "Calcio/Tiro della palla con collo del piede pieno",
    "parent": "ftb1:scuola_calcio:355e16ffdcfb",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:31c62b1971fa",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Sensibilità e Gestione della Palla",
    "subprinciple": "Tecnica Applicata Individuale",
    "detail": "Dominio della palla e sensibilità (Palleggio e ball-feeling multi-superficie)",
    "parent": "ftb1:scuola_calcio:355e16ffdcfb",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:ab7332e74770",
    "section": "scuola_calcio",
    "area": "Percezione e scelta",
    "principle": "Percezione e Scelta Semplice",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:7bf753fd9f36",
    "section": "scuola_calcio",
    "area": "Percezione e scelta",
    "principle": "Percezione e Scelta Semplice",
    "subprinciple": "Sviluppo Senso-Percettivo",
    "detail": null,
    "parent": "ftb1:scuola_calcio:ab7332e74770",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:a4bdf8dafc5a",
    "section": "scuola_calcio",
    "area": "Percezione e scelta",
    "principle": "Percezione e Scelta Semplice",
    "subprinciple": "Sviluppo Senso-Percettivo",
    "detail": "Attenzione selettiva (Isolare la palla e l'avversario dal caos ambientale)",
    "parent": "ftb1:scuola_calcio:7bf753fd9f36",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:a4b4d01cca0c",
    "section": "scuola_calcio",
    "area": "Percezione e scelta",
    "principle": "Percezione e Scelta Semplice",
    "subprinciple": "Sviluppo Senso-Percettivo",
    "detail": "Visione periferica rudimentale (Alzare la testa durante la conduzione)",
    "parent": "ftb1:scuola_calcio:7bf753fd9f36",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:1e71f2d36cb3",
    "section": "scuola_calcio",
    "area": "Percezione e scelta",
    "principle": "Percezione e Scelta Semplice",
    "subprinciple": "Sviluppo Senso-Percettivo",
    "detail": "Problem solving immediato (Scelta tra Dribbling o trasmissione palla)",
    "parent": "ftb1:scuola_calcio:7bf753fd9f36",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:591e4c740de8",
    "section": "scuola_calcio",
    "area": "Movimento e prevenzione",
    "principle": "Efficienza Fisica Ludica",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:b5c3b878cfab",
    "section": "scuola_calcio",
    "area": "Movimento e prevenzione",
    "principle": "Efficienza Fisica Ludica",
    "subprinciple": "Rapidità e Flessibilità spontanea",
    "detail": null,
    "parent": "ftb1:scuola_calcio:591e4c740de8",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:277ff9ce28ed",
    "section": "scuola_calcio",
    "area": "Movimento e prevenzione",
    "principle": "Efficienza Fisica Ludica",
    "subprinciple": "Rapidità e Flessibilità spontanea",
    "detail": "Rapidità di frequenza degli appoggi (Rapidità motoria pura)",
    "parent": "ftb1:scuola_calcio:b5c3b878cfab",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:c82d98026355",
    "section": "scuola_calcio",
    "area": "Movimento e prevenzione",
    "principle": "Efficienza Fisica Ludica",
    "subprinciple": "Rapidità e Flessibilità spontanea",
    "detail": "Propriocezione plantare e della caviglia (Attraverso superfici instabili o scalette)",
    "parent": "ftb1:scuola_calcio:b5c3b878cfab",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:e21c33f72841",
    "section": "scuola_calcio",
    "area": "Movimento e prevenzione",
    "principle": "Efficienza Fisica Ludica",
    "subprinciple": "Rapidità e Flessibilità spontanea",
    "detail": "Mobilità articolare naturale (Flessibilità dinamica tramite gioco)",
    "parent": "ftb1:scuola_calcio:b5c3b878cfab",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:9d920dab993a",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Costruzione dal Basso e Sviluppo",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:572c92997dd9",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Costruzione dal Basso e Sviluppo",
    "subprinciple": "Uscita dalla Prima Pressione",
    "detail": null,
    "parent": "ftb1:settore_giovanile:9d920dab993a",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:bd0ab8c85af0",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Costruzione dal Basso e Sviluppo",
    "subprinciple": "Uscita dalla Prima Pressione",
    "detail": "Creazione di ampiezza e profondità strutturata",
    "parent": "ftb1:settore_giovanile:572c92997dd9",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:b854f4b7cef9",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Costruzione dal Basso e Sviluppo",
    "subprinciple": "Uscita dalla Prima Pressione",
    "detail": "Ricerca del terzo uomo per superare la linea",
    "parent": "ftb1:settore_giovanile:572c92997dd9",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:fe9a5683ab6c",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Costruzione dal Basso e Sviluppo",
    "subprinciple": "Rifinitura e Progressione",
    "detail": null,
    "parent": "ftb1:settore_giovanile:9d920dab993a",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:40d1aef497ad",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Costruzione dal Basso e Sviluppo",
    "subprinciple": "Rifinitura e Progressione",
    "detail": "Occupazione dei canali interni (Spazi di mezzo / Half-spaces)",
    "parent": "ftb1:settore_giovanile:fe9a5683ab6c",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:ff3202c79c00",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Costruzione dal Basso e Sviluppo",
    "subprinciple": "Rifinitura e Progressione",
    "detail": "Rotazioni posizionali (Interscambi di ruolo)",
    "parent": "ftb1:settore_giovanile:fe9a5683ab6c",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:cb80c035af40",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Finalizzazione Collettiva",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:b20af7be4cea",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Finalizzazione Collettiva",
    "subprinciple": "Scardinamento Linea Difensiva",
    "detail": null,
    "parent": "ftb1:settore_giovanile:cb80c035af40",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:bd1db9f92966",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Finalizzazione Collettiva",
    "subprinciple": "Scardinamento Linea Difensiva",
    "detail": "Attacco coordinato della profondità (Tagli e passanti)",
    "parent": "ftb1:settore_giovanile:b20af7be4cea",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:fc894733be91",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Finalizzazione Collettiva",
    "subprinciple": "Scardinamento Linea Difensiva",
    "detail": "Sovrapposizione codificata interna o esterna",
    "parent": "ftb1:settore_giovanile:b20af7be4cea",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:50cd37cb478d",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Finalizzazione Collettiva",
    "subprinciple": "Occupazione dell'Area",
    "detail": null,
    "parent": "ftb1:settore_giovanile:cb80c035af40",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:c0776df27d2e",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Finalizzazione Collettiva",
    "subprinciple": "Occupazione dell'Area",
    "detail": "Attacco dei tempi di inserimento (Primo palo, secondo palo, rimorchio)",
    "parent": "ftb1:settore_giovanile:50cd37cb478d",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:4594c7e647c9",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Organizzazione del blocco difensivo",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:176c0cce84d3",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Organizzazione del blocco difensivo",
    "subprinciple": "Comportamento di Reparto",
    "detail": null,
    "parent": "ftb1:settore_giovanile:4594c7e647c9",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:d574e553f740",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Organizzazione del blocco difensivo",
    "subprinciple": "Comportamento di Reparto",
    "detail": "Scivolamento laterale e Diagonale difensiva",
    "parent": "ftb1:settore_giovanile:176c0cce84d3",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:3e2d6fa18365",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Organizzazione del blocco difensivo",
    "subprinciple": "Comportamento di Reparto",
    "detail": "Lettura della Palla Coperta / Palla Scoperta (Scappare o accorciare)",
    "parent": "ftb1:settore_giovanile:176c0cce84d3",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:7ba5206145f0",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Organizzazione del blocco difensivo",
    "subprinciple": "Strategia di Pressione",
    "detail": null,
    "parent": "ftb1:settore_giovanile:4594c7e647c9",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:d3709abacc35",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Organizzazione del blocco difensivo",
    "subprinciple": "Strategia di Pressione",
    "detail": "Pressione orientata per mandare l'avversario sull'esterno",
    "parent": "ftb1:settore_giovanile:7ba5206145f0",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:e9d573bbfaa7",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Protezione della Zona d'Ombra",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:139320a8de57",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Protezione della Zona d'Ombra",
    "subprinciple": "Difesa degli Ultimi 16 Metri",
    "detail": null,
    "parent": "ftb1:settore_giovanile:e9d573bbfaa7",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:0def1f4d3cd1",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Protezione della Zona d'Ombra",
    "subprinciple": "Difesa degli Ultimi 16 Metri",
    "detail": "Densità centrale e protezione del corridoio interno",
    "parent": "ftb1:settore_giovanile:139320a8de57",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:84e69ddd8685",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Protezione della Zona d'Ombra",
    "subprinciple": "Difesa degli Ultimi 16 Metri",
    "detail": "Cross-protection e marcature a uomo in area di rigore",
    "parent": "ftb1:settore_giovanile:139320a8de57",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:1bd6a8e6b57a",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Transizione Negativa",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:a8b65d6991b6",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Transizione Negativa",
    "subprinciple": "Scelta Strategica Post-Perdita",
    "detail": null,
    "parent": "ftb1:settore_giovanile:1bd6a8e6b57a",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:736641209956",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Transizione Negativa",
    "subprinciple": "Scelta Strategica Post-Perdita",
    "detail": "Gegenpressing (Riacquisto feroce nei primi 3-5 secondi)",
    "parent": "ftb1:settore_giovanile:a8b65d6991b6",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:20ebc0d01da5",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Transizione Negativa",
    "subprinciple": "Scelta Strategica Post-Perdita",
    "detail": "Ripiegamento scappando all'indietro per coprire la profondità",
    "parent": "ftb1:settore_giovanile:a8b65d6991b6",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:d03cb9d80e96",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Transizione Positiva",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:d350473b262d",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Transizione Positiva",
    "subprinciple": "Sfruttamento Disorganizzazione Avversaria",
    "detail": null,
    "parent": "ftb1:settore_giovanile:d03cb9d80e96",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:09da4c404045",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Transizione Positiva",
    "subprinciple": "Sfruttamento Disorganizzazione Avversaria",
    "detail": "Verticalizzazione immediata (Contropiede diretto)",
    "parent": "ftb1:settore_giovanile:d350473b262d",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:95469815cd1a",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Transizione Positiva",
    "subprinciple": "Sfruttamento Disorganizzazione Avversaria",
    "detail": "Consolidamento del possesso (Palleggio di sicurezza per riorganizzarsi)",
    "parent": "ftb1:settore_giovanile:d350473b262d",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:e5594ca59d68",
    "section": "settore_giovanile",
    "area": "Movimento e prevenzione",
    "principle": "Espressione di Forza e Resistenza Organica",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:5025b1916c6a",
    "section": "settore_giovanile",
    "area": "Movimento e prevenzione",
    "principle": "Espressione di Forza e Resistenza Organica",
    "subprinciple": "Espressione di Forza Specifico-Funzionale",
    "detail": null,
    "parent": "ftb1:settore_giovanile:e5594ca59d68",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:fd83356348cc",
    "section": "settore_giovanile",
    "area": "Movimento e prevenzione",
    "principle": "Espressione di Forza e Resistenza Organica",
    "subprinciple": "Espressione di Forza Specifico-Funzionale",
    "detail": "Forza rapida ed esplosiva (Scatti, balzi, frenate, cambi di direzione)",
    "parent": "ftb1:settore_giovanile:5025b1916c6a",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:1b8afcb8c06e",
    "section": "settore_giovanile",
    "area": "Movimento e prevenzione",
    "principle": "Espressione di Forza e Resistenza Organica",
    "subprinciple": "Espressione di Forza Specifico-Funzionale",
    "detail": "Forza resistente e Core Stability (Tenuta dei contrasti e protezione della palla)",
    "parent": "ftb1:settore_giovanile:5025b1916c6a",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:c0694f281948",
    "section": "settore_giovanile",
    "area": "Movimento e prevenzione",
    "principle": "Espressione di Forza e Resistenza Organica",
    "subprinciple": "Capacità Energetiche",
    "detail": null,
    "parent": "ftb1:settore_giovanile:e5594ca59d68",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:f8a24808eb38",
    "section": "settore_giovanile",
    "area": "Movimento e prevenzione",
    "principle": "Espressione di Forza e Resistenza Organica",
    "subprinciple": "Capacità Energetiche",
    "detail": "Potenza aerobica ed efficienza metabolica (Tenuta della distanza/durata)",
    "parent": "ftb1:settore_giovanile:c0694f281948",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:4a2c08e9c2e7",
    "section": "settore_giovanile",
    "area": "Movimento e prevenzione",
    "principle": "Espressione di Forza e Resistenza Organica",
    "subprinciple": "Capacità Energetiche",
    "detail": "Capacità anaerobica lattacida e alattacida (Ripetizione degli scatti ad alta intensità)",
    "parent": "ftb1:settore_giovanile:c0694f281948",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:5616724ca3fb",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Tecnica Funzionale alla Tattica",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:1a288d02b2b5",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Tecnica Funzionale alla Tattica",
    "subprinciple": "Esecuzione in Velocità e Spazio Ridotto",
    "detail": null,
    "parent": "ftb1:settore_giovanile:5616724ca3fb",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:7012e91fcfa6",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Tecnica Funzionale alla Tattica",
    "subprinciple": "Esecuzione in Velocità e Spazio Ridotto",
    "detail": "Controllo orientato a seguire con interno piede ed esterno piede",
    "parent": "ftb1:settore_giovanile:1a288d02b2b5",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:a0dccd05616e",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Tecnica Funzionale alla Tattica",
    "subprinciple": "Esecuzione in Velocità e Spazio Ridotto",
    "detail": "Controllo orientato a seguire con la pianta del piede",
    "parent": "ftb1:settore_giovanile:1a288d02b2b5",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:fc3dd6d5d4c6",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Tecnica Funzionale alla Tattica",
    "subprinciple": "Esecuzione in Velocità e Spazio Ridotto",
    "detail": "Spostamento rapido e protezione della palla con esterno piede in regime di contrasto",
    "parent": "ftb1:settore_giovanile:1a288d02b2b5",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:d113167fd0cd",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Tecnica Funzionale alla Tattica",
    "subprinciple": "Esecuzione in Velocità e Spazio Ridotto",
    "detail": "Calcio/trasmissione palla sulla corsa con interno piede o esterno collo piede",
    "parent": "ftb1:settore_giovanile:1a288d02b2b5",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:daa7a65d06e3",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Tecnica Funzionale alla Tattica",
    "subprinciple": "Esecuzione in Velocità e Spazio Ridotto",
    "detail": "Tecnica di tiro avanzata con interno collo piede (Tiro a giro)",
    "parent": "ftb1:settore_giovanile:1a288d02b2b5",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:4e0e3ae0e29b",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Tecnica Funzionale alla Tattica",
    "subprinciple": "Esecuzione in Velocità e Spazio Ridotto",
    "detail": "Tecnica di tiro avanzata con collo del piede pieno (Tiro di potenza al volo o in corsa)",
    "parent": "ftb1:settore_giovanile:1a288d02b2b5",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:9ef50e68ac9a",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Tecnica Funzionale alla Tattica",
    "subprinciple": "Esecuzione in Velocità e Spazio Ridotto",
    "detail": "Colpo di testa (Terzo tempo, tempismo di salto e indirizzamento)",
    "parent": "ftb1:settore_giovanile:1a288d02b2b5",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:952d92c6ac9a",
    "section": "settore_giovanile",
    "area": "Percezione e scelta",
    "principle": "Tattica Cognitiva e Lettura Situazionale",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:a1cd9a07cd5d",
    "section": "settore_giovanile",
    "area": "Percezione e scelta",
    "principle": "Tattica Cognitiva e Lettura Situazionale",
    "subprinciple": "Anticipazione motoria e Decision Making",
    "detail": null,
    "parent": "ftb1:settore_giovanile:952d92c6ac9a",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:a9ced415c998",
    "section": "settore_giovanile",
    "area": "Percezione e scelta",
    "principle": "Tattica Cognitiva e Lettura Situazionale",
    "subprinciple": "Anticipazione motoria e Decision Making",
    "detail": "Anticipazione mentale (Leggere la traiettoria prima dell'avversario)",
    "parent": "ftb1:settore_giovanile:a1cd9a07cd5d",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:ac372e91dcf6",
    "section": "settore_giovanile",
    "area": "Percezione e scelta",
    "principle": "Tattica Cognitiva e Lettura Situazionale",
    "subprinciple": "Anticipazione motoria e Decision Making",
    "detail": "Scansione visiva costante (Scanning: girare la testa prima di ricevere la palla)",
    "parent": "ftb1:settore_giovanile:a1cd9a07cd5d",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:922222aa85c4",
    "section": "settore_giovanile",
    "area": "Percezione e scelta",
    "principle": "Tattica Cognitiva e Lettura Situazionale",
    "subprinciple": "Anticipazione motoria e Decision Making",
    "detail": "Gestione dello stress e della fatica cognitiva nei minuti finali",
    "parent": "ftb1:settore_giovanile:a1cd9a07cd5d",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:4d2bc9e22ea4",
    "section": "settore_giovanile",
    "area": "Movimento e prevenzione",
    "principle": "Stabilità Articolare e Riduzione del Rischio",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:4ba33f4d6372",
    "section": "settore_giovanile",
    "area": "Movimento e prevenzione",
    "principle": "Stabilità Articolare e Riduzione del Rischio",
    "subprinciple": "Controllo Neuromuscolare",
    "detail": null,
    "parent": "ftb1:settore_giovanile:4d2bc9e22ea4",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:65adbfa8fdea",
    "section": "settore_giovanile",
    "area": "Movimento e prevenzione",
    "principle": "Stabilità Articolare e Riduzione del Rischio",
    "subprinciple": "Controllo Neuromuscolare",
    "detail": "Propriocezione d'anca, ginocchio e caviglia (Prevenzione legamentosa)",
    "parent": "ftb1:settore_giovanile:4ba33f4d6372",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:2492c56b4fb3",
    "section": "settore_giovanile",
    "area": "Movimento e prevenzione",
    "principle": "Stabilità Articolare e Riduzione del Rischio",
    "subprinciple": "Controllo Neuromuscolare",
    "detail": "Controllo eccentrico in frenata (Prevenzione degli infortuni muscolari flessori/quadricipiti)",
    "parent": "ftb1:settore_giovanile:4ba33f4d6372",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:9d10c68b0b82",
    "section": "settore_giovanile",
    "area": "Movimento e prevenzione",
    "principle": "Stabilità Articolare e Riduzione del Rischio",
    "subprinciple": "Controllo Neuromuscolare",
    "detail": "Flessibilità e allungamento miofasciale post-sforzo",
    "parent": "ftb1:settore_giovanile:4ba33f4d6372",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:d1adbf26fc7e",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Collaborazione con il compagno",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:ea782bbe585e",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Collaborazione con il compagno",
    "subprinciple": "Triangolazioni",
    "detail": null,
    "parent": "ftb1:scuola_calcio:d1adbf26fc7e",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:50e2c2fa6cc8",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Collaborazione con il compagno",
    "subprinciple": "Triangolazioni",
    "detail": "Dai e vai nel 2 contro 2",
    "parent": "ftb1:scuola_calcio:ea782bbe585e",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:adeebc20d1b7",
    "section": "scuola_calcio",
    "area": "Principi di gioco e collaborazione",
    "principle": "Collaborazione con il compagno",
    "subprinciple": "Triangolazioni",
    "detail": "Aiutare il compagno creando un triangolo di gioco",
    "parent": "ftb1:scuola_calcio:ea782bbe585e",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:ed17390033ac",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Trasmissione palla",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:0974099beb31",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Trasmissione palla",
    "subprinciple": "Precisione e ricezione",
    "detail": null,
    "parent": "ftb1:scuola_calcio:ed17390033ac",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:828bc48d0f16",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Trasmissione palla",
    "subprinciple": "Precisione e ricezione",
    "detail": "Trasmissione al compagno e controllo orientato",
    "parent": "ftb1:scuola_calcio:0974099beb31",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:b257761b4333",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Scoperta del ruolo del portiere",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:17a3cde4112b",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Scoperta del ruolo del portiere",
    "subprinciple": "Presa e orientamento",
    "detail": null,
    "parent": "ftb1:scuola_calcio:b257761b4333",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:ea4d2819ba85",
    "section": "scuola_calcio",
    "area": "Tecnica",
    "principle": "Scoperta del ruolo del portiere",
    "subprinciple": "Presa e orientamento",
    "detail": "Giochi di presa, equilibrio e rilancio",
    "parent": "ftb1:scuola_calcio:17a3cde4112b",
    "depth": 3
  },
  {
    "value": "ftb1:scuola_calcio:a5874649486e",
    "section": "scuola_calcio",
    "area": "Relazione e autonomia",
    "principle": "Collaborare nel gioco",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:scuola_calcio:bbcc4ee9e715",
    "section": "scuola_calcio",
    "area": "Relazione e autonomia",
    "principle": "Collaborare nel gioco",
    "subprinciple": "Rispetto e partecipazione",
    "detail": null,
    "parent": "ftb1:scuola_calcio:a5874649486e",
    "depth": 2
  },
  {
    "value": "ftb1:scuola_calcio:b6f8ba2bf4e8",
    "section": "scuola_calcio",
    "area": "Relazione e autonomia",
    "principle": "Collaborare nel gioco",
    "subprinciple": "Rispetto e partecipazione",
    "detail": "Ascoltare, rispettare le regole e aiutare i compagni",
    "parent": "ftb1:scuola_calcio:bbcc4ee9e715",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:5847729cc607",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Sviluppo e superamento delle linee",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:4d8fd1aeae2d",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Sviluppo e superamento delle linee",
    "subprinciple": "Triangolazione e terzo uomo",
    "detail": null,
    "parent": "ftb1:settore_giovanile:5847729cc607",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:0a522765f457",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Sviluppo e superamento delle linee",
    "subprinciple": "Triangolazione e terzo uomo",
    "detail": "Braccetto al trequartista, scarico e ricerca del compagno sul lato opposto",
    "parent": "ftb1:settore_giovanile:4d8fd1aeae2d",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:bf96dad2a2fb",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Trasmissione palla",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:55856d5a62bd",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Trasmissione palla",
    "subprinciple": "Qualità sotto pressione",
    "detail": null,
    "parent": "ftb1:settore_giovanile:bf96dad2a2fb",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:8af285bcfa02",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Trasmissione palla",
    "subprinciple": "Qualità sotto pressione",
    "detail": "Tempi e orientamento della trasmissione per la giocata successiva",
    "parent": "ftb1:settore_giovanile:55856d5a62bd",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:af7ce61e1bc7",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Portiere e squadra",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:eda854f4b609",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Portiere e squadra",
    "subprinciple": "Tecnica e collaborazione",
    "detail": null,
    "parent": "ftb1:settore_giovanile:af7ce61e1bc7",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:a99fe41a487f",
    "section": "settore_giovanile",
    "area": "Tecnica",
    "principle": "Portiere e squadra",
    "subprinciple": "Tecnica e collaborazione",
    "detail": "Posizione, presa e distribuzione in relazione ai compagni",
    "parent": "ftb1:settore_giovanile:eda854f4b609",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:5f03cd291669",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Riprese del gioco",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:9799ced6f106",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Riprese del gioco",
    "subprinciple": "Organizzazione e responsabilità",
    "detail": null,
    "parent": "ftb1:settore_giovanile:5f03cd291669",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:bfeee81764ee",
    "section": "settore_giovanile",
    "area": "Organizzazione tattica",
    "principle": "Riprese del gioco",
    "subprinciple": "Organizzazione e responsabilità",
    "detail": "Collaborazioni su rimesse, calci d’angolo e punizioni",
    "parent": "ftb1:settore_giovanile:9799ced6f106",
    "depth": 3
  },
  {
    "value": "ftb1:settore_giovanile:fcaa2384ac73",
    "section": "settore_giovanile",
    "area": "Relazione e autonomia",
    "principle": "Responsabilità nel gruppo",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:settore_giovanile:af97dfd8060a",
    "section": "settore_giovanile",
    "area": "Relazione e autonomia",
    "principle": "Responsabilità nel gruppo",
    "subprinciple": "Comunicazione",
    "detail": null,
    "parent": "ftb1:settore_giovanile:fcaa2384ac73",
    "depth": 2
  },
  {
    "value": "ftb1:settore_giovanile:88066e268df2",
    "section": "settore_giovanile",
    "area": "Relazione e autonomia",
    "principle": "Responsabilità nel gruppo",
    "subprinciple": "Comunicazione",
    "detail": "Comunicare e scegliere con autonomia nei compiti assegnati",
    "parent": "ftb1:settore_giovanile:af97dfd8060a",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:60bdee77b9ab",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Costruzione e sviluppo",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:cd47a7fbb2c9",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Costruzione e sviluppo",
    "subprinciple": "Uscita dalla pressione",
    "detail": null,
    "parent": "ftb1:prima_squadra:60bdee77b9ab",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:80b90ee003c9",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Costruzione e sviluppo",
    "subprinciple": "Uscita dalla pressione",
    "detail": "Adattare le uscite alla pressione avversaria",
    "parent": "ftb1:prima_squadra:cd47a7fbb2c9",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:8657b3fc9e3c",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Costruzione e sviluppo",
    "subprinciple": "Uscita dalla pressione",
    "detail": "Terzo uomo, rotazioni e cambio del lato",
    "parent": "ftb1:prima_squadra:cd47a7fbb2c9",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:6c421481b3d0",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Rifinitura e finalizzazione",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:3a4d49a0a1e5",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Rifinitura e finalizzazione",
    "subprinciple": "Attacco della linea",
    "detail": null,
    "parent": "ftb1:prima_squadra:6c421481b3d0",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:7db88182e40a",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Rifinitura e finalizzazione",
    "subprinciple": "Attacco della linea",
    "detail": "Tempi di inserimento e occupazione dell’area",
    "parent": "ftb1:prima_squadra:3a4d49a0a1e5",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:e168f5862dcd",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Rifinitura e finalizzazione",
    "subprinciple": "Attacco della linea",
    "detail": "Ampiezza, profondità e relazioni tra reparti",
    "parent": "ftb1:prima_squadra:3a4d49a0a1e5",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:9c7e91bbd46c",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Organizzazione difensiva",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:5fd0b2df58f3",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Organizzazione difensiva",
    "subprinciple": "Pressione e coperture",
    "detail": null,
    "parent": "ftb1:prima_squadra:9c7e91bbd46c",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:db48e3b285f9",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Organizzazione difensiva",
    "subprinciple": "Pressione e coperture",
    "detail": "Altezze del blocco e segnali di pressione",
    "parent": "ftb1:prima_squadra:5fd0b2df58f3",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:36243bab1319",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Organizzazione difensiva",
    "subprinciple": "Pressione e coperture",
    "detail": "Distanze, coperture e difesa della profondità",
    "parent": "ftb1:prima_squadra:5fd0b2df58f3",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:ee9186fc2975",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Transizioni",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:48ee5d4cd794",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Transizioni",
    "subprinciple": "Gestione della riconquista e della perdita",
    "detail": null,
    "parent": "ftb1:prima_squadra:ee9186fc2975",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:1dd4b8a3e278",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Transizioni",
    "subprinciple": "Gestione della riconquista e della perdita",
    "detail": "Scelta tra riaggressione e ripiegamento",
    "parent": "ftb1:prima_squadra:48ee5d4cd794",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:a0e1774b4070",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Transizioni",
    "subprinciple": "Gestione della riconquista e della perdita",
    "detail": "Attacco rapido o consolidamento del possesso",
    "parent": "ftb1:prima_squadra:48ee5d4cd794",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:42caba2a2691",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Palle inattive",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:7158547c8460",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Palle inattive",
    "subprinciple": "Soluzioni e responsabilità",
    "detail": null,
    "parent": "ftb1:prima_squadra:42caba2a2691",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:ca24400b6bd0",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Palle inattive",
    "subprinciple": "Soluzioni e responsabilità",
    "detail": "Organizzazione offensiva e preventiva",
    "parent": "ftb1:prima_squadra:7158547c8460",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:10d2a0b2b443",
    "section": "prima_squadra",
    "area": "Modello di gioco",
    "principle": "Palle inattive",
    "subprinciple": "Soluzioni e responsabilità",
    "detail": "Marcature, coperture e seconde palle",
    "parent": "ftb1:prima_squadra:7158547c8460",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:41bbd41ef424",
    "section": "prima_squadra",
    "area": "Tecnica",
    "principle": "Trasmissione palla",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:426d91e03acb",
    "section": "prima_squadra",
    "area": "Tecnica",
    "principle": "Trasmissione palla",
    "subprinciple": "Esecuzione nel contesto",
    "detail": null,
    "parent": "ftb1:prima_squadra:41bbd41ef424",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:ec05a659e250",
    "section": "prima_squadra",
    "area": "Tecnica",
    "principle": "Trasmissione palla",
    "subprinciple": "Esecuzione nel contesto",
    "detail": "Velocità e precisione sotto pressione",
    "parent": "ftb1:prima_squadra:426d91e03acb",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:87317592fc9a",
    "section": "prima_squadra",
    "area": "Tecnica",
    "principle": "Trasmissione palla",
    "subprinciple": "Esecuzione nel contesto",
    "detail": "Orientamento del controllo e giocata successiva",
    "parent": "ftb1:prima_squadra:426d91e03acb",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:1850ad908ec4",
    "section": "prima_squadra",
    "area": "Tecnica",
    "principle": "Finalizzazione",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:89856595a094",
    "section": "prima_squadra",
    "area": "Tecnica",
    "principle": "Finalizzazione",
    "subprinciple": "Scelta e qualità esecutiva",
    "detail": null,
    "parent": "ftb1:prima_squadra:1850ad908ec4",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:462b45316e9d",
    "section": "prima_squadra",
    "area": "Tecnica",
    "principle": "Finalizzazione",
    "subprinciple": "Scelta e qualità esecutiva",
    "detail": "Conclusione in relazione a porta e avversario",
    "parent": "ftb1:prima_squadra:89856595a094",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:640f669fa1a2",
    "section": "prima_squadra",
    "area": "Tecnica",
    "principle": "Portiere",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:70d5ca382a19",
    "section": "prima_squadra",
    "area": "Tecnica",
    "principle": "Portiere",
    "subprinciple": "Integrazione nel modello",
    "detail": null,
    "parent": "ftb1:prima_squadra:640f669fa1a2",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:6c73d79785ec",
    "section": "prima_squadra",
    "area": "Tecnica",
    "principle": "Portiere",
    "subprinciple": "Integrazione nel modello",
    "detail": "Distribuzione, sostegno e difesa dello spazio",
    "parent": "ftb1:prima_squadra:70d5ca382a19",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:4f99d07eef71",
    "section": "prima_squadra",
    "area": "Tecnica",
    "principle": "Portiere",
    "subprinciple": "Integrazione nel modello",
    "detail": "Gestione di area, cross e conclusioni",
    "parent": "ftb1:prima_squadra:70d5ca382a19",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:078426977900",
    "section": "prima_squadra",
    "area": "Preparazione fisica",
    "principle": "Forza e potenza",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:e93bbde62d02",
    "section": "prima_squadra",
    "area": "Preparazione fisica",
    "principle": "Forza e potenza",
    "subprinciple": "Espressione specifica",
    "detail": null,
    "parent": "ftb1:prima_squadra:078426977900",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:c73bfaf6cd1f",
    "section": "prima_squadra",
    "area": "Preparazione fisica",
    "principle": "Forza e potenza",
    "subprinciple": "Espressione specifica",
    "detail": "Accelerazione, frenata e cambio di direzione",
    "parent": "ftb1:prima_squadra:e93bbde62d02",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:f6040445bd4c",
    "section": "prima_squadra",
    "area": "Preparazione fisica",
    "principle": "Forza e potenza",
    "subprinciple": "Espressione specifica",
    "detail": "Forza e controllo nelle azioni di gioco",
    "parent": "ftb1:prima_squadra:e93bbde62d02",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:8473ce09e9df",
    "section": "prima_squadra",
    "area": "Preparazione fisica",
    "principle": "Resistenza",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:506771deeadb",
    "section": "prima_squadra",
    "area": "Preparazione fisica",
    "principle": "Resistenza",
    "subprinciple": "Intensità e continuità",
    "detail": null,
    "parent": "ftb1:prima_squadra:8473ce09e9df",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:ca1dba0691fd",
    "section": "prima_squadra",
    "area": "Preparazione fisica",
    "principle": "Resistenza",
    "subprinciple": "Intensità e continuità",
    "detail": "Ripetizione delle azioni nel compito di gioco",
    "parent": "ftb1:prima_squadra:506771deeadb",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:140dedfb36b9",
    "section": "prima_squadra",
    "area": "Preparazione fisica",
    "principle": "Resistenza",
    "subprinciple": "Intensità e continuità",
    "detail": "Gestione del carico in relazione alla gara",
    "parent": "ftb1:prima_squadra:506771deeadb",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:719227efc986",
    "section": "prima_squadra",
    "area": "Movimento e prevenzione",
    "principle": "Controllo motorio",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:6a58b4d5c982",
    "section": "prima_squadra",
    "area": "Movimento e prevenzione",
    "principle": "Controllo motorio",
    "subprinciple": "Qualità e recupero",
    "detail": null,
    "parent": "ftb1:prima_squadra:719227efc986",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:ecca00f5ff8d",
    "section": "prima_squadra",
    "area": "Movimento e prevenzione",
    "principle": "Controllo motorio",
    "subprinciple": "Qualità e recupero",
    "detail": "Mobilità e stabilità",
    "parent": "ftb1:prima_squadra:6a58b4d5c982",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:b034c6719efb",
    "section": "prima_squadra",
    "area": "Movimento e prevenzione",
    "principle": "Controllo motorio",
    "subprinciple": "Qualità e recupero",
    "detail": "Controllo nelle frenate e negli appoggi",
    "parent": "ftb1:prima_squadra:6a58b4d5c982",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:dc3e4b027e70",
    "section": "prima_squadra",
    "area": "Percezione e scelta",
    "principle": "Lettura della gara",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:16c8a93c4a6a",
    "section": "prima_squadra",
    "area": "Percezione e scelta",
    "principle": "Lettura della gara",
    "subprinciple": "Adattamento",
    "detail": null,
    "parent": "ftb1:prima_squadra:dc3e4b027e70",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:da57613c8904",
    "section": "prima_squadra",
    "area": "Percezione e scelta",
    "principle": "Lettura della gara",
    "subprinciple": "Adattamento",
    "detail": "Scansione e anticipazione",
    "parent": "ftb1:prima_squadra:16c8a93c4a6a",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:da338b599e4e",
    "section": "prima_squadra",
    "area": "Percezione e scelta",
    "principle": "Lettura della gara",
    "subprinciple": "Adattamento",
    "detail": "Scelte in relazione al comportamento avversario",
    "parent": "ftb1:prima_squadra:16c8a93c4a6a",
    "depth": 3
  },
  {
    "value": "ftb1:prima_squadra:319fafedd47b",
    "section": "prima_squadra",
    "area": "Relazione e autonomia",
    "principle": "Leadership e comunicazione",
    "subprinciple": null,
    "detail": null,
    "parent": null,
    "depth": 1
  },
  {
    "value": "ftb1:prima_squadra:3d8078d8cd7c",
    "section": "prima_squadra",
    "area": "Relazione e autonomia",
    "principle": "Leadership e comunicazione",
    "subprinciple": "Coordinamento",
    "detail": null,
    "parent": "ftb1:prima_squadra:319fafedd47b",
    "depth": 2
  },
  {
    "value": "ftb1:prima_squadra:ab41921f7a02",
    "section": "prima_squadra",
    "area": "Relazione e autonomia",
    "principle": "Leadership e comunicazione",
    "subprinciple": "Coordinamento",
    "detail": "Comunicazione tra reparti e responsabilità condivise",
    "parent": "ftb1:prima_squadra:3d8078d8cd7c",
    "depth": 3
  }
];
const byValue = new Map(TRAINING_PRINCIPLES.map(item => [item.value, item]));
export function trainingPrinciple(value: string | null | undefined) { return value ? byValue.get(value) : undefined; }
export function trainingPrincipleLabel(value: string | null | undefined): string {
  if (!value) return "";
  const item = trainingPrinciple(value);
  if (item) return item.detail ?? item.subprinciple ?? item.principle;
  const legacy: Record<string,string> = {forza:"FORZA",resistenza:"RESISTENZA",tecnico_tattico:"TECNICO TATTICO"};
  return legacy[value.trim().toLowerCase()] ?? value;
}
export function normalizePrincipleSection(value: string | null | undefined): TrainingPrincipleSection | null {
  const normalized = value?.replace(/-/g, "_");
  return normalized === "scuola_calcio" || normalized === "settore_giovanile" || normalized === "prima_squadra" ? normalized : null;
}
