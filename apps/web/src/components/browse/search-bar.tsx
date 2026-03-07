import { useState, useCallback, useEffect } from "react";
import { Search, HelpCircle } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
};

export function SearchBar({
  value,
  onChange,
  onSubmit,
}: SearchBarProps): React.ReactElement {
  const [localValue, setLocalValue] = useState(value);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onSubmit(localValue);
      }
    },
    [localValue, onSubmit],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalValue(e.target.value);
      onChange(e.target.value);
    },
    [onChange],
  );

  // Sync external value changes (e.g., from filter sidebar clicks)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search cards... (e.g., deck:Japanese tag:verb is:new)"
          className="pl-9"
        />
      </div>
      <Button
        variant="default"
        size="default"
        onClick={() => onSubmit(localValue)}
      >
        Search
      </Button>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon">
                <HelpCircle className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="bottom" align="end" className="max-w-xs">
            <div className="space-y-1.5 p-1 text-xs">
              <p className="font-semibold">Search syntax:</p>
              <ul className="space-y-0.5">
                <li>
                  <code className="rounded bg-background/20 px-1">
                    deck:Name
                  </code>{" "}
                  - filter by deck
                </li>
                <li>
                  <code className="rounded bg-background/20 px-1">
                    tag:verb
                  </code>{" "}
                  - filter by tag
                </li>
                <li>
                  <code className="rounded bg-background/20 px-1">is:new</code>{" "}
                  - new cards
                </li>
                <li>
                  <code className="rounded bg-background/20 px-1">
                    is:review
                  </code>{" "}
                  - review cards
                </li>
                <li>
                  <code className="rounded bg-background/20 px-1">is:due</code>{" "}
                  - due cards
                </li>
                <li>
                  <code className="rounded bg-background/20 px-1">
                    &quot;exact phrase&quot;
                  </code>{" "}
                  - quoted search
                </li>
                <li>
                  <code className="rounded bg-background/20 px-1">
                    -deck:Name
                  </code>{" "}
                  - negate filter
                </li>
              </ul>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
