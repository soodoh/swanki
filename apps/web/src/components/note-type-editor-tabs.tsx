import { useState, useMemo } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from "@/lib/hooks/use-note-types";
import type {
  useUpdateNoteType,
  NoteTypeField,
  CardTemplate,
} from "@/lib/hooks/use-note-types";
import { renderTemplate } from "@/lib/template-renderer";
import { sanitizeHtml, sanitizeCss } from "@/lib/sanitize";
import { expandMediaTags } from "@/lib/media-tags";
import { TemplateCodeEditor } from "@/components/template-code-editor";

/* ---------- Name Editor ---------- */

export function NameEditor({
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
            if (e.key === "Enter") {
              handleSave();
            }
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

/* ---------- Sortable Field Item ---------- */

export function SortableFieldItem({
  field,
  onRemove,
  disableRemove,
}: {
  field: NoteTypeField;
  onRemove: () => void;
  disableRemove: boolean;
}): React.ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border bg-background px-3 py-2 ${isDragging ? "z-50 shadow-lg" : ""}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4 text-muted-foreground" />
      </button>
      <span className="flex-1 text-sm">{field.name}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        disabled={disableRemove}
      >
        <Trash2 className="size-3 text-destructive" />
      </Button>
    </div>
  );
}

/* ---------- Fields Tab ---------- */

export function FieldsTab({
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
    if (!newFieldName.trim()) {
      return;
    }
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
    const filtered = localFields.filter((f) => f.ordinal !== ordinal);
    const updated = filtered.map((f, i) => {
      const copy: NoteTypeField = { name: f.name, ordinal: i };
      return copy;
    });
    setLocalFields(updated);
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localFields.findIndex((f) => f.name === active.id);
      const newIndex = localFields.findIndex((f) => f.name === over.id);
      const moved = arrayMove(localFields, oldIndex, newIndex);
      setLocalFields(moved.map((f, i) => ({ name: f.name, ordinal: i })));
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortableIds = useMemo(
    () => localFields.map((f) => f.name),
    [localFields],
  );

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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              {localFields.map((field) => (
                <SortableFieldItem
                  key={field.name}
                  field={field}
                  onRemove={() => removeField(field.ordinal)}
                  disableRemove={localFields.length <= 1}
                />
              ))}
            </SortableContext>
          </DndContext>

          <div className="flex items-center gap-2">
            <Input
              placeholder="New field name"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addField();
                }
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

const EMPTY_FIELD_NAMES: string[] = [];

/* ---------- Templates Tab ---------- */

export function TemplatesTab({
  templates,
  noteTypeId,
  fieldNames,
}: {
  templates: CardTemplate[];
  noteTypeId: string;
  fieldNames?: string[];
}): React.ReactElement {
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  async function handleCreate(): Promise<void> {
    if (!newTemplateName.trim()) {
      return;
    }
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
                  if (e.key === "Enter") {
                    void handleCreate();
                  }
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
                fieldNames={fieldNames ?? EMPTY_FIELD_NAMES}
                onSave={updateTemplate}
              />
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ---------- Template Editor ---------- */

export function TemplateEditor({
  template,
  noteTypeId,
  fieldNames,
  onSave,
}: {
  template: CardTemplate;
  noteTypeId: string;
  fieldNames: string[];
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
        <Label>Question Template</Label>
        <TemplateCodeEditor
          value={question}
          onChange={setQuestion}
          fieldNames={fieldNames}
        />
      </div>
      <div className="grid gap-2">
        <Label>Answer Template</Label>
        <TemplateCodeEditor
          value={answer}
          onChange={setAnswer}
          fieldNames={fieldNames}
          isAnswerTemplate
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

export function CssTab({
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

export function PreviewTab({
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
    if (!template) {
      return "";
    }
    return renderTemplate(template.questionTemplate, sampleData, {
      showAnswer: false,
      cardOrdinal: 1,
    });
  }, [template, sampleData]);

  const answerHtml = useMemo(() => {
    if (!template) {
      return "";
    }
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
  // Content is sanitized via sanitizeHtml/sanitizeCss from DOMPurify.

  return (
    <div className="grid gap-6">
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

      {template && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Question</CardTitle>
            </CardHeader>
            <CardContent>
              {css && <style>{sanitizeCss(css)}</style>}
              {/* oxlint-disable react/no-danger -- sanitized HTML */}
              <div
                className="card prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{
                  __html: expandMediaTags(sanitizeHtml(questionHtml)),
                }}
              />
              {/* oxlint-enable react/no-danger */}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Answer</CardTitle>
            </CardHeader>
            <CardContent>
              {css && <style>{sanitizeCss(css)}</style>}
              {/* oxlint-disable react/no-danger -- sanitized HTML */}
              <div
                className="card prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{
                  __html: expandMediaTags(sanitizeHtml(answerHtml)),
                }}
              />
              {/* oxlint-enable react/no-danger */}
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
