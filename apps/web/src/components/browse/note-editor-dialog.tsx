import { useState, useCallback, useEffect, useMemo } from "react";
import { Trash2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FieldAttachments,
  isMediaOnlyField,
} from "@/components/browse/field-attachments";
import {
  FieldsTab,
  TemplatesTab,
  CssTab,
  PreviewTab,
} from "@/components/note-type-editor-tabs";
import {
  useNoteDetail,
  useUpdateNote,
  useDeleteNote,
} from "@/lib/hooks/use-browse";
import { useNoteType, useUpdateNoteType } from "@/lib/hooks/use-note-types";
import type { NoteTypeField } from "@/lib/hooks/use-note-types";
import { useDecks } from "@/lib/hooks/use-decks";
import type { DeckTreeNode } from "@/lib/hooks/use-decks";

function flattenDecks(
  nodes: DeckTreeNode[],
): Array<{ id: string; name: string }> {
  const result: Array<{ id: string; name: string }> = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name });
    if (node.children.length > 0) {
      result.push(...flattenDecks(node.children));
    }
  }
  return result;
}

// oxlint-disable-next-line eslint(complexity) -- editor dialog with multiple tabs inherently has high branching
export function NoteEditorDialog({
  noteId,
  open,
  onOpenChange,
}: {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const { data: noteDetail, isLoading, error } = useNoteDetail(noteId);
  const noteTypeId = noteDetail?.noteType?.id;
  const { data: noteTypeData } = useNoteType(noteTypeId);
  const { data: decks } = useDecks();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const updateNoteType = useUpdateNoteType();

  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const flatDecks = decks ? flattenDecks(decks) : [];

  // Reset edit fields when note detail changes
  useEffect(() => {
    if (noteDetail) {
      setEditFields(
        typeof noteDetail.note.fields === "string"
          ? (JSON.parse(noteDetail.note.fields) as Record<string, string>)
          : noteDetail.note.fields,
      );
      setSelectedDeckId(noteDetail.deckId);
    }
  }, [noteDetail]);

  const handleFieldChange = useCallback((fieldName: string, value: string) => {
    setEditFields((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    await updateNote.mutateAsync({
      noteId,
      fields: editFields,
      deckId: selectedDeckId || undefined,
    });
  }, [noteId, editFields, selectedDeckId, updateNote]);

  async function handleDelete(): Promise<void> {
    await deleteNote.mutateAsync(noteId);
    setDeleteOpen(false);
    onOpenChange(false);
  }

  // Get field names from the full note type data (already parsed as NoteTypeField[])
  const noteTypeFields: NoteTypeField[] = noteTypeData?.noteType.fields ?? [];
  const noteTypeFieldsRef = noteTypeData?.noteType.fields;
  const fieldNames = useMemo(
    () => (noteTypeFieldsRef ?? []).map((f) => f.name),
    [noteTypeFieldsRef],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] flex-col overflow-hidden sm:max-w-4xl">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Loading note...</p>
          </div>
        )}

        {(error ?? !noteDetail) && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Failed to load note.
            </div>
          </div>
        )}

        {noteDetail && (
          <>
            <DialogHeader>
              <DialogTitle>Edit Note</DialogTitle>
              <DialogDescription>
                Edit note fields and note type configuration
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="note" className="flex min-h-0 flex-1 flex-col">
              <TabsList>
                <TabsTrigger value="note">Note</TabsTrigger>
                <TabsTrigger value="fields">Fields</TabsTrigger>
                <TabsTrigger value="templates">Templates</TabsTrigger>
                <TabsTrigger value="css">CSS</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="note" className="mt-4 overflow-y-auto">
                <div className="space-y-4">
                  {/* Note fields */}
                  <div className="space-y-3">
                    {noteTypeFields.map((field) => {
                      const val = editFields[field.name] ?? "";
                      const mediaOnly = isMediaOnlyField(val);
                      return (
                        <div key={field.name} className="space-y-1">
                          <Label className="text-xs">{field.name}</Label>
                          {!mediaOnly && (
                            <Input
                              value={val}
                              onChange={(e) =>
                                handleFieldChange(field.name, e.target.value)
                              }
                              className="text-xs"
                            />
                          )}
                          <FieldAttachments
                            fieldValue={val}
                            onFieldChange={(newValue) =>
                              handleFieldChange(field.name, newValue)
                            }
                            mediaExclusive
                          />
                        </div>
                      );
                    })}
                    {/* Fallback if note type fields not yet loaded */}
                    {noteTypeFields.length === 0 &&
                      Object.entries(editFields).map(([key, value]) => {
                        const mediaOnly = isMediaOnlyField(value);
                        return (
                          <div key={key} className="space-y-1">
                            <Label className="text-xs">{key}</Label>
                            {!mediaOnly && (
                              <Input
                                value={value}
                                onChange={(e) =>
                                  handleFieldChange(key, e.target.value)
                                }
                                className="text-xs"
                              />
                            )}
                            <FieldAttachments
                              fieldValue={value}
                              onFieldChange={(newValue) =>
                                handleFieldChange(key, newValue)
                              }
                              mediaExclusive
                            />
                          </div>
                        );
                      })}
                  </div>

                  {/* Deck selector */}
                  <div className="space-y-1">
                    <Label className="text-xs">Deck</Label>
                    <Select
                      value={selectedDeckId}
                      onValueChange={setSelectedDeckId}
                    >
                      <SelectTrigger className="w-full text-xs">
                        <SelectValue placeholder="Select deck" />
                      </SelectTrigger>
                      <SelectContent>
                        {flatDecks.map((deck) => (
                          <SelectItem key={deck.id} value={deck.id}>
                            {deck.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Save button */}
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => void handleSave()}
                    disabled={updateNote.isPending}
                  >
                    <Save className="size-3.5" data-icon="inline-start" />
                    {updateNote.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="fields" className="mt-4 overflow-y-auto">
                {noteTypeData ? (
                  <FieldsTab
                    fields={noteTypeData.noteType.fields}
                    noteTypeId={noteTypeData.noteType.id}
                    onSave={updateNoteType}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Loading...
                  </p>
                )}
              </TabsContent>

              <TabsContent value="templates" className="mt-4 overflow-y-auto">
                {noteTypeData ? (
                  <TemplatesTab
                    templates={noteTypeData.templates}
                    noteTypeId={noteTypeData.noteType.id}
                    fieldNames={fieldNames}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Loading...
                  </p>
                )}
              </TabsContent>

              <TabsContent value="css" className="mt-4 overflow-y-auto">
                {noteTypeData ? (
                  <CssTab
                    css={noteTypeData.noteType.css ?? ""}
                    noteTypeId={noteTypeData.noteType.id}
                    onSave={updateNoteType}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Loading...
                  </p>
                )}
              </TabsContent>

              <TabsContent value="preview" className="mt-4 overflow-y-auto">
                {noteTypeData ? (
                  <PreviewTab
                    fields={noteTypeData.noteType.fields}
                    templates={noteTypeData.templates}
                    css={noteTypeData.noteType.css ?? ""}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Loading...
                  </p>
                )}
              </TabsContent>
            </Tabs>

            {/* Footer with delete button */}
            <div className="flex justify-end border-t pt-4">
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-3.5" data-icon="inline-start" />
                  Delete Note
                </Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Note</DialogTitle>
                    <DialogDescription>
                      This will permanently delete this note and all its cards.
                      This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setDeleteOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void handleDelete()}
                      disabled={deleteNote.isPending}
                    >
                      {deleteNote.isPending ? "Deleting..." : "Delete"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
