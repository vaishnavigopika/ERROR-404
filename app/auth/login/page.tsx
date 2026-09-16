'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import {
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
} from 'firebase/auth';

import { doc, getDoc } from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

import { Heart, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Keep the user logged in for the current browser session
      await setPersistence(auth, browserSessionPersistence);

      // Sign in with Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const firebaseUser = userCredential.user;

      // Get the user's profile from Firestore
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        throw new Error(
          'Your account profile could not be found. Please contact the administrator.'
        );
      }

      const userData = userSnap.data();
      const role = userData.role;

      toast({
        title: 'Success',
        description: 'Logged in successfully!',
      });

      // Admin → Admin Dashboard
      if (role === 'admin') {
        router.push('/admin');
        return;
      }

      // Donor / Recipient → User Dashboard
      if (role === 'donor' || role === 'recipient') {
        router.push('/dashboard');
        return;
      }

      // Invalid / missing role
      throw new Error(
        'Your account does not have a valid role. Please contact the administrator.'
      );
    } catch (error: any) {
      console.error('Login error:', error);

      let message = 'Unable to sign in. Please try again.';

      switch (error?.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          message =
            'Incorrect email or password. Please check your credentials and try again.';
          break;

        case 'auth/invalid-email':
          message = 'Please enter a valid email address.';
          break;

        case 'auth/user-disabled':
          message =
            'This account has been disabled. Please contact support.';
          break;

        case 'auth/too-many-requests':
          message =
            'Too many failed login attempts. Please wait a while and try again.';
          break;

        case 'auth/network-request-failed':
          message =
            'Network error. Please check your internet connection.';
          break;

        case 'auth/operation-not-allowed':
          message =
            'Email/password login is not enabled. Please contact support.';
          break;

        default:
          // Handle errors we manually created above
          if (error?.message) {
            message = error.message;
          }
          break;
      }

      toast({
        title: 'Login Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Logo / Heading */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Heart className="w-8 h-8 text-primary fill-primary" />

            <span className="text-2xl font-bold text-foreground">
              BloodConnect
            </span>
          </div>

          <h1 className="text-2xl font-bold text-foreground">
            Welcome Back
          </h1>

          <p className="text-foreground/60">
            Sign in to your account
          </p>
        </div>

        {/* Login Card */}
        <Card className="border-border">
          <CardContent className="pt-6">

            <form onSubmit={handleLogin} className="space-y-4">

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email
                </Label>

                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="border-border"
                />
              </div>

              {/* Password */}
              <div className="space-y-2">

                <div className="flex items-center justify-between">
                  <Label htmlFor="password">
                    Password
                  </Label>

                  <Link
                    href="/auth/forgot-password"
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>

                <div className="relative">

                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="border-border pr-12"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((prev) => !prev)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={
                      showPassword
                        ? 'Hide password'
                        : 'Show password'
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>

                </div>
              </div>

              {/* Sign In */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>

            </form>

            {/* Sign Up */}
            <div className="mt-4 text-center text-sm">
              <p className="text-foreground/60">
                Don't have an account?{' '}

                <Link
                  href="/auth/signup"
                  className="text-primary hover:underline font-semibold"
                >
                  Sign Up
                </Link>
              </p>
            </div>

          </CardContent>
        </Card>

        <p className="text-xs text-foreground/50 text-center">
          This is a demo application. Use test credentials for access.
        </p>

      </div>
    </div>
  );
}