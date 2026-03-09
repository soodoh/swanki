import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Layers, FileText, Trash2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useNoteTypes,
  useCreateNoteType,
  useDeleteNoteType,
} from "@/lib/hooks/use-note-types";
import { NoteTypeEditorDialog } from "@/components/note-type-editor-dialog";

export const Route = createFileRoute("/_authenticated/note-types/")({
  component: NoteTypesPage,
});

function NoteTypesPage(): React.ReactElement {
  const { data: noteTypes, isLoading, error } = useNoteTypes();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFields, setNewFields] = useState("Front, Back");
  const createNoteType = useCreateNoteType();
  const deleteNoteType = useDeleteNoteType();
  const [deleteId, setDeleteId] = useState<string | undefined>(undefined);
  const [selectedNoteTypeId, setSelectedNoteTypeId] = useState<
    string | undefined
  >(undefined);

  async function handleCreate(): Promise<void> {
    if (!newName.trim()) {
      return;
    }

    const fieldNames = newFields
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    const fields = fieldNames.map((name, i) => ({ name, ordinal: i }));

    await createNoteType.mutateAsync({
      name: newName.trim(),
      fields,
    });

    setNewName("");
    setNewFields("Front, Back");
    setCreateOpen(false);
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await deleteNoteType.mutateAsync(id);
      setDeleteId(undefined);
    } catch {
      // Error is handled by the mutation
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">Note Types</h1>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger
              render={
                <Button>
                  <Plus className="size-4" data-icon="inline-start" />
                  New Note Type
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Note Type</DialogTitle>
                <DialogDescription>
                  Define a new note type with custom fields.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="note-type-name">Name</Label>
                  <Input
                    id="note-type-name"
                    placeholder="e.g., Basic, Cloze"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void handleCreate();
                      }
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="note-type-fields">
                    Fields (comma-separated)
                  </Label>
                  <Input
                    id="note-type-fields"
                    placeholder="Front, Back"
                    value={newFields}
                    onChange={(e) => setNewFields(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void handleCreate();
                      }
                    }}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  onClick={() => void handleCreate()}
                  disabled={!newName.trim() || createNoteType.isPending}
                >
                  {createNoteType.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              Loading note types...
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Failed to load note types. Please try again.
          </div>
        )}

        {noteTypes && noteTypes.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Layers className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No note types yet. Create one to get started.
            </p>
          </div>
        )}

        {noteTypes && noteTypes.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {noteTypes.map(({ noteType, templates }) => (
              <Card key={noteType.id} className="group relative">
                <button
                  type="button"
                  className="absolute inset-0 z-10 cursor-pointer"
                  aria-label={`Edit ${noteType.name}`}
                  onClick={() => setSelectedNoteTypeId(noteType.id)}
                />
                <CardHeader>
                  <CardTitle>{noteType.name}</CardTitle>
                  <CardDescription>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {noteType.fields.length}{" "}
                        {noteType.fields.length === 1 ? "field" : "fields"}
                      </Badge>
                      <Badge variant="secondary">
                        <FileText className="mr-1 size-3" />
                        {templates.length}{" "}
                        {templates.length === 1 ? "template" : "templates"}
                      </Badge>
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Fields: {noteType.fields.map((f) => f.name).join(", ")}
                    </p>
                    <Dialog
                      open={deleteId === noteType.id}
                      onOpenChange={(open) =>
                        setDeleteId(open ? noteType.id : undefined)
                      }
                    >
                      <DialogTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="relative z-20"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="size-3.5 text-muted-foreground" />
                          </Button>
                        }
                      />
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete Note Type</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to delete &quot;
                            {noteType.name}&quot;? This cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        {deleteNoteType.isError && (
                          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {deleteNoteType.error.message}
                          </div>
                        )}
                        <DialogFooter>
                          <Button
                            variant="destructive"
                            onClick={() => void handleDelete(noteType.id)}
                            disabled={deleteNoteType.isPending}
                          >
                            {deleteNoteType.isPending
                              ? "Deleting..."
                              : "Delete"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {selectedNoteTypeId && (
          <NoteTypeEditorDialog
            noteTypeId={selectedNoteTypeId}
            open
            onOpenChange={(open) => {
              if (!open) {
                setSelectedNoteTypeId(undefined);
              }
            }}
          />
        )}
      </main>
    </div>
  );
}
