/** Deterministic UUIDs and constants for seeded test data. */

export const SEED = {
  decks: {
    spanish: { id: "a0000000-0000-0000-0000-000000000001", name: "Spanish" },
    spanishVerbs: {
      id: "a0000000-0000-0000-0000-000000000002",
      name: "Spanish::Verbs",
    },
    math: { id: "a0000000-0000-0000-0000-000000000003", name: "Math" },
    empty: { id: "a0000000-0000-0000-0000-000000000004", name: "Empty" },
  },
  noteTypes: {
    basic: {
      id: "b0000000-0000-0000-0000-000000000001",
      name: "E2E Basic",
      fields: ["Front", "Back"],
    },
    cloze: {
      id: "b0000000-0000-0000-0000-000000000002",
      name: "E2E Cloze",
      fields: ["Text", "Extra"],
    },
  },
  templates: {
    basicCard1: { id: "c0000000-0000-0000-0000-000000000001" },
    clozeCard1: { id: "c0000000-0000-0000-0000-000000000002" },
  },
  notes: {
    spanishVerb1: {
      id: "d0000000-0000-0000-0000-000000000001",
      fields: { Front: "hablar", Back: "to speak" },
    },
    spanishVerb2: {
      id: "d0000000-0000-0000-0000-000000000002",
      fields: { Front: "comer", Back: "to eat" },
    },
    spanishVerb3: {
      id: "d0000000-0000-0000-0000-000000000003",
      fields: { Front: "vivir", Back: "to live" },
    },
    spanishVerb4: {
      id: "d0000000-0000-0000-0000-000000000004",
      fields: { Front: "dormir", Back: "to sleep" },
    },
    mathBasic: {
      id: "d0000000-0000-0000-0000-000000000005",
      fields: { Front: "2+2", Back: "4" },
    },
    mathCloze: {
      id: "d0000000-0000-0000-0000-000000000006",
      fields: {
        Text: "The {{c1::derivative}} of x^2 is 2x",
        Extra: "Calculus",
      },
    },
  },
  cards: {
    spanishVerb1: { id: "e0000000-0000-0000-0000-000000000001" },
    spanishVerb2: { id: "e0000000-0000-0000-0000-000000000002" },
    spanishVerb3: { id: "e0000000-0000-0000-0000-000000000003" },
    spanishVerb4: { id: "e0000000-0000-0000-0000-000000000004" },
    mathBasic: { id: "e0000000-0000-0000-0000-000000000005" },
    mathCloze: { id: "e0000000-0000-0000-0000-000000000006" },
  },
} as const;
