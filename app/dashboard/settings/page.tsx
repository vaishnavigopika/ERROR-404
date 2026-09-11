'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { auth, db } from '@/lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import {
  sendPasswordResetEmail,
  deleteUser,
} from 'firebase/auth';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

import {
  Bell,
  Lock,
  Trash2,
  LogOut,
} from 'lucide-react';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    pushNotifications: true,
    donationReminders: true,
    requestUpdates: true,
  });

  const [changingPassword, setChangingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // ============================================================
  // NOTIFICATION SETTINGS
  // ============================================================

  const handleNotificationChange = (
    key: keyof typeof notifications
  ) => {
    setNotifications((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // ============================================================
  // CHANGE PASSWORD
  // ============================================================

  const handleChangePassword = async () => {
    if (!user?.email) {
      toast({
        title: 'Error',
        description:
          'No email address is associated with your account.',
        variant: 'destructive',
      });

      return;
    }

    if (changingPassword) return;

    setChangingPassword(true);

    try {
      await sendPasswordResetEmail(auth, user.email);

      toast({
        title: 'Password Reset Email Sent',
        description:
          `A password reset link has been sent to ${user.email}. Please check your inbox.`,
      });
    } catch (error: any) {
      console.error(
        'Change password error:',
        error
      );

      let message =
        'Could not send the password reset email. Please try again.';

      switch (error?.code) {
        case 'auth/user-not-found':
          message =
            'No account was found with this email address.';
          break;

        case 'auth/invalid-email':
          message =
            'The email address associated with your account is invalid.';
          break;

        case 'auth/too-many-requests':
          message =
            'Too many requests. Please wait a while and try again.';
          break;

        case 'auth/network-request-failed':
          message =
            'Network error. Please check your internet connection.';
          break;

        default:
          if (error?.message) {
            message = error.message;
          }
      }

      toast({
        title: 'Password Reset Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  // ============================================================
  // SIGN OUT
  // ============================================================

  const handleSignOut = async () => {
    try {
      await signOut();

      toast({
        title: 'Signed Out',
        description:
          'You have been successfully signed out.',
      });

      router.push('/');
    } catch (error) {
      console.error(
        'Sign out error:',
        error
      );

      toast({
        title: 'Error',
        description: 'Failed to sign out.',
        variant: 'destructive',
      });
    }
  };

  // ============================================================
  // DELETE ACCOUNT
  // ============================================================

  const handleDeleteAccount = async () => {
    if (!user?.uid) {
      toast({
        title: 'Error',
        description:
          'You must be signed in to delete your account.',
        variant: 'destructive',
      });

      return;
    }

    if (deletingAccount) return;

    const confirmed = window.confirm(
      'Are you sure you want to permanently delete your account?\n\n' +
      'This will remove your BloodConnect profile and sign you out.\n\n' +
      'This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    setDeletingAccount(true);

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error(
          'Your session has expired. Please sign in again.'
        );
      }

      // --------------------------------------------------------
      // DELETE FIRESTORE USER PROFILE
      // --------------------------------------------------------

      await deleteDoc(
        doc(db, 'users', currentUser.uid)
      );

      // --------------------------------------------------------
      // DELETE FIREBASE AUTH ACCOUNT
      // --------------------------------------------------------

      await deleteUser(currentUser);

      toast({
        title: 'Account Deleted',
        description:
          'Your BloodConnect account has been permanently deleted.',
      });

      router.push('/');

    } catch (error: any) {
      console.error(
        'Delete account error:',
        error
      );

      let message =
        'Could not delete your account. Please try again.';

      if (
        error?.code ===
        'auth/requires-recent-login'
      ) {
        message =
          'For security, please sign out, sign in again, and then try deleting your account.';
      } else if (
        error?.code ===
        'auth/network-request-failed'
      ) {
        message =
          'Network error. Please check your internet connection and try again.';
      } else if (
        error?.code ===
        'permission-denied'
      ) {
        message =
          'Your account could not be deleted because Firestore permissions denied the operation.';
      } else if (error?.message) {
        message = error.message;
      }

      toast({
        title: 'Account Deletion Failed',
        description: message,
        variant: 'destructive',
      });

    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-2xl">

      {/* ========================================================
          PAGE HEADER
      ======================================================== */}

      <div>
        <h1 className="text-3xl font-bold text-foreground">
          Settings
        </h1>

        <p className="text-foreground/60 mt-2">
          Manage your preferences and account
        </p>
      </div>

      {/* ========================================================
          NOTIFICATIONS
      ======================================================== */}

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

          {/* EMAIL NOTIFICATIONS */}

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
                handleNotificationChange(
                  'emailNotifications'
                )
              }
            />
          </div>

          {/* PUSH NOTIFICATIONS */}

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
                handleNotificationChange(
                  'pushNotifications'
                )
              }
            />
          </div>

          {/* DONATION REMINDERS */}

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
                handleNotificationChange(
                  'donationReminders'
                )
              }
            />
          </div>

          {/* REQUEST UPDATES */}

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
                handleNotificationChange(
                  'requestUpdates'
                )
              }
            />
          </div>

        </CardContent>
      </Card>

      {/* ========================================================
          SECURITY
      ======================================================== */}

      <Card className="border-border">

        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            Security
          </CardTitle>

          <CardDescription>
            Manage your account security
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">

          {/* CHANGE PASSWORD */}

          <Button
            variant="outline"
            className="w-full border-border justify-start bg-transparent"
            onClick={handleChangePassword}
            disabled={changingPassword}
          >
            <Lock className="w-4 h-4 mr-2 text-primary" />

            {changingPassword
              ? 'Sending Password Reset Email...'
              : 'Change Password'}
          </Button>

        </CardContent>

      </Card>

      {/* ========================================================
          ACCOUNT ACTIONS
      ======================================================== */}

      <Card className="border-border">

        <CardHeader>
          <CardTitle>
            Account Actions
          </CardTitle>

          <CardDescription>
            Manage your account
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">

          {/* SIGN OUT */}

          <Button
            variant="outline"
            className="w-full border-border justify-start bg-transparent"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4 mr-2 text-primary" />
            Sign Out
          </Button>

          {/* DELETE ACCOUNT */}

          <Button
            variant="outline"
            className="w-full border-destructive justify-start text-destructive hover:bg-destructive/10 hover:text-destructive bg-transparent"
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
          >
            <Trash2 className="w-4 h-4 mr-2" />

            {deletingAccount
              ? 'Deleting Account...'
              : 'Delete Account'}
          </Button>

        </CardContent>

      </Card>

      {/* ========================================================
          APP INFO
      ======================================================== */}

      <Card className="border-border bg-secondary/5">

        <CardHeader>
          <CardTitle>
            About
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 text-sm text-foreground/60">

          <div className="flex justify-between">
            <span>Version</span>
            <span>1.0.0</span>
          </div>

          <div className="flex justify-between">
            <span>Last Updated</span>
            <span>
              {new Date().toLocaleDateString()}
            </span>
          </div>

        </CardContent>

      </Card>

    </div>
  );
}