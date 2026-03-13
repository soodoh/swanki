import { useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useNoteType,
  useUpdateNoteType,
  useSampleNote,
} from "@/lib/hooks/use-note-types";
import type { NoteTypeField, CardTemplate } from "@/lib/hooks/use-note-types";
import {
  NameEditor,
  FieldsTab,
  CardsTab,
} from "@/components/note-type-editor-tabs";

export function NoteTypeEditorDialog({
  noteTypeId,
  open,
  onOpenChange,
}: {
  noteTypeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const { data, isLoading, error } = useNoteType(noteTypeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] flex-col overflow-hidden sm:max-w-4xl">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              Loading note type...
            </p>
          </div>
        )}

        {(error ?? !data) && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Failed to load note type.
            </div>
          </div>
        )}

        {data && <NoteTypeEditorContent data={data} />}
      </DialogContent>
    </Dialog>
  );
}

function NoteTypeEditorContent({
  data,
}: {
  data: {
    noteType: {
      id: number;
      name: string;
      fields: NoteTypeField[];
      css: string;
    };
    templates: CardTemplate[];
  };
}): React.ReactElement {
  const { noteType, templates } = data;
  const updateNoteType = useUpdateNoteType();
  const { data: sampleNote } = useSampleNote(noteType.id);

  const fieldNames = useMemo(
    () => noteType.fields.map((f) => f.name),
    [noteType.fields],
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{noteType.name}</DialogTitle>
        <DialogDescription>
          Edit fields, templates, and styling
        </DialogDescription>
      </DialogHeader>

      <div className="mb-4">
        <NameEditor
          name={noteType.name}
          noteTypeId={noteType.id}
          onSave={updateNoteType}
        />
      </div>

      <Tabs defaultValue="fields" className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="cards">Cards</TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="mt-4 overflow-y-auto">
          <FieldsTab
            fields={noteType.fields}
            noteTypeId={noteType.id}
            onSave={updateNoteType}
          />
        </TabsContent>

        <TabsContent value="cards" className="mt-4 overflow-y-auto">
          <CardsTab
            templates={templates}
            noteTypeId={noteType.id}
            css={noteType.css ?? ""}
            fieldNames={fieldNames}
            previewFields={sampleNote}
            onSaveCss={updateNoteType}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
