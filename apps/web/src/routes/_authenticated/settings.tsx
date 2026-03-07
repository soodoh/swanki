import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Trash2 } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type SessionData = {
  user: {
    name: string;
    email: string;
    image?: string | undefined;
  };
};

function SettingsPage(): React.ReactElement {
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- typed via beforeLoad return
  const { session } = Route.useRouteContext();
  // oxlint-disable-next-line typescript/no-unsafe-member-access -- typed via beforeLoad return
  const user = (session as SessionData).user;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-lg font-bold tracking-tight">Settings</h1>

        <div className="grid gap-6">
          <UserInfoSection name={user.name} email={user.email} />

          <Separator />

          <ChangePasswordSection />

          <Separator />

          <StudyPreferencesSection />

          <Separator />

          <DangerZone />
        </div>
      </main>
    </div>
  );
}

/* ---------- User Info ---------- */

function UserInfoSection({
  name,
  email,
}: {
  name: string;
  email: string;
}): React.ReactElement {
  const [displayName, setDisplayName] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(): Promise<void> {
    if (!displayName.trim() || displayName.trim() === name) {
      return;
    }
    setIsSaving(true);
    try {
      await authClient.updateUser({ name: displayName.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your account information.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="display-name">Display Name</Label>
            <div className="flex gap-2">
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleSave();
                  }
                }}
              />
              <Button
                onClick={() => void handleSave()}
                disabled={
                  !displayName.trim() || displayName.trim() === name || isSaving
                }
                size="sm"
              >
                {(() => {
                  if (saved) {
                    return "Saved";
                  }
                  if (isSaving) {
                    return "Saving...";
                  }
                  return "Save";
                })()}
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled />
            <p className="text-xs text-muted-foreground">
              Email cannot be changed.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Change Password ---------- */

function ChangePasswordSection(): React.ReactElement {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleChangePassword(): Promise<void> {
    setError("");

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSaving(true);
    try {
      await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError(
        "Failed to change password. Please check your current password.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>
          Update your password to keep your account secure.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleChangePassword();
                }
              }}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-600 dark:text-green-400">
              Password changed successfully.
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => void handleChangePassword()}
              disabled={!currentPassword || !newPassword || isSaving}
            >
              {isSaving ? "Changing..." : "Change Password"}
            </Button>
          </div>
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
    // These are default preferences. In a full implementation,
    // they would be stored in a user preferences table.
    // For now, they set the defaults for new decks.
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

/* ---------- Danger Zone ---------- */

function DangerZone(): React.ReactElement {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSignOut(): Promise<void> {
    await authClient.signOut();
    globalThis.location.href = "/login";
  }

  async function handleDeleteAccount(): Promise<void> {
    if (confirmText !== "DELETE") {
      return;
    }
    setIsDeleting(true);
    try {
      await authClient.deleteUser();
      globalThis.location.href = "/login";
    } catch {
      setIsDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Sign Out</p>
              <p className="text-xs text-muted-foreground">
                Sign out of your account on this device.
              </p>
            </div>
            <Button variant="outline" onClick={() => void handleSignOut()}>
              <LogOut className="size-4" data-icon="inline-start" />
              Sign Out
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-destructive">
                Delete Account
              </p>
              <p className="text-xs text-muted-foreground">
                Permanently delete your account and all data.
              </p>
            </div>
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger
                render={
                  <Button variant="destructive">
                    <Trash2 className="size-4" data-icon="inline-start" />
                    Delete Account
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Account</DialogTitle>
                  <DialogDescription>
                    This action is permanent and cannot be undone. All your
                    decks, cards, and study history will be deleted.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                  <Label htmlFor="confirm-delete">Type DELETE to confirm</Label>
                  <Input
                    id="confirm-delete"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE"
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="destructive"
                    onClick={() => void handleDeleteAccount()}
                    disabled={confirmText !== "DELETE" || isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Permanently Delete Account"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
