import { useState, useMemo } from "react";
import { Plus, Trash2, GripVertical, ChevronRight } from "lucide-react";
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
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
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
import { usePlatform } from "@swanki/core/platform";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TemplateCodeEditor } from "@/components/template-code-editor";
import { CssCodeEditor } from "@/components/css-code-editor";

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

/* ---------- Cards Tab ---------- */

export function CardsTab({
  templates,
  noteTypeId,
  css,
  fieldNames,
  previewFields,
  onSaveCss,
}: {
  templates: CardTemplate[];
  noteTypeId: string;
  css: string;
  fieldNames: string[];
  previewFields: Record<string, string> | undefined;
  onSaveCss: ReturnType<typeof useUpdateNoteType>;
}): React.ReactElement {
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [localCss, setLocalCss] = useState(css);
  const [expandedId, setExpandedId] = useState<number | undefined>(
    templates[0]?.id,
  );
  const [cssOpen, setCssOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  const sampleFields = useMemo(() => {
    if (previewFields) {
      return previewFields;
    }
    const data: Record<string, string> = {};
    for (const name of fieldNames) {
      data[name] = `(sample ${name})`;
    }
    return data;
  }, [previewFields, fieldNames]);

  function handleSaveCss(): void {
    void onSaveCss.mutateAsync({ id: noteTypeId, css: localCss });
  }

  async function handleCreate(): Promise<void> {
    if (!newTemplateName.trim()) {
      return;
    }
    const created = await createTemplate.mutateAsync({
      noteTypeId,
      name: newTemplateName.trim(),
      questionTemplate: "{{Front}}",
      answerTemplate: "{{FrontSide}}<hr>{{Back}}",
    });
    setNewTemplateName("");
    setCreateOpen(false);
    setExpandedId(created.id);
  }

  async function handleDelete(templateId: string): Promise<void> {
    await deleteTemplate.mutateAsync({ templateId, noteTypeId });
    if (expandedId === templateId) {
      setExpandedId(undefined);
    }
  }

  return (
    <div className="grid gap-4">
      {/* CSS Section */}
      <Collapsible open={cssOpen} onOpenChange={setCssOpen}>
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50"
            >
              <ChevronRight
                className={`size-4 transition-transform ${cssOpen ? "rotate-90" : ""}`}
              />
              Custom CSS
            </button>
          }
        />
        <CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-200 ease-out data-[starting-style]:h-0 data-[ending-style]:h-0">
          <div className="mt-2 grid gap-2">
            <CssCodeEditor value={localCss} onChange={setLocalCss} />
            <div className="flex justify-end">
              <Button
                onClick={handleSaveCss}
                disabled={localCss === css || onSaveCss.isPending}
                size="sm"
              >
                {onSaveCss.isPending ? "Saving..." : "Save CSS"}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Template header + add button */}
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

      {/* Template accordions */}
      {templates.map((template) => {
        const isExpanded = expandedId === template.id;
        return (
          <TemplateAccordionItem
            key={template.id}
            template={template}
            noteTypeId={noteTypeId}
            fieldNames={fieldNames}
            sampleFields={sampleFields}
            localCss={localCss}
            isExpanded={isExpanded}
            onToggle={() => setExpandedId(isExpanded ? undefined : template.id)}
            onSave={updateTemplate}
            onDelete={() => void handleDelete(template.id)}
            canDelete={templates.length > 1}
            deleteIsPending={deleteTemplate.isPending}
          />
        );
      })}
    </div>
  );
}

/* ---------- Template Preview Pane ---------- */

function TemplatePreviewPane({
  label,
  html,
  css,
}: {
  label: string;
  html: string;
  css: string;
}): React.ReactElement {
  const platform = usePlatform();
  const mediaBaseUrl =
    platform === "desktop" ? "swanki-media://media/" : "/api/media/";
  return (
    <div className="grid gap-2">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Card className="min-h-[200px] flex items-center justify-center">
        <CardContent className="p-3">
          {css && <style>{sanitizeCss(css)}</style>}
          {/* oxlint-disable react/no-danger -- sanitized via DOMPurify */}
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-center"
            dangerouslySetInnerHTML={{
              __html: expandMediaTags(sanitizeHtml(html), mediaBaseUrl),
            }}
          />
          {/* oxlint-enable react/no-danger */}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Template Accordion Item ---------- */

function TemplateAccordionItem({
  template,
  noteTypeId,
  fieldNames,
  sampleFields,
  localCss,
  isExpanded,
  onToggle,
  onSave,
  onDelete,
  canDelete,
  deleteIsPending,
}: {
  template: CardTemplate;
  noteTypeId: string;
  fieldNames: string[];
  sampleFields: Record<string, string>;
  localCss: string;
  isExpanded: boolean;
  onToggle: () => void;
  onSave: ReturnType<typeof useUpdateTemplate>;
  onDelete: () => void;
  canDelete: boolean;
  deleteIsPending: boolean;
}): React.ReactElement {
  const [question, setQuestion] = useState(template.questionTemplate);
  const [answer, setAnswer] = useState(template.answerTemplate);

  const hasChanges =
    question !== template.questionTemplate ||
    answer !== template.answerTemplate;

  function handleSave(): void {
    void onSave.mutateAsync({
      templateId: template.id,
      noteTypeId,
      questionTemplate: question,
      answerTemplate: answer,
    });
  }

  const questionHtml = useMemo(
    () =>
      renderTemplate(question, sampleFields, {
        showAnswer: false,
        cardOrdinal: template.ordinal + 1,
      }),
    [question, sampleFields, template.ordinal],
  );

  const answerHtml = useMemo(() => {
    const front = renderTemplate(question, sampleFields, {
      showAnswer: false,
      cardOrdinal: template.ordinal + 1,
    });
    return renderTemplate(answer, sampleFields, {
      showAnswer: true,
      cardOrdinal: template.ordinal + 1,
      frontSide: front,
    });
  }, [question, answer, sampleFields, template.ordinal]);

  // Content rendered via dangerouslySetInnerHTML is sanitized through
  // sanitizeHtml (DOMPurify) and sanitizeCss before rendering, consistent
  // with the study page pattern used throughout the app.

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/30"
          >
            <ChevronRight
              className={`size-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
            {template.name}
          </button>
        }
      />
      <CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-200 ease-out data-[starting-style]:h-0 data-[ending-style]:h-0">
        <div className="mt-2 rounded-lg border p-4">
          <Tabs defaultValue="edit">
            <TabsList>
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="edit">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Question Template
                  </Label>
                  <TemplateCodeEditor
                    value={question}
                    onChange={setQuestion}
                    fieldNames={fieldNames}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Answer Template
                  </Label>
                  <TemplateCodeEditor
                    value={answer}
                    onChange={setAnswer}
                    fieldNames={fieldNames}
                    isAnswerTemplate
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preview">
              <div className="grid gap-4">
                <TemplatePreviewPane
                  label="Question Preview"
                  html={questionHtml}
                  css={localCss}
                />
                <TemplatePreviewPane
                  label="Answer Preview"
                  html={answerHtml}
                  css={localCss}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Action buttons */}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              disabled={!canDelete || deleteIsPending}
            >
              <Trash2 className="size-3.5" data-icon="inline-start" />
              Delete
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || onSave.isPending}
              size="sm"
            >
              {onSave.isPending ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
