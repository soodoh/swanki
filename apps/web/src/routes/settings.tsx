import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Cloud, LogIn, LogOut, RefreshCw, Server } from "lucide-react";

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

export const Route = createFileRoute("/settings")({
  component: DesktopSettingsPage,
});

type DesktopSettings = {
  cloudServerUrl: string;
  signedIn: boolean;
  syncStatus: string;
  lastSyncTime: number | undefined;
};

type ElectronAPI = {
  settingsGet(): Promise<DesktopSettings>;
  settingsUpdate(data: { cloudServerUrl: string }): Promise<{ ok: boolean }>;
  authSignIn(): Promise<{ signedIn: boolean }>;
  authSignOut(): Promise<{ signedIn: boolean }>;
  syncNow(): Promise<{ status: string }>;
};

type ElectronGlobal = {
  electronAPI: ElectronAPI;
};

function getElectronAPI(): ElectronAPI {
  return (globalThis as unknown as ElectronGlobal).electronAPI;
}

function formatLastSyncTime(ts: number | undefined): string {
  if (!ts) {
    return "Never";
  }
  return new Date(ts * 1000).toLocaleString();
}

function getSaveButtonLabel(saved: boolean, saving: boolean): string {
  if (saved) {
    return "Saved";
  }
  if (saving) {
    return "Saving...";
  }
  return "Save";
}

function getSyncButtonLabel(loading: boolean): string {
  if (loading) {
    return "Syncing...";
  }
  return "Sync Now";
}

function getAuthButtonLabel(signedIn: boolean, loading: boolean): string {
  if (signedIn) {
    return loading ? "Signing out..." : "Sign Out";
  }
  return loading ? "Opening..." : "Sign In";
}

export function DesktopSettingsPage(): React.ReactElement {
  const [settings, setSettings] = useState<DesktopSettings | undefined>(
    undefined,
  );
  const [serverUrl, setServerUrl] = useState("");
  const [urlSaving, setUrlSaving] = useState(false);
  const [urlSaved, setUrlSaved] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  async function loadSettings(): Promise<void> {
    const data = await getElectronAPI().settingsGet();
    setSettings(data);
    setServerUrl(data.cloudServerUrl);
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function handleSaveUrl(): Promise<void> {
    if (!serverUrl.trim()) {
      return;
    }
    setUrlSaving(true);
    setUrlError("");
    try {
      await getElectronAPI().settingsUpdate({
        cloudServerUrl: serverUrl.trim(),
      });
      setUrlSaved(true);
      setTimeout(() => {
        setUrlSaved(false);
      }, 2000);
      await loadSettings();
    } catch {
      setUrlError("Failed to save server URL.");
    } finally {
      setUrlSaving(false);
    }
  }

  async function handleSignIn(): Promise<void> {
    setAuthLoading(true);
    try {
      const result = await getElectronAPI().authSignIn();
      if (result.signedIn) {
        setStatusMessage("Signed in successfully.");
      } else {
        setStatusMessage("Sign in was cancelled.");
      }
      await loadSettings();
    } finally {
      setAuthLoading(false);
      setTimeout(() => {
        setStatusMessage("");
      }, 3000);
    }
  }

  async function handleSignOut(): Promise<void> {
    setAuthLoading(true);
    try {
      await getElectronAPI().authSignOut();
      setStatusMessage("Signed out.");
      await loadSettings();
    } finally {
      setAuthLoading(false);
      setTimeout(() => {
        setStatusMessage("");
      }, 3000);
    }
  }

  async function handleSyncNow(): Promise<void> {
    setSyncLoading(true);
    try {
      await getElectronAPI().syncNow();
      setStatusMessage("Sync complete.");
      await loadSettings();
    } catch {
      setStatusMessage("Sync failed.");
    } finally {
      setSyncLoading(false);
      setTimeout(() => {
        setStatusMessage("");
      }, 3000);
    }
  }

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-lg font-bold tracking-tight">Settings</h1>

        {statusMessage && (
          <div className="mb-4 rounded-lg bg-primary/10 px-4 py-3 text-sm text-primary">
            {statusMessage}
          </div>
        )}

        <div className="grid gap-6">
          {/* Server URL */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="size-4" />
                Server
              </CardTitle>
              <CardDescription>
                The Swanki cloud server to sync with. Set this before signing
                in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="server-url">Server URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="server-url"
                      type="url"
                      value={serverUrl}
                      onChange={(e) => {
                        setServerUrl(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void handleSaveUrl();
                        }
                      }}
                      placeholder="http://localhost:3000"
                    />
                    <Button
                      onClick={() => {
                        void handleSaveUrl();
                      }}
                      disabled={
                        !serverUrl.trim() ||
                        serverUrl.trim() === settings.cloudServerUrl ||
                        urlSaving
                      }
                      size="sm"
                    >
                      {getSaveButtonLabel(urlSaved, urlSaving)}
                    </Button>
                  </div>
                  {urlError && (
                    <p className="text-xs text-destructive">{urlError}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Account */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="size-4" />
                Account
              </CardTitle>
              <CardDescription>
                Sign in to your cloud account to enable sync.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {settings.signedIn ? "Signed in" : "Not signed in"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {settings.signedIn
                      ? "Your data will sync automatically."
                      : "Sign in to sync your flashcards across devices."}
                  </p>
                </div>
                {settings.signedIn ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      void handleSignOut();
                    }}
                    disabled={authLoading}
                  >
                    <LogOut className="size-4" data-icon="inline-start" />
                    {getAuthButtonLabel(true, authLoading)}
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      void handleSignIn();
                    }}
                    disabled={authLoading}
                  >
                    <LogIn className="size-4" data-icon="inline-start" />
                    {getAuthButtonLabel(false, authLoading)}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Sync */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="size-4" />
                Sync
              </CardTitle>
              <CardDescription>
                Synchronise your flashcards with the cloud server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Status</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {settings.syncStatus}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void handleSyncNow();
                    }}
                    disabled={!settings.signedIn || syncLoading}
                  >
                    <RefreshCw
                      className={`size-4 ${syncLoading ? "animate-spin" : ""}`}
                      data-icon="inline-start"
                    />
                    {getSyncButtonLabel(syncLoading)}
                  </Button>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Last synced: {formatLastSyncTime(settings.lastSyncTime)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
