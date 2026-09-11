'use client';

import React, { useEffect, useState } from 'react';

import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';

import {
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';

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
import { Textarea } from '@/components/ui/textarea';

import { useToast } from '@/hooks/use-toast';

import {
  User,
  Heart,
  Pencil,
  Mail,
  Phone,
  Calendar,
  FileText,
  X,
  Save,
} from 'lucide-react';


// ============================================================
// PROFILE TYPE
// ============================================================

type ProfileData = {
  name?: string;
  email?: string;

  phone?: string;
  phoneNumber?: string;

  bloodType?: string;

  medicalHistory?: string;

  totalDonations?: number;

  role?: string;

  lastDonation?: any;
  lastDonationDate?: any;

  onboarding?: {
    age?: number | string;
    weight?: number | string;
    donatedBefore?: boolean;
    lastDonationDate?: string | null;

    cannotDonate?: boolean;
    hivAids?: boolean;
    hepatitis?: boolean;
    seriousInfectiousDisease?: boolean;
    recentTattooPiercingMakeup?: boolean;
    recentDentalTreatment?: boolean;
  };
};


// ============================================================
// PROFILE PAGE
// ============================================================

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [userProfile, setUserProfile] =
    useState<ProfileData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [isEditing, setIsEditing] =
    useState(false);


  // ============================================================
  // EDITABLE FORM DATA
  // ============================================================

  const [formData, setFormData] = useState({
    name: '',
    age: '',
    phone: '',
    medicalHistory: '',
  });


  // ============================================================
  // CLEAN PHONE NUMBER
  // ============================================================

  const cleanPhoneNumber = (
    phone: string
  ): string => {
    return phone
      .replace(/^\+91/, '')
      .replace(/\D/g, '')
      .slice(0, 10);
  };


  // ============================================================
  // LOAD PROFILE INTO FORM
  // ============================================================

  const loadFormData = (
    profile: ProfileData
  ) => {

    const storedPhone =
      profile.phone ||
      profile.phoneNumber ||
      '';

    const cleanPhone =
      cleanPhoneNumber(storedPhone);

    const storedAge =
      profile.onboarding?.age;

    setFormData({
      name:
        profile.name || '',

      age:
        storedAge !== undefined &&
        storedAge !== null
          ? String(storedAge)
          : '',

      phone:
        cleanPhone,

      medicalHistory:
        profile.medicalHistory || '',
    });
  };


  // ============================================================
  // FETCH USER PROFILE
  // ============================================================

  useEffect(() => {

    const fetchProfile = async () => {

      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {

        const userRef =
          doc(
            db,
            'users',
            user.uid
          );

        const snapshot =
          await getDoc(userRef);

        if (snapshot.exists()) {

          const profile =
            snapshot.data() as ProfileData;

          setUserProfile(profile);

          loadFormData(profile);

        } else {

          setUserProfile(null);

        }

      } catch (error) {

        console.error(
          'Error fetching profile:',
          error
        );

        toast({
          title: 'Error',
          description:
            'Failed to load your profile.',
          variant: 'destructive',
        });

      } finally {

        setLoading(false);

      }
    };

    fetchProfile();

  }, [user?.uid, toast]);


  // ============================================================
  // GENERAL INPUT HANDLER
  // ============================================================

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement
    >
  ) => {

    const {
      name,
      value,
    } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };


  // ============================================================
  // AGE INPUT HANDLER
  // ============================================================

  const handleAgeChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {

    const value =
      e.target.value
        .replace(/\D/g, '')
        .slice(0, 3);

    setFormData((previous) => ({
      ...previous,
      age: value,
    }));
  };


  // ============================================================
  // PHONE INPUT HANDLER
  // ============================================================

  const handlePhoneChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {

    const value =
      e.target.value
        .replace(/\D/g, '')
        .slice(0, 10);

    setFormData((previous) => ({
      ...previous,
      phone: value,
    }));
  };


  // ============================================================
  // EDIT PROFILE
  // ============================================================

  const handleEdit = () => {

    if (!userProfile) {
      return;
    }

    loadFormData(userProfile);

    setIsEditing(true);
  };


  // ============================================================
  // CANCEL EDITING
  // ============================================================

  const handleCancel = () => {

    if (userProfile) {
      loadFormData(userProfile);
    }

    setIsEditing(false);
  };


  // ============================================================
  // SAVE PROFILE
  // ============================================================

  const handleSave = async () => {

    if (!user?.uid) {
      return;
    }


    // ----------------------------------------------------------
    // VALIDATE NAME
    // ----------------------------------------------------------

    if (!formData.name.trim()) {

      toast({
        title: 'Name Required',
        description:
          'Please enter your full name.',
        variant: 'destructive',
      });

      return;
    }


    // ----------------------------------------------------------
    // VALIDATE AGE
    // ----------------------------------------------------------

    const age =
      Number(formData.age);

    if (
      !formData.age.trim() ||
      !Number.isInteger(age) ||
      age < 1 ||
      age > 120
    ) {

      toast({
        title: 'Invalid Age',
        description:
          'Please enter a valid age.',
        variant: 'destructive',
      });

      return;
    }


    // ----------------------------------------------------------
    // VALIDATE PHONE
    // ----------------------------------------------------------

    if (
      formData.phone.trim() &&
      !/^\d{10}$/.test(
        formData.phone.trim()
      )
    ) {

      toast({
        title: 'Invalid Phone Number',
        description:
          'Please enter a valid 10-digit Indian mobile number.',
        variant: 'destructive',
      });

      return;
    }


    setSaving(true);


    try {

      const userRef =
        doc(
          db,
          'users',
          user.uid
        );


      // --------------------------------------------------------
      // FORMAT PHONE NUMBER
      // --------------------------------------------------------

      const formattedPhone =
        formData.phone.trim()
          ? `+91${formData.phone.trim()}`
          : '';


      // --------------------------------------------------------
      // KEEP EXISTING ONBOARDING DATA
      // --------------------------------------------------------

      const existingOnboarding =
        userProfile?.onboarding || {};


      // --------------------------------------------------------
      // UPDATE FIRESTORE
      // --------------------------------------------------------

      await updateDoc(
        userRef,
        {

          name:
            formData.name.trim(),

          phone:
            formattedPhone,

          // Keep compatibility with older
          // user records.
          phoneNumber:
            formattedPhone,

          onboarding: {
            ...existingOnboarding,
            age: age,
          },

          medicalHistory:
            formData.medicalHistory.trim(),

          updatedAt:
            new Date().toISOString(),
        }
      );


      // --------------------------------------------------------
      // UPDATE LOCAL STATE
      // --------------------------------------------------------

      const updatedProfile: ProfileData = {

        ...(userProfile || {}),

        name:
          formData.name.trim(),

        phone:
          formattedPhone,

        phoneNumber:
          formattedPhone,

        onboarding: {
          ...existingOnboarding,
          age: age,
        },

        medicalHistory:
          formData.medicalHistory.trim(),
      };


      setUserProfile(
        updatedProfile
      );


      // --------------------------------------------------------
      // EXIT EDIT MODE
      // --------------------------------------------------------

      setIsEditing(false);


      toast({
        title: 'Profile Updated',
        description:
          'Your profile has been updated successfully.',
      });

    } catch (error: any) {

      console.error(
        'Profile update error:',
        error
      );

      toast({
        title: 'Update Failed',
        description:
          error?.message ||
          'Could not update your profile.',
        variant: 'destructive',
      });

    } finally {

      setSaving(false);

    }
  };


  // ============================================================
  // FORMAT DATE
  // ============================================================

  const formatDate = (
    value: any
  ): string | null => {

    if (!value) {
      return null;
    }

    try {

      // Firebase Timestamp
      if (
        typeof value?.toDate === 'function'
      ) {

        const date =
          value.toDate();

        if (
          Number.isNaN(
            date.getTime()
          )
        ) {
          return null;
        }

        return date.toLocaleDateString(
          'en-IN',
          {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }
        );
      }


      // JavaScript Date
      if (
        value instanceof Date
      ) {

        if (
          Number.isNaN(
            value.getTime()
          )
        ) {
          return null;
        }

        return value.toLocaleDateString(
          'en-IN',
          {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }
        );
      }


      // String / number
      const date =
        new Date(value);

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return null;
      }

      return date.toLocaleDateString(
        'en-IN',
        {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }
      );

    } catch {

      return null;

    }
  };


  // ============================================================
  // LOADING SCREEN
  // ============================================================

  if (loading) {

    return (
      <div className="flex items-center justify-center min-h-[60vh]">

        <div className="text-center">

          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />

          <p className="text-muted-foreground">
            Loading profile...
          </p>

        </div>

      </div>
    );
  }


  // ============================================================
  // PROFILE NOT FOUND
  // ============================================================

  if (!userProfile) {

    return (
      <div className="flex items-center justify-center min-h-[60vh]">

        <div className="text-center">

          <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />

          <h2 className="text-xl font-semibold">
            Profile Not Found
          </h2>

          <p className="text-muted-foreground mt-2">
            We could not find your profile information.
          </p>

        </div>

      </div>
    );
  }


  // ============================================================
  // DISPLAY VALUES
  // ============================================================

  const displayPhone =
    userProfile.phone ||
    userProfile.phoneNumber ||
    'Not provided';


  const displayAge =
    userProfile.onboarding?.age !==
      undefined &&
    userProfile.onboarding?.age !==
      null
      ? `${userProfile.onboarding.age} years`
      : 'Not provided';


  const displayLastDonation =
    formatDate(
      userProfile.lastDonation ||
      userProfile.lastDonationDate
    ) || 'Never';


  // ============================================================
  // VIEW MODE
  // ============================================================

  if (!isEditing) {

    return (
      <div className="p-6 md:p-8 space-y-6 max-w-4xl mx-auto">


        {/* ======================================================
            PAGE HEADER
        ====================================================== */}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

          <div>

            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              My Profile
            </h1>

            <p className="text-muted-foreground mt-2">
              View your personal information
            </p>

          </div>


          {/* EDIT PROFILE */}

          <Button
            onClick={handleEdit}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >

            <Pencil className="w-4 h-4 mr-2" />

            Edit Profile

          </Button>

        </div>


        {/* ======================================================
            PROFILE CARD
        ====================================================== */}

        <Card className="border-border shadow-sm">

          <CardHeader>

            <div className="flex items-center gap-4">

              {/* PROFILE ICON */}

              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">

                <User className="w-7 h-7 text-primary" />

              </div>


              {/* NAME + ROLE */}

              <div>

                <CardTitle className="text-2xl">

                  {userProfile.name ||
                    'User'}

                </CardTitle>

                <CardDescription className="mt-1 capitalize">

                  {userProfile.role ||
                    'BloodConnect Member'}

                </CardDescription>

              </div>

            </div>

          </CardHeader>


          <CardContent>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">


              {/* =================================================
                  FULL NAME
              ================================================= */}

              <div>

                <div className="flex items-center gap-2 mb-2">

                  <User className="w-4 h-4 text-primary" />

                  <p className="text-sm font-medium text-muted-foreground">
                    Full Name
                  </p>

                </div>

                <p className="text-base font-medium">
                  {userProfile.name ||
                    'Not provided'}
                </p>

              </div>


              {/* =================================================
                  AGE
              ================================================= */}

              <div>

                <div className="flex items-center gap-2 mb-2">

                  <Calendar className="w-4 h-4 text-primary" />

                  <p className="text-sm font-medium text-muted-foreground">
                    Age
                  </p>

                </div>

                <p className="text-base font-medium">
                  {displayAge}
                </p>

              </div>


              {/* =================================================
                  PHONE
              ================================================= */}

              <div>

                <div className="flex items-center gap-2 mb-2">

                  <Phone className="w-4 h-4 text-primary" />

                  <p className="text-sm font-medium text-muted-foreground">
                    Phone Number
                  </p>

                </div>

                <p className="text-base font-medium">
                  {displayPhone}
                </p>

              </div>


              {/* =================================================
                  EMAIL
              ================================================= */}

              <div>

                <div className="flex items-center gap-2 mb-2">

                  <Mail className="w-4 h-4 text-primary" />

                  <p className="text-sm font-medium text-muted-foreground">
                    Email Address
                  </p>

                </div>

                <p className="text-base font-medium break-all">
                  {userProfile.email ||
                    user?.email ||
                    'Not provided'}
                </p>

              </div>


              {/* =================================================
                  BLOOD TYPE
              ================================================= */}

              <div>

                <div className="flex items-center gap-2 mb-2">

                  <Heart className="w-4 h-4 text-primary fill-primary" />

                  <p className="text-sm font-medium text-muted-foreground">
                    Blood Type
                  </p>

                </div>

                <p className="text-base font-semibold text-primary">
                  {userProfile.bloodType ||
                    'Not provided'}
                </p>

              </div>


              {/* =================================================
                  ACCOUNT TYPE
              ================================================= */}

              <div>

                <div className="flex items-center gap-2 mb-2">

                  <User className="w-4 h-4 text-primary" />

                  <p className="text-sm font-medium text-muted-foreground">
                    Account Type
                  </p>

                </div>

                <p className="text-base font-medium capitalize">
                  {userProfile.role ||
                    'User'}
                </p>

              </div>

            </div>


            {/* ==================================================
                MEDICAL HISTORY
            ================================================== */}

            <div className="mt-8 pt-7 border-t border-border">

              <div className="flex items-center gap-2 mb-2">

                <FileText className="w-4 h-4 text-primary" />

                <p className="text-sm font-medium text-muted-foreground">
                  Medical History
                </p>

              </div>

              <p className="text-base leading-7 whitespace-pre-wrap">

                {userProfile.medicalHistory?.trim()
                  ? userProfile.medicalHistory
                  : 'No medical history provided.'}

              </p>

            </div>

          </CardContent>

        </Card>


        {/* ======================================================
            ACCOUNT STATISTICS
        ====================================================== */}

        <Card className="border-border bg-secondary/5">

          <CardHeader>

            <CardTitle>
              Account Statistics
            </CardTitle>

          </CardHeader>


          <CardContent>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">


              {/* TOTAL DONATIONS */}

              <div>

                <p className="text-sm text-muted-foreground">
                  Total Donations
                </p>

                <p className="text-2xl font-bold mt-1">
                  {userProfile.totalDonations ?? 0}
                </p>

              </div>


              {/* LAST DONATION */}

              <div>

                <p className="text-sm text-muted-foreground">
                  Last Donation
                </p>

                <p className="text-base font-semibold mt-1">
                  {displayLastDonation}
                </p>

              </div>

            </div>

          </CardContent>

        </Card>

      </div>
    );
  }


  // ============================================================
  // EDIT MODE
  // ============================================================

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl mx-auto">


      {/* ======================================================
          EDIT HEADER
      ====================================================== */}
    <div>
      <h1 className="text-3xl md:text-4xl font-bold text-foreground">
        Edit Profile
      </h1>

      <p className="text-muted-foreground mt-2">
        Update your personal information
      </p>
    </div>

      {/* ======================================================
          EDIT CARD
      ====================================================== */}

      <Card className="border-border shadow-sm">

        <CardHeader>

          <CardTitle className="flex items-center gap-2">

            <User className="w-5 h-5 text-primary" />

            Personal Information

          </CardTitle>

          <CardDescription>
            Update the information shown on your profile.
          </CardDescription>

        </CardHeader>


        <CardContent className="space-y-6">


          {/* ====================================================
              FULL NAME
          ==================================================== */}

          <div className="space-y-2">

            <Label htmlFor="name">
              Full Name
            </Label>

            <Input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Enter your full name"
              disabled={saving}
            />

          </div>


          {/* ====================================================
              AGE
          ==================================================== */}

          <div className="space-y-2">

            <Label htmlFor="age">
              Age
            </Label>

            <Input
              id="age"
              name="age"
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={formData.age}
              onChange={handleAgeChange}
              placeholder="Enter your age"
              disabled={saving}
            />

          </div>


          {/* ====================================================
              PHONE
          ==================================================== */}

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
                maxLength={10}
                value={formData.phone}
                onChange={handlePhoneChange}
                placeholder="9876543210"
                disabled={saving}
                className="rounded-l-none"
              />

            </div>

            <p className="text-xs text-muted-foreground">
              Enter your 10-digit Indian mobile number.
            </p>

          </div>


          {/* ====================================================
              EMAIL
          ==================================================== */}

          <div className="space-y-2">

            <Label htmlFor="email">
              Email Address
            </Label>

            <Input
              id="email"
              value={
                userProfile.email ||
                user?.email ||
                ''
              }
              disabled
              className="bg-muted"
            />

            <p className="text-xs text-muted-foreground">
              Email address cannot be changed here.
            </p>

          </div>


          {/* ====================================================
              BLOOD TYPE
          ==================================================== */}

          <div className="space-y-2">

            <Label>
              Blood Type
            </Label>

            <div className="flex items-center gap-3 h-10 px-3 rounded-md border border-input bg-muted">

              <Heart className="w-4 h-4 text-primary fill-primary" />

              <span className="font-semibold text-primary">
                {userProfile.bloodType ||
                  'Not provided'}
              </span>

            </div>

            <p className="text-xs text-muted-foreground">
              Blood type cannot be changed here.
            </p>

          </div>


          {/* ====================================================
              MEDICAL HISTORY
          ==================================================== */}

          <div className="space-y-2">

            <Label htmlFor="medicalHistory">
              Medical History
            </Label>

            <Textarea
              id="medicalHistory"
              name="medicalHistory"
              value={
                formData.medicalHistory
              }
              onChange={handleInputChange}
              placeholder="Any relevant medical conditions or allergies..."
              rows={5}
              disabled={saving}
            />

          </div>

        </CardContent>

      </Card>


      {/* ======================================================
          BOTTOM ACTION BUTTONS
      ====================================================== */}

      <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">

        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={saving}
          className="sm:w-auto"
        >

          <X className="w-4 h-4 mr-2" />

          Cancel

        </Button>


        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
        >

          {saving ? (

            <>
              <span className="w-4 h-4 mr-2 rounded-full border-2 border-current border-t-transparent animate-spin" />

              Saving...
            </>

          ) : (

            <>
              <Save className="w-4 h-4 mr-2" />

              Save Changes
            </>

          )}

        </Button>

      </div>

    </div>
  );
}