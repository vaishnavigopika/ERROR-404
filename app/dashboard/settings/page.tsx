'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Bell, Lock, Trash2, LogOut, Eye } from 'lucide-react';

export default function SettingsPage() {
  const { signOut } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    pushNotifications: true,
    donationReminders: true,
    requestUpdates: true,
  });

  const handleNotificationChange = (
    key: keyof typeof notifications
  ) => {
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to sign out',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (confirm('Are you sure you want to delete your account? This cannot be undone.')) {
      toast({
        title: 'Success',
        description: 'Account deletion initiated',
      });
      // TODO: Implement account deletion
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-foreground/60 mt-2">
          Manage your preferences and account
        </p>
      </div>

      {/* Notifications */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notification Preferences
          </CardTitle>

          <CardDescription>
            Control how and when you receive notifications
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-secondary/5 rounded border border-border">
            <div>
              <Label className="font-semibold text-foreground">
                Email Notifications
              </Label>

              <p className="text-sm text-foreground/60 mt-1">
                Receive updates via email
              </p>
            </div>

            <Switch
              checked={notifications.emailNotifications}
              onCheckedChange={() =>
                handleNotificationChange('emailNotifications')
              }
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-secondary/5 rounded border border-border">
            <div>
              <Label className="font-semibold text-foreground">
                Push Notifications
              </Label>

              <p className="text-sm text-foreground/60 mt-1">
                Get instant alerts on your device
              </p>
            </div>

            <Switch
              checked={notifications.pushNotifications}
              onCheckedChange={() =>
                handleNotificationChange('pushNotifications')
              }
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-secondary/5 rounded border border-border">
            <div>
              <Label className="font-semibold text-foreground">
                Donation Reminders
              </Label>

              <p className="text-sm text-foreground/60 mt-1">
                Remind me when I'm eligible to donate
              </p>
            </div>

            <Switch
              checked={notifications.donationReminders}
              onCheckedChange={() =>
                handleNotificationChange('donationReminders')
              }
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-secondary/5 rounded border border-border">
            <div>
              <Label className="font-semibold text-foreground">
                Request Updates
              </Label>

              <p className="text-sm text-foreground/60 mt-1">
                Updates on blood requests matching your type
              </p>
            </div>

            <Switch
              checked={notifications.requestUpdates}
              onCheckedChange={() =>
                handleNotificationChange('requestUpdates')
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Privacy & Security */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            Privacy & Security
          </CardTitle>

          <CardDescription>
            Manage your account security and privacy settings
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-secondary/5 rounded border border-border">
            <div>
              <Label className="font-semibold text-foreground">
                Profile Visibility
              </Label>

              <p className="text-sm text-foreground/60 mt-1">
                Your profile is visible to other users
              </p>
            </div>

            <Eye className="w-4 h-4 text-primary" />
          </div>

          <Button
            variant="outline"
            className="w-full border-border justify-start bg-transparent"
          >
            <Lock className="w-4 h-4 mr-2 text-primary" />
            Change Password
          </Button>

          <Button
            variant="outline"
            className="w-full border-border justify-start bg-transparent"
          >
            <Lock className="w-4 h-4 mr-2 text-primary" />
            Two-Factor Authentication
          </Button>
        </CardContent>
      </Card>

      {/* Account Actions */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Account Actions</CardTitle>

          <CardDescription>
            Manage your account
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Button
            variant="outline"
            className="w-full border-border justify-start bg-transparent"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4 mr-2 text-primary" />
            Sign Out
          </Button>

          <Button
            variant="outline"
            className="w-full border-destructive justify-start text-destructive hover:bg-destructive/10 hover:text-destructive bg-transparent"
            onClick={handleDeleteAccount}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Account
          </Button>
        </CardContent>
      </Card>

      {/* App Info */}
      <Card className="border-border bg-secondary/5">
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 text-sm text-foreground/60">
          <div className="flex justify-between">
            <span>Version</span>
            <span>1.0.0</span>
          </div>

          <div className="flex justify-between">
            <span>Last Updated</span>
            <span>{new Date().toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}