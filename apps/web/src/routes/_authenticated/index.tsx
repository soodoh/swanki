import { createFileRoute } from "@tanstack/react-router";

import { DeckTree } from "@/components/deck-tree";
import { useDecks } from "@/lib/hooks/use-decks";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard(): React.ReactElement {
  const { data: decks, isLoading, error } = useDecks();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <h1 className="text-lg font-bold tracking-tight">Swanki</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Loading decks...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Failed to load decks. Please try again.
          </div>
        )}

        {decks && <DeckTree decks={decks} />}
      </main>
    </div>
  );
}
