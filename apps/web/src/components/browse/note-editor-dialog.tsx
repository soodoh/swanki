import { Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	FieldAttachments,
	isMediaOnlyField,
} from "@/components/browse/field-attachments";
import { CardsTab, FieldsTab } from "@/components/note-type-editor-tabs";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	useDeleteNote,
	useNoteDetail,
	useUpdateNote,
} from "@/lib/hooks/use-browse";
import type { DeckTreeNode } from "@/lib/hooks/use-decks";
import { useDecks } from "@/lib/hooks/use-decks";
import type { NoteTypeField } from "@/lib/hooks/use-note-types";
import { useNoteType, useUpdateNoteType } from "@/lib/hooks/use-note-types";

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

// editor dialog with multiple tabs inherently has high branching
export function NoteEditorDialog({
	noteId,
	open,
	onOpenChange,
	suspended = false,
}: {
	noteId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	suspended?: boolean;
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
			setSelectedDeckId(String(noteDetail.deckId));
		}
	}, [noteDetail]);

	const handleFieldChange = useCallback((fieldName: string, value: string) => {
		setEditFields((prev) => ({ ...prev, [fieldName]: value }));
	}, []);

	const handleSave = useCallback(async () => {
		await updateNote.mutateAsync({
			noteId,
			fields: editFields,
			deckId: selectedDeckId ? Number(selectedDeckId) : undefined,
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
								<TabsTrigger value="cards">Cards</TabsTrigger>
							</TabsList>

							<TabsContent value="note" className="mt-4 overflow-y-auto">
								<div className="space-y-4">
									{/* Deck selector */}
									<div className="space-y-1">
										<Label className="text-xs">Deck</Label>
										<Select
											value={selectedDeckId}
											onValueChange={setSelectedDeckId}
										>
											<SelectTrigger className="w-full text-xs">
												{flatDecks.find((d) => String(d.id) === selectedDeckId)
													?.name ?? "Select deck"}
											</SelectTrigger>
											<SelectContent>
												{flatDecks.map((deck) => (
													<SelectItem key={deck.id} value={String(deck.id)}>
														{deck.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Suspend / Bury actions */}
									<div className="flex gap-2 border-t pt-4">
										<Button
											variant="outline"
											size="sm"
											disabled={updateNote.isPending}
											onClick={() => {
												updateNote.mutate({ noteId, suspend: !suspended });
											}}
										>
											{suspended ? "Unsuspend Note" : "Suspend Note"}
										</Button>
										<Button
											variant="outline"
											size="sm"
											disabled={updateNote.isPending}
											onClick={() => {
												updateNote.mutate({ noteId, bury: true });
											}}
										>
											Bury Note
										</Button>
									</div>

									{/* Note fields */}
									<div className="space-y-3">
										{noteTypeFields.map((field) => {
											const val = editFields[field.name] ?? "";
											const mediaOnly = isMediaOnlyField(val);
											const fieldId = `note-field-${field.name}`;
											return (
												<div key={field.name} className="space-y-1">
													<Label htmlFor={fieldId} className="text-xs">
														{field.name}
													</Label>
													{!mediaOnly && (
														<Input
															id={fieldId}
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
												const fieldId = `note-field-${key}`;
												return (
													<div key={key} className="space-y-1">
														<Label htmlFor={fieldId} className="text-xs">
															{key}
														</Label>
														{!mediaOnly && (
															<Input
																id={fieldId}
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

							<TabsContent value="cards" className="mt-4 overflow-y-auto">
								{noteTypeData ? (
									<CardsTab
										templates={noteTypeData.templates}
										noteTypeId={noteTypeData.noteType.id}
										css={noteTypeData.noteType.css ?? ""}
										fieldNames={fieldNames}
										previewFields={editFields}
										onSaveCss={updateNoteType}
									/>
								) : (
									<p className="py-8 text-center text-sm text-muted-foreground">
										Loading...
									</p>
								)}
							</TabsContent>
						</Tabs>

						{/* Footer with delete and save buttons */}
						<div className="flex justify-end gap-2 border-t pt-4">
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
							<Button
								size="sm"
								onClick={() => void handleSave()}
								disabled={updateNote.isPending}
							>
								<Save className="size-3.5" data-icon="inline-start" />
								{updateNote.isPending ? "Saving..." : "Save Changes"}
							</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
