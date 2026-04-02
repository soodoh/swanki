"use client";

import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: ComponentProps<"label">): ReactElement {
	return (
		// eslint-disable-next-line jsx-a11y/label-has-associated-control -- htmlFor is passed via spread props
		<label
			data-slot="label"
			className={cn(
				"flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

export { Label };
