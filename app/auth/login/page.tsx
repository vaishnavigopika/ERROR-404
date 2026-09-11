'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import {
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
<<<<<<< HEAD
} from 'firebase/auth';

import { doc, getDoc } from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';

=======
} from "firebase/auth";
import { Eye, EyeOff } from 'lucide-react';
import { auth } from '@/lib/firebase';
>>>>>>> 0a219dcee28561c31268d66302e9e933b6c5cdd4
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
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Keep the user's login session
      await setPersistence(auth, browserSessionPersistence);

      // Login with Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const firebaseUser = userCredential.user;

      // Get the user's Firestore document
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        throw new Error(
          'Your account profile could not be found. Please contact the administrator.'
        );
      }

      const userData = userSnap.data();

      // Get role from Firestore
      const role = userData.role;

      toast({
        title: 'Success',
        description: 'Logged in successfully!',
      });

      // ADMIN → Admin Dashboard
      if (role === 'admin') {
        router.push('/admin');
        return;
      }

      // DONOR / RECIPIENT → Normal User Dashboard
      if (role === 'donor' || role === 'recipient') {
        router.push('/dashboard');
        return;
      }

      // Unknown role
      throw new Error(
        'Your account does not have a valid role. Please contact the administrator.'
      );

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to login',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">

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

        <Card className="border-border">
          <CardContent className="pt-6">

            <form onSubmit={handleLogin} className="space-y-4">

              {/* EMAIL */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>

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

              {/* PASSWORD */}
              <div className="space-y-2">

                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>

                  <Link
                    href="/auth/forgot-password"
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
<<<<<<< HEAD

                <div className="relative">

=======
                <div className="relative">
>>>>>>> 0a219dcee28561c31268d66302e9e933b6c5cdd4
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
<<<<<<< HEAD
                    className="border-border pr-10"
=======
                    className="border-border pr-12"
>>>>>>> 0a219dcee28561c31268d66302e9e933b6c5cdd4
                  />

                  <button
                    type="button"
<<<<<<< HEAD
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
=======
                    onClick={() =>
                      setShowPassword((prev) => !prev)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
>>>>>>> 0a219dcee28561c31268d66302e9e933b6c5cdd4
                    aria-label={
                      showPassword
                        ? 'Hide password'
                        : 'Show password'
                    }
                  >
                    {showPassword ? (
<<<<<<< HEAD
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>

=======
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
>>>>>>> 0a219dcee28561c31268d66302e9e933b6c5cdd4
                </div>
              </div>

              {/* LOGIN BUTTON */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>

            </form>

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