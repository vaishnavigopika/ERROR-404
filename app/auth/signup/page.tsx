'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import {
  createUserWithEmailAndPassword,
  deleteUser,
  updateProfile,
} from 'firebase/auth';

import {
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';

import {
  BLOOD_TYPES,
  BloodType,
} from '@/lib/bloodCompatibility';

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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useToast } from '@/hooks/use-toast';

import {
  Heart,
  UserPlus,
  Eye,
  EyeOff,
  ArrowLeft,
} from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    bloodType: '',
    password: '',
    confirmPassword: '',
  });

  // ============================================================
  // INPUT HANDLER
  // ============================================================

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // ============================================================
  // SELECT HANDLER
  // ============================================================

  const handleSelectChange = (
    name: string,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // ============================================================
  // PHONE HANDLER
  // ============================================================

  const handlePhoneChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value
      .replace(/\D/g, '')
      .slice(0, 10);

    setFormData((prev) => ({
      ...prev,
      phone: value,
    }));
  };

  // ============================================================
  // VALIDATION
  // ============================================================

  const validateForm = () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter your full name.',
        variant: 'destructive',
      });

      return false;
    }

    if (!formData.email.trim()) {
      toast({
        title: 'Email Required',
        description: 'Please enter your email address.',
        variant: 'destructive',
      });

      return false;
    }

    // Phone is optional.
    // If entered, it must contain exactly 10 digits.
    if (
      formData.phone.trim() &&
      !/^\d{10}$/.test(formData.phone.trim())
    ) {
      toast({
        title: 'Invalid Phone Number',
        description:
          'Please enter a valid 10-digit Indian mobile number.',
        variant: 'destructive',
      });

      return false;
    }

    if (!formData.role) {
      toast({
        title: 'Account Type Required',
        description:
          'Please select Donor or Recipient.',
        variant: 'destructive',
      });

      return false;
    }

    if (!formData.bloodType) {
      toast({
        title: 'Blood Type Required',
        description:
          'Please select your blood type.',
        variant: 'destructive',
      });

      return false;
    }

    if (
      !BLOOD_TYPES.includes(
        formData.bloodType as BloodType
      )
    ) {
      toast({
        title: 'Invalid Blood Type',
        description:
          'Please select a valid blood type.',
        variant: 'destructive',
      });

      return false;
    }

    if (formData.password.length < 6) {
      toast({
        title: 'Password Too Short',
        description:
          'Password must contain at least 6 characters.',
        variant: 'destructive',
      });

      return false;
    }

    if (
      formData.password !==
      formData.confirmPassword
    ) {
      toast({
        title: 'Passwords Do Not Match',
        description:
          'Please make sure both passwords are the same.',
        variant: 'destructive',
      });

      return false;
    }

    return true;
  };

  // ============================================================
  // SIGN UP
  // ============================================================

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    let createdUser = null;

    try {
      // --------------------------------------------------------
      // CREATE FIREBASE AUTH ACCOUNT
      // --------------------------------------------------------

      const credential =
        await createUserWithEmailAndPassword(
          auth,
          formData.email.trim(),
          formData.password
        );

      createdUser = credential.user;

      // --------------------------------------------------------
      // SET DISPLAY NAME
      // --------------------------------------------------------

      await updateProfile(
        credential.user,
        {
          displayName: formData.name.trim(),
        }
      );

      // --------------------------------------------------------
      // FORMAT PHONE NUMBER
      // --------------------------------------------------------

      const formattedPhone = formData.phone.trim()
        ? `+91${formData.phone.trim()}`
        : '';

      // --------------------------------------------------------
      // CREATE FIRESTORE USER PROFILE
      // --------------------------------------------------------

      await setDoc(
        doc(
          db,
          'users',
          credential.user.uid
        ),
        {
          name: formData.name.trim(),

          email: formData.email.trim(),

          // Store Indian number in international format.
          phone: formattedPhone,

          role: formData.role,

          bloodType:
            formData.bloodType as BloodType,

          totalDonations: 0,

          isAvailable:
            formData.role === 'donor',

          onboardingCompleted: false,

          createdAt: serverTimestamp(),

          updatedAt: serverTimestamp(),
        }
      );

      // --------------------------------------------------------
      // SUCCESS
      // --------------------------------------------------------

      toast({
        title: 'Account Created',
        description:
          'Your BloodConnect account has been created successfully.',
      });

      router.push('/onboarding');

    } catch (error: any) {
      console.error(
        'Signup error:',
        error
      );

      // --------------------------------------------------------
      // ROLLBACK AUTH ACCOUNT IF FIRESTORE FAILED
      // --------------------------------------------------------

      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch (deleteError) {
          console.error(
            'Could not rollback user:',
            deleteError
          );
        }
      }

      // --------------------------------------------------------
      // FIREBASE ERROR MESSAGES
      // --------------------------------------------------------

      let message =
        'Could not create your account. Please try again.';

      switch (error?.code) {
        case 'auth/email-already-in-use':
          message =
            'An account with this email already exists.';
          break;

        case 'auth/invalid-email':
          message =
            'Please enter a valid email address.';
          break;

        case 'auth/weak-password':
          message =
            'Password is too weak. Please use at least 6 characters.';
          break;

        case 'auth/network-request-failed':
          message =
            'Network error. Please check your internet connection.';
          break;

        case 'auth/operation-not-allowed':
          message =
            'Email/password authentication is not enabled in Firebase.';
          break;

        case 'permission-denied':
          message =
            'Your account was created, but the user profile could not be saved because of Firestore permissions.';
          break;

        default:
          if (error?.message) {
            message = error.message;
          }
      }

      toast({
        title: 'Signup Failed',
        description: message,
        variant: 'destructive',
      });

    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">

      <Card className="w-full max-w-lg border-border shadow-sm">

        {/* ==================================================
            HEADER
        ================================================== */}

        <CardHeader className="space-y-4">

          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Link>

          <div className="flex items-center gap-3">

            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <Heart className="h-6 w-6 text-primary" />
            </div>

            <div>
              <CardTitle className="text-2xl">
                Create Account
              </CardTitle>

              <CardDescription>
                Join BloodConnect and help save lives.
              </CardDescription>
            </div>

          </div>

        </CardHeader>

        {/* ==================================================
            FORM
        ================================================== */}

        <CardContent>

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >

            {/* =================================================
                NAME
            ================================================= */}

            <div className="space-y-2">

              <Label htmlFor="name">
                Full Name *
              </Label>

              <Input
                id="name"
                name="name"
                type="text"
                placeholder="Enter your full name"
                value={formData.name}
                onChange={handleInputChange}
                disabled={loading}
                required
              />

            </div>

            {/* =================================================
                EMAIL
            ================================================= */}

            <div className="space-y-2">

              <Label htmlFor="email">
                Email Address *
              </Label>

              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleInputChange}
                disabled={loading}
                required
              />

            </div>

            {/* =================================================
                PHONE
            ================================================= */}

            <div className="space-y-2">

              <Label htmlFor="phone">
                Phone Number
              </Label>

              <div className="flex">

                {/* INDIA COUNTRY CODE */}

                <div className="flex items-center px-3 border border-r-0 border-input rounded-l-md bg-muted text-sm font-medium">
                  +91
                </div>

                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="9876543210"
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  disabled={loading}
                  className="rounded-l-none"
                  maxLength={10}
                />

              </div>

              <p className="text-xs text-muted-foreground">
                Optional. Enter your 10-digit Indian mobile number.
              </p>

            </div>

            {/* =================================================
                ROLE
            ================================================= */}

            <div className="space-y-2">

              <Label htmlFor="role">
                Account Type *
              </Label>

              <Select
                value={formData.role}
                onValueChange={(value) =>
                  handleSelectChange(
                    'role',
                    value
                  )
                }
                disabled={loading}
              >

                <SelectTrigger id="role">
                  <SelectValue
                    placeholder="Select account type"
                  />
                </SelectTrigger>

                <SelectContent>

                  <SelectItem value="donor">
                    Donor
                  </SelectItem>

                  <SelectItem value="recipient">
                    Recipient
                  </SelectItem>

                </SelectContent>

              </Select>

            </div>

            {/* =================================================
                BLOOD TYPE
            ================================================= */}

            <div className="space-y-2">

              <Label htmlFor="bloodType">
                Blood Type *
              </Label>

              <Select
                value={formData.bloodType}
                onValueChange={(value) =>
                  handleSelectChange(
                    'bloodType',
                    value
                  )
                }
                disabled={loading}
              >

                <SelectTrigger id="bloodType">

                  <SelectValue
                    placeholder="Select your blood type"
                  />

                </SelectTrigger>

                <SelectContent>

                  {BLOOD_TYPES.map(
                    (type) => (
                      <SelectItem
                        key={type}
                        value={type}
                      >
                        {type}
                      </SelectItem>
                    )
                  )}

                </SelectContent>

              </Select>

            </div>

            {/* =================================================
                PASSWORD
            ================================================= */}

            <div className="space-y-2">

              <Label htmlFor="password">
                Password *
              </Label>

              <div className="relative">

                <Input
                  id="password"
                  name="password"
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={handleInputChange}
                  disabled={loading}
                  className="pr-10"
                  required
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (prev) => !prev
                    )
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  disabled={loading}
                  aria-label={
                    showPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                >

                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}

                </button>

              </div>

              <p className="text-xs text-muted-foreground">
                Password must contain at least 6 characters.
              </p>

            </div>

            {/* =================================================
                CONFIRM PASSWORD
            ================================================= */}

            <div className="space-y-2">

              <Label htmlFor="confirmPassword">
                Confirm Password *
              </Label>

              <div className="relative">

                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={
                    showConfirmPassword
                      ? 'text'
                      : 'password'
                  }
                  placeholder="Confirm your password"
                  value={
                    formData.confirmPassword
                  }
                  onChange={handleInputChange}
                  disabled={loading}
                  className="pr-10"
                  required
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmPassword(
                      (prev) => !prev
                    )
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  disabled={loading}
                  aria-label={
                    showConfirmPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                >

                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}

                </button>

              </div>

            </div>

            {/* =================================================
                SUBMIT
            ================================================= */}

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90"
              disabled={loading}
            >

              {loading ? (

                <span className="flex items-center gap-2">

                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />

                  Creating Account...

                </span>

              ) : (

                <span className="flex items-center gap-2">

                  <UserPlus className="w-4 h-4" />

                  Create Account

                </span>

              )}

            </Button>

            {/* =================================================
                LOGIN LINK
            ================================================= */}

            <p className="text-center text-sm text-muted-foreground">

              Already have an account?{' '}

              <Link
                href="/auth/login"
                className="font-medium text-primary hover:underline"
              >
                Sign In
              </Link>

            </p>

          </form>

        </CardContent>

      </Card>

    </div>
  );
}