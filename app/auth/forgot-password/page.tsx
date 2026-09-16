'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useToast } from '@/hooks/use-toast';

import {
  Heart,
  ArrowLeft,
  Mail,
  CheckCircle,
} from 'lucide-react';

export default function ForgotPasswordPage() {
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResetPassword = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      toast({
        title: 'Email Required',
        description: 'Please enter your email address.',
        variant: 'destructive',
      });

      return;
    }

    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, trimmedEmail);

      setSent(true);

      toast({
        title: 'Reset Email Sent',
        description:
          'If an account exists with this email, you will receive a password reset link.',
      });
    } catch (error: any) {
      console.error('Password reset error:', error);

      let message =
        'Unable to send the password reset email. Please try again.';

      switch (error?.code) {
        case 'auth/invalid-email':
          message = 'Please enter a valid email address.';
          break;

        case 'auth/user-not-found':
          message =
            'No account was found with this email address.';
          break;

        case 'auth/too-many-requests':
          message =
            'Too many attempts. Please wait a while and try again.';
          break;

        case 'auth/network-request-failed':
          message =
            'Network error. Please check your internet connection.';
          break;

        case 'auth/operation-not-allowed':
          message =
            'Password reset is not enabled for this authentication method.';
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
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-3">

          <div className="flex items-center justify-center gap-2">
            <Heart className="w-8 h-8 text-primary fill-primary" />

            <span className="text-2xl font-bold text-foreground">
              BloodConnect
            </span>
          </div>

          <h1 className="text-2xl font-bold text-foreground">
            Forgot Password?
          </h1>

          <p className="text-foreground/60">
            Enter your email address and we'll send you a
            password reset link.
          </p>

        </div>

        {/* Card */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>
              Reset your password
            </CardTitle>

            <CardDescription>
              We'll send a password reset link to your email.
            </CardDescription>
          </CardHeader>

          <CardContent>

            {!sent ? (
              <form
                onSubmit={handleResetPassword}
                className="space-y-5"
              >

                {/* Email */}
                <div className="space-y-2">

                  <Label htmlFor="email">
                    Email Address
                  </Label>

                  <div className="relative">

                    <Mail
                      className="absolute left-3 top-1/2
                      -translate-y-1/2
                      w-4 h-4
                      text-muted-foreground"
                    />

                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={(e) =>
                        setEmail(e.target.value)
                      }
                      disabled={loading}
                      required
                      className="pl-10"
                    />

                  </div>

                </div>

                {/* Button */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {loading
                    ? 'Sending...'
                    : 'Send Reset Link'}
                </Button>

              </form>
            ) : (
              /* Success */
              <div className="text-center space-y-5">

                <div className="flex justify-center">

                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">

                    <CheckCircle
                      className="w-9 h-9 text-primary"
                    />

                  </div>

                </div>

                <div className="space-y-2">

                  <h2 className="text-lg font-semibold">
                    Check your email
                  </h2>

                  <p className="text-sm text-muted-foreground">
                    We sent a password reset link to:
                  </p>

                  <p className="font-medium break-all">
                    {email}
                  </p>

                  <p className="text-sm text-muted-foreground">
                    Open the email and follow the link to
                    create a new password.
                  </p>

                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSent(false);
                    setEmail('');
                  }}
                >
                  Try another email
                </Button>

              </div>
            )}

            {/* Back to login */}
            <div className="mt-6 text-center">

              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </Link>

            </div>

          </CardContent>
        </Card>

      </div>
    </div>
  );
}