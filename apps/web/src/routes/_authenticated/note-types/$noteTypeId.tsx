import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  useNoteType,
  useUpdateNoteType,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from "@/lib/hooks/use-note-types";
import type { NoteTypeField, CardTemplate } from "@/lib/hooks/use-note-types";
import { renderTemplate } from "@/lib/template-renderer";

export const Route = createFileRoute("/_authenticated/note-types/$noteTypeId")({
  component: NoteTypeEditor,
});

function NoteTypeEditor(): React.ReactElement {
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- TanStack Router params are typed via route tree generation
  const { noteTypeId } = Route.useParams();
  // oxlint-disable-next-line typescript/no-unsafe-argument -- TanStack Router params are typed via route tree generation
  const { data, isLoading, error } = useNoteType(noteTypeId);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading note type...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load note type.
        </div>
        <Link to="/note-types">
          <Button variant="outline">Back to Note Types</Button>
        </Link>
      </div>
    );
  }

  return <NoteTypeEditorContent data={data} />;
}

function NoteTypeEditorContent({
  data,
}: {
  data: {
    noteType: {
      id: string;
      name: string;
      fields: NoteTypeField[];
      css: string;
    };
    templates: CardTemplate[];
  };
}): React.ReactElement {
  const { noteType, templates } = data;
  const updateNoteType = useUpdateNoteType();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Link to="/note-types">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <h1 className="text-sm font-medium">{noteType.name}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Name editor */}
        <div className="mb-6">
          <NameEditor
            name={noteType.name}
            noteTypeId={noteType.id}
            onSave={updateNoteType}
          />
        </div>

        <Tabs defaultValue="fields">
          <TabsList>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="css">CSS</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="fields" className="mt-4">
            <FieldsTab
              fields={noteType.fields}
              noteTypeId={noteType.id}
              onSave={updateNoteType}
            />
          </TabsContent>

          <TabsContent value="templates" className="mt-4">
            <TemplatesTab templates={templates} noteTypeId={noteType.id} />
          </TabsContent>

          <TabsContent value="css" className="mt-4">
            <CssTab
              css={noteType.css ?? ""}
              noteTypeId={noteType.id}
              onSave={updateNoteType}
            />
          </TabsContent>

          <TabsContent value="preview" className="mt-4">
            <PreviewTab
              fields={noteType.fields}
              templates={templates}
              css={noteType.css ?? ""}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

/* ---------- Name Editor ---------- */

function NameEditor({
  name,
  noteTypeId,
  onSave,
}: {
  name: string;
  noteTypeId: string;
  onSave: ReturnType<typeof useUpdateNoteType>;
}): React.ReactElement {
  const [editName, setEditName] = useState(name);

  function handleSave(): void {
    if (editName.trim() && editName.trim() !== name) {
      void onSave.mutateAsync({ id: noteTypeId, name: editName.trim() });
    }
  }

  return (
    <div className="flex items-end gap-3">
      <div className="grid flex-1 gap-2">
        <Label htmlFor="nt-name">Note Type Name</Label>
        <Input
          id="nt-name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />
      </div>
      <Button
        onClick={handleSave}
        disabled={
          !editName.trim() || editName.trim() === name || onSave.isPending
        }
        size="sm"
      >
        Save
      </Button>
    </div>
  );
}

/* ---------- Fields Tab ---------- */

function FieldsTab({
  fields,
  noteTypeId,
  onSave,
}: {
  fields: NoteTypeField[];
  noteTypeId: string;
  onSave: ReturnType<typeof useUpdateNoteType>;
}): React.ReactElement {
  const [localFields, setLocalFields] = useState<NoteTypeField[]>(fields);
  const [newFieldName, setNewFieldName] = useState("");

  function addField(): void {
    if (!newFieldName.trim()) return;
    const nextOrdinal =
      localFields.length > 0
        ? Math.max(...localFields.map((f) => f.ordinal)) + 1
        : 0;
    setLocalFields([
      ...localFields,
      { name: newFieldName.trim(), ordinal: nextOrdinal },
    ]);
    setNewFieldName("");
  }

  function removeField(ordinal: number): void {
    const updated = localFields
      .filter((f) => f.ordinal !== ordinal)
      .map((f, i) => ({ ...f, ordinal: i }));
    setLocalFields(updated);
  }

  function moveField(index: number, direction: -1 | 1): void {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= localFields.length) return;
    const updated = [...localFields];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;
    setLocalFields(updated.map((f, i) => ({ ...f, ordinal: i })));
  }

  function handleSave(): void {
    void onSave.mutateAsync({ id: noteTypeId, fields: localFields });
  }

  const hasChanges = JSON.stringify(localFields) !== JSON.stringify(fields);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fields</CardTitle>
        <CardDescription>
          Define the fields for this note type. Changes are saved when you click
          Save.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {localFields.map((field, index) => (
            <div
              key={field.ordinal}
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
            >
              <GripVertical className="size-4 text-muted-foreground" />
              <span className="flex-1 text-sm">{field.name}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => moveField(index, -1)}
                disabled={index === 0}
              >
                <ArrowUp className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => moveField(index, 1)}
                disabled={index === localFields.length - 1}
              >
                <ArrowDown className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => removeField(field.ordinal)}
                disabled={localFields.length <= 1}
              >
                <Trash2 className="size-3 text-destructive" />
              </Button>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <Input
              placeholder="New field name"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addField();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addField}
              disabled={!newFieldName.trim()}
            >
              <Plus className="size-4" data-icon="inline-start" />
              Add
            </Button>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || onSave.isPending}
            >
              {onSave.isPending ? "Saving..." : "Save Fields"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Templates Tab ---------- */

function TemplatesTab({
  templates,
  noteTypeId,
}: {
  templates: CardTemplate[];
  noteTypeId: string;
}): React.ReactElement {
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  async function handleCreate(): Promise<void> {
    if (!newTemplateName.trim()) return;
    await createTemplate.mutateAsync({
      noteTypeId,
      name: newTemplateName.trim(),
      questionTemplate: "{{Front}}",
      answerTemplate: "{{FrontSide}}<hr>{{Back}}",
    });
    setNewTemplateName("");
    setCreateOpen(false);
  }

  async function handleDelete(templateId: string): Promise<void> {
    await deleteTemplate.mutateAsync({ templateId, noteTypeId });
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Card Templates ({templates.length})
        </h3>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              <Button size="sm">
                <Plus className="size-4" data-icon="inline-start" />
                Add Template
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Template</DialogTitle>
              <DialogDescription>
                Add a new card template to this note type.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                placeholder="e.g., Card 1"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
              />
            </div>
            <DialogFooter>
              <Button
                onClick={() => void handleCreate()}
                disabled={!newTemplateName.trim() || createTemplate.isPending}
              >
                {createTemplate.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 && (
        <div className="flex items-center justify-center rounded-lg border border-dashed py-8">
          <p className="text-sm text-muted-foreground">
            No templates yet. Add one to define how cards are displayed.
          </p>
        </div>
      )}

      {templates.map((template) => (
        <Card key={template.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{template.name}</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setEditingId(
                      editingId === template.id ? undefined : template.id,
                    )
                  }
                >
                  {editingId === template.id ? "Close" : "Edit"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void handleDelete(template.id)}
                  disabled={deleteTemplate.isPending || templates.length <= 1}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          {editingId === template.id && (
            <CardContent>
              <TemplateEditor
                template={template}
                noteTypeId={noteTypeId}
                onSave={updateTemplate}
              />
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function TemplateEditor({
  template,
  noteTypeId,
  onSave,
}: {
  template: CardTemplate;
  noteTypeId: string;
  onSave: ReturnType<typeof useUpdateTemplate>;
}): React.ReactElement {
  const [question, setQuestion] = useState(template.questionTemplate);
  const [answer, setAnswer] = useState(template.answerTemplate);

  function handleSave(): void {
    void onSave.mutateAsync({
      templateId: template.id,
      noteTypeId,
      questionTemplate: question,
      answerTemplate: answer,
    });
  }

  const hasChanges =
    question !== template.questionTemplate ||
    answer !== template.answerTemplate;

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`q-${template.id}`}>Question Template</Label>
        <textarea
          id={`q-${template.id}`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`a-${template.id}`}>Answer Template</Label>
        <textarea
          id={`a-${template.id}`}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className="h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || onSave.isPending}
          size="sm"
        >
          {onSave.isPending ? "Saving..." : "Save Template"}
        </Button>
      </div>
    </div>
  );
}

/* ---------- CSS Tab ---------- */

function CssTab({
  css,
  noteTypeId,
  onSave,
}: {
  css: string;
  noteTypeId: string;
  onSave: ReturnType<typeof useUpdateNoteType>;
}): React.ReactElement {
  const [localCss, setLocalCss] = useState(css);

  function handleSave(): void {
    void onSave.mutateAsync({ id: noteTypeId, css: localCss });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom CSS</CardTitle>
        <CardDescription>
          Style your cards with custom CSS. These styles apply to all templates
          in this note type.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <textarea
            value={localCss}
            onChange={(e) => setLocalCss(e.target.value)}
            placeholder=".card { font-family: serif; }"
            className="h-48 w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={localCss === css || onSave.isPending}
            >
              {onSave.isPending ? "Saving..." : "Save CSS"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Preview Tab ---------- */

function PreviewTab({
  fields,
  templates,
  css,
}: {
  fields: NoteTypeField[];
  templates: CardTemplate[];
  css: string;
}): React.ReactElement {
  const [sampleData, setSampleData] = useState<Record<string, string>>(() => {
    const data: Record<string, string> = {};
    for (const field of fields) {
      data[field.name] = `(sample ${field.name})`;
    }
    return data;
  });

  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    templates[0]?.id ?? "",
  );

  const template = templates.find((t) => t.id === selectedTemplate);

  const questionHtml = useMemo(() => {
    if (!template) return "";
    return renderTemplate(template.questionTemplate, sampleData, {
      showAnswer: false,
      cardOrdinal: 1,
    });
  }, [template, sampleData]);

  const answerHtml = useMemo(() => {
    if (!template) return "";
    const front = renderTemplate(template.questionTemplate, sampleData, {
      showAnswer: false,
      cardOrdinal: 1,
    });
    return renderTemplate(template.answerTemplate, sampleData, {
      showAnswer: true,
      cardOrdinal: 1,
      frontSide: front,
    });
  }, [template, sampleData]);

  // Note: dangerouslySetInnerHTML is used intentionally here to render
  // user-authored card templates, consistent with the study page pattern.
  // This content is user-owned and rendered only for the authoring user.

  return (
    <div className="grid gap-6">
      {/* Sample data inputs */}
      <Card>
        <CardHeader>
          <CardTitle>Sample Data</CardTitle>
          <CardDescription>
            Enter sample values for each field to preview the card.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {fields.map((field) => (
              <div key={field.name} className="grid gap-1">
                <Label htmlFor={`sample-${field.name}`}>{field.name}</Label>
                <Input
                  id={`sample-${field.name}`}
                  value={sampleData[field.name] ?? ""}
                  onChange={(e) =>
                    setSampleData((prev) => ({
                      ...prev,
                      [field.name]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Template selector */}
      {templates.length > 1 && (
        <div className="flex items-center gap-2">
          <Label>Template:</Label>
          <select
            className="rounded-lg border border-input bg-transparent px-2 py-1 text-sm"
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Preview cards */}
      {template && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Question</CardTitle>
            </CardHeader>
            <CardContent>
              {css && <style>{css}</style>}
              <div
                className="card prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: questionHtml }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Answer</CardTitle>
            </CardHeader>
            <CardContent>
              {css && <style>{css}</style>}
              <div
                className="card prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: answerHtml }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {!template && templates.length === 0 && (
        <div className="flex items-center justify-center rounded-lg border border-dashed py-8">
          <p className="text-sm text-muted-foreground">
            Add a template first to see a preview.
          </p>
        </div>
      )}
    </div>
  );
}
