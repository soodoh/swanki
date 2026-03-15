import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTheme } from "@/lib/theme";

/**
 * Desktop settings page — simplified version without auth-dependent sections
 * (change password, sign out, delete account) since there is no auth server.
 */
export function DesktopSettingsPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-lg font-bold tracking-tight">Settings</h1>

        <div className="grid gap-6">
          <AppearanceSection />

          <Separator />

          <StudyPreferencesSection />
        </div>
      </main>
    </div>
  );
}

/* ---------- Appearance ---------- */

const themeOptions: Array<{
  value: "light" | "dark" | "system";
  label: string;
  description: string;
}> = [
  { value: "light", label: "Light", description: "Always use light theme" },
  { value: "dark", label: "Dark", description: "Always use dark theme" },
  {
    value: "system",
    label: "System",
    description: "Follow your operating system setting",
  },
];

function AppearanceSection(): React.ReactElement {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how Swanki looks to you.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          {themeOptions.map((option) => (
            <label
              key={option.value}
              aria-label={option.label}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring ${
                theme === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => setTheme(option.value)}
                className="sr-only"
              />
              <div>
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Study Preferences ---------- */

function StudyPreferencesSection(): React.ReactElement {
  const [newCardsPerDay, setNewCardsPerDay] = useState("20");
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState("200");
  const [saved, setSaved] = useState(false);

  function handleSave(): void {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Study Preferences</CardTitle>
        <CardDescription>
          Default settings for new decks. Individual deck settings can be
          overridden in each deck&apos;s configuration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-cards-per-day">Default New Cards per Day</Label>
            <Input
              id="new-cards-per-day"
              type="number"
              min="0"
              max="9999"
              value={newCardsPerDay}
              onChange={(e) => setNewCardsPerDay(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="max-reviews-per-day">
              Default Max Reviews per Day
            </Label>
            <Input
              id="max-reviews-per-day"
              type="number"
              min="0"
              max="9999"
              value={maxReviewsPerDay}
              onChange={(e) => setMaxReviewsPerDay(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave}>
              {saved ? "Saved" : "Save Preferences"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
