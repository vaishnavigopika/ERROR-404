'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserProfile } from '@/lib/types';
import {
  Heart,
  Droplet,
  Users,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';

type DashboardUserProfile = UserProfile & {
  lastDonation?: string | Date | any;
  lastDonationDate?: string | Date | any;

  nextAvailableDate?: string | Date | any;
  nextEligibleDonationDate?: string | Date | any;
  nextDonationDate?: string | Date | any;
  eligibleFrom?: string | Date | any;

  bloodStatus?: string;
  isAvailable?: boolean;
};

function toValidDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);

  return isNaN(date.getTime()) ? null : date;
}

function formatDate(value: any): string | null {
  const date = toValidDate(value);

  if (!date) return null;

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getLatestFutureEligibilityDate(
  profile: DashboardUserProfile
): Date | null {
  const possibleDates = [
    profile.nextEligibleDonationDate,
    profile.nextAvailableDate,
    profile.nextDonationDate,
    profile.eligibleFrom,
  ]
    .map(toValidDate)
    .filter((date): date is Date => date !== null);

  const futureDates = possibleDates.filter(
    (date) => date.getTime() > Date.now()
  );

  if (futureDates.length === 0) {
    return null;
  }

  return new Date(
    Math.max(...futureDates.map((date) => date.getTime()))
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const [userData, setUserData] =
    useState<DashboardUserProfile | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const userRef = doc(db, 'users', user.uid);

    const unsubscribe = onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data =
            docSnap.data() as DashboardUserProfile;

          setUserData(data);
        } else {
          setUserData(null);
        }

        setLoading(false);
      },
      (err) => {
        console.error(
          'Dashboard real-time error:',
          err
        );

        setError(
          'Failed to load profile. Please try refreshing.'
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />

          <p className="text-muted-foreground">
            Loading your dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (error || !userData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">
              Error
            </CardTitle>

            <CardDescription>
              {error || 'Profile not found'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Button
              onClick={() =>
                window.location.reload()
              }
            >
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // LAST DONATION
  // ============================================================
  //
  // Use lastDonation first, then fall back to
  // lastDonationDate.
  //
  const lastDonationValue =
    userData.lastDonation ??
    userData.lastDonationDate ??
    null;

  const formattedLastDonation =
    formatDate(lastDonationValue);

  // ============================================================
  // DONATION ELIGIBILITY
  // ============================================================

  const nextEligibilityDate =
    getLatestFutureEligibilityDate(userData);

  /*
   * A recipient cannot donate through the donor system.
   * A donor with a future eligibility date is unavailable.
   * Otherwise use the stored availability value.
   */
  const donationUnavailable =
    userData.role !== 'donor' ||
    Boolean(nextEligibilityDate) ||
    userData.isAvailable === false;

  const displayStatus = donationUnavailable
    ? 'Unavailable'
    : 'Available';

  const statusColor =
    displayStatus === 'Available'
      ? 'text-green-600'
      : 'text-red-600';

  // ============================================================
  // STATUS DESCRIPTION
  // ============================================================

  let statusDescription = 'Not available';

  if (displayStatus === 'Available') {
    statusDescription = 'Ready to donate';
  } else if (nextEligibilityDate) {
    statusDescription = `Available again on ${nextEligibilityDate.toLocaleDateString(
      'en-IN',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }
    )}`;
  } else if (userData.role !== 'donor') {
    statusDescription =
      'Only registered donors can offer blood';
  } else {
    statusDescription = 'Not available';
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">

      {/* ========================================================
          WELCOME
      ======================================================== */}

      <div className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Welcome, {userData.name || 'Donor'}
        </h1>

        <p className="text-lg text-muted-foreground">
          Blood Type:{' '}
          <span className="font-semibold text-primary">
            {userData.bloodType || '—'}
          </span>
        </p>
      </div>

      {/* ========================================================
          QUICK STATS CARDS
      ======================================================== */}

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">

        {/* TOTAL DONATIONS */}
        <Card className="border-border hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Heart className="w-4 h-4 text-primary" />
              Total Donations
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-bold">
              {userData.totalDonations ?? 0}
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              Lives potentially saved
            </p>
          </CardContent>
        </Card>

        {/* DONATION STATUS */}
        <Card className="border-border hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Droplet className="w-4 h-4 text-primary" />
              Donation Status
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div
              className={`text-2xl font-bold ${statusColor}`}
            >
              {displayStatus}
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              {statusDescription}
            </p>
          </CardContent>
        </Card>

        {/* LAST DONATION */}
        <Card className="border-border hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Last Donation
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-bold">
              {formattedLastDonation || 'Never'}
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              Donation history
            </p>
          </CardContent>
        </Card>

        {/* ROLE */}
        <Card className="border-border hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Role
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-bold capitalize">
              {userData.role || '—'}
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              Account type
            </p>
          </CardContent>
        </Card>

      </div>

      {/* ========================================================
          QUICK ACTION CARDS
      ======================================================== */}

      <div className="grid md:grid-cols-3 gap-6">

        {/* FIND DONORS */}
        <Card className="border-border hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Find Donors</CardTitle>

            <CardDescription>
              {userData.role === 'recipient'
                ? 'Search for compatible donors nearby'
                : 'Browse donors in your area'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Link href="/dashboard/donors">
              <Button className="w-full">
                Browse Donors
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* BLOOD REQUESTS */}
        <Card className="border-border hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Blood Requests</CardTitle>

            <CardDescription>
              {userData.role === 'recipient'
                ? 'Create or manage your requests'
                : 'See urgent requests from recipients'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Link href="/dashboard/requests">
              <Button className="w-full">
                View Requests
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* MESSAGES */}
        <Card className="border-border hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Messages</CardTitle>

            <CardDescription>
              Chat with donors or recipients
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Link href="/dashboard/messages">
              <Button className="w-full">
                Open Messages
              </Button>
            </Link>
          </CardContent>
        </Card>

      </div>

      {/* ========================================================
          DONOR AVAILABILITY
      ======================================================== */}

      {userData.role === 'donor' && (
        <Card className="border-border bg-muted/30">

          <CardHeader>
            <CardTitle className="text-lg">
              Your Donation Availability
            </CardTitle>

            <CardDescription>
              Your current eligibility to donate blood
            </CardDescription>
          </CardHeader>

          <CardContent className="flex items-center justify-between flex-wrap gap-4">

            <div>

              <p
                className={`font-semibold ${statusColor}`}
              >
                {displayStatus === 'Available'
                  ? 'You are currently available to donate'
                  : 'You are currently unavailable'}
              </p>

              <p className="text-sm text-muted-foreground mt-1">

                {nextEligibilityDate
                  ? `Next available: ${nextEligibilityDate.toLocaleDateString(
                      'en-IN',
                      {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }
                    )}`
                  : displayStatus === 'Available'
                  ? 'Recipients can contact you for donations'
                  : 'You are currently not eligible to donate'}

              </p>

            </div>

            <Button variant="outline" asChild>
              <Link href="/dashboard/profile">
                Update Profile
              </Link>
            </Button>

          </CardContent>
        </Card>
      )}

    </div>
  );
}