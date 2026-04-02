"use client";

import { SettingsIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CustomStudySettings = {
	studyAhead?: number;
	extraNewCards?: number;
	tag?: string;
	previewMode?: boolean;
};

type CustomStudyDialogProps = {
	onStart: (settings: CustomStudySettings) => void;
	children?: ReactNode;
};

export function CustomStudyDialog({
	onStart,
	children,
}: CustomStudyDialogProps): ReactElement {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<
		"studyAhead" | "extraNew" | "tag" | "preview"
	>("studyAhead");
	const [studyAheadDays, setStudyAheadDays] = useState(1);
	const [extraNewCards, setExtraNewCards] = useState(10);
	const [tag, setTag] = useState("");
	const [previewMode, setPreviewMode] = useState(false);

	function handleStart() {
		const settings: CustomStudySettings = {};

		if (mode === "studyAhead") {
			settings.studyAhead = studyAheadDays;
		} else if (mode === "extraNew") {
			settings.extraNewCards = extraNewCards;
		} else if (mode === "tag") {
			settings.tag = tag;
		}
		// mode === "preview" needs no extra params

		if (previewMode) {
			settings.previewMode = true;
		}

		onStart(settings);
		setOpen(false);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					children ? undefined : (
						<Button variant="outline" size="sm">
							<SettingsIcon className="mr-2 h-4 w-4" />
							Custom Study
						</Button>
					)
				}
			>
				{children}
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Custom Study Session</DialogTitle>
					<DialogDescription>
						Configure a custom study session with modified settings.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-2">
					{/* Mode selection */}
					<div className="grid gap-3">
						<Label>Study mode</Label>
						<div className="grid gap-2">
							<label className="flex items-center gap-2 text-sm cursor-pointer">
								<input
									type="radio"
									name="studyMode"
									checked={mode === "studyAhead"}
									onChange={() => setMode("studyAhead")}
									className="accent-primary"
								/>
								Study ahead
							</label>
							<label className="flex items-center gap-2 text-sm cursor-pointer">
								<input
									type="radio"
									name="studyMode"
									checked={mode === "extraNew"}
									onChange={() => setMode("extraNew")}
									className="accent-primary"
								/>
								Increase today&apos;s new card limit
							</label>
							<label className="flex items-center gap-2 text-sm cursor-pointer">
								<input
									type="radio"
									name="studyMode"
									checked={mode === "tag"}
									onChange={() => setMode("tag")}
									className="accent-primary"
								/>
								Review by tag
							</label>
						</div>
					</div>

					{/* Mode-specific inputs */}
					{mode === "studyAhead" && (
						<div className="grid gap-2">
							<Label htmlFor="studyAheadDays">Days ahead</Label>
							<Input
								id="studyAheadDays"
								type="number"
								min={1}
								max={30}
								value={studyAheadDays}
								onChange={(e) => setStudyAheadDays(Number(e.target.value) || 1)}
							/>
						</div>
					)}

					{mode === "extraNew" && (
						<div className="grid gap-2">
							<Label htmlFor="extraNewCards">Extra new cards</Label>
							<Input
								id="extraNewCards"
								type="number"
								min={1}
								max={100}
								value={extraNewCards}
								onChange={(e) => setExtraNewCards(Number(e.target.value) || 1)}
							/>
						</div>
					)}

					{mode === "tag" && (
						<div className="grid gap-2">
							<Label htmlFor="tagName">Tag name</Label>
							<Input
								id="tagName"
								type="text"
								placeholder="e.g. vocabulary"
								value={tag}
								onChange={(e) => setTag(e.target.value)}
							/>
						</div>
					)}

					{/* Preview mode checkbox */}
					<div className="flex items-center gap-2 pt-2 border-t">
						<Checkbox
							checked={previewMode}
							onCheckedChange={(checked) => setPreviewMode(Boolean(checked))}
							id="previewMode"
						/>
						<Label htmlFor="previewMode" className="cursor-pointer">
							Preview mode (don&apos;t affect scheduling)
						</Label>
					</div>
				</div>

				<DialogFooter>
					<Button onClick={handleStart}>Start Session</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
