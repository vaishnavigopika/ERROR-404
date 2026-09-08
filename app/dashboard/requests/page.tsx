'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { BloodRequest, UserProfile } from '@/lib/types';

// Blood requests may contain scheduling fields in Firestore even if the
// shared BloodRequest interface has not been updated yet.
type RequestWithScheduling = BloodRequest & {
  requiredTimeStart?: string;
  requiredTimeEnd?: string;
};
import {
  Droplet,
  Calendar,
  AlertCircle,
  User,
  Plus,
  Clock,
  Edit,
} from 'lucide-react';

import { offerBloodDonation } from '@/lib/services/donationService';
import { isUserEligibleToDonate } from '@/lib/services/userService';
import { toast } from 'sonner';
import {
  getCompatibleRecipients,
  BloodType,
  BLOOD_TYPES,
} from '@/lib/bloodCompatibility';

const urgencyColors = {
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

type DonorEligibilityProfile = UserProfile & {
  nextEligibleDonationDate?: string | Date | null;
  nextDonationDate?: string | Date | null;
  eligibleFrom?: string | Date | null;
  lastDonationDate?: string | Date | null;
};

const statusColors = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  matched: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  completed: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

function isValidBloodType(value: unknown): value is BloodType {
  return typeof value === 'string' && BLOOD_TYPES.includes(value as BloodType);
}

function formatDate(value: unknown): string {
  if (!value) return 'Not specified';

  try {
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as any).toDate === 'function'
    ) {
      return (value as any).toDate().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }

    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime())) return 'Invalid date';

    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Invalid date';
  }
}

function toValidDate(value: unknown): Date | null {
  if (!value) return null;

  try {
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as any).toDate === 'function'
    ) {
      const date = (value as any).toDate();
      return date instanceof Date && !Number.isNaN(date.getTime())
        ? date
        : null;
    }

    const date = new Date(value as string | number | Date);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function getNextEligibleDonationDate(
  profile: DonorEligibilityProfile | null
): Date | null {
  if (!profile) return null;

  const explicitDate =
    profile.nextEligibleDonationDate ??
    profile.nextDonationDate ??
    profile.eligibleFrom;

  const parsedExplicitDate = toValidDate(explicitDate);
  if (parsedExplicitDate) {
    return parsedExplicitDate;
  }

  const lastDonationDate = toValidDate(profile.lastDonationDate);
  if (!lastDonationDate) return null;

  // BloodConnect uses a three-month waiting period after a completed donation.
  const nextEligibleDate = new Date(lastDonationDate);
  nextEligibleDate.setMonth(nextEligibleDate.getMonth() + 3);

  return nextEligibleDate;
}

function getRequestQuantity(request: RequestWithScheduling): number {
  return Math.max(0, request.quantity ?? request.unitsNeeded ?? 0);
}

function isRequestExpired(request: RequestWithScheduling): boolean {
  if (!request.requiredDate) return false;

  const requiredDate = new Date(`${request.requiredDate}T23:59:59`);
  if (Number.isNaN(requiredDate.getTime())) return false;

  return requiredDate.getTime() < Date.now();
}

function formatTimeWindow(request: RequestWithScheduling): string | null {
  if (!request.requiredTimeStart && !request.requiredTimeEnd) return null;
  if (request.requiredTimeStart && request.requiredTimeEnd) {
    return `${request.requiredTimeStart} – ${request.requiredTimeEnd}`;
  }
  return request.requiredTimeStart || request.requiredTimeEnd || null;
}

function getCreatedAtTime(value: any): number {
  try {
    if (value?.toDate) return value.toDate().getTime();
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  } catch {
    return 0;
  }
}

export default function RequestsPage() {
  const { user } = useAuth();

  const [ownRequests, setOwnRequests] = useState<RequestWithScheduling[]>([]);
  const [donorRequests, setDonorRequests] = useState<RequestWithScheduling[]>([]);
  const [recipientNames, setRecipientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [donorBloodType, setDonorBloodType] = useState<BloodType | null>(null);
  const [activeDonationId, setActiveDonationId] = useState<string | null>(null);
  const [profile, setProfile] = useState<DonorEligibilityProfile | null>(null);

  const [donationUnavailableUntil, setDonationUnavailableUntil] =
    useState<Date | null>(null);
  const [donationUnavailableModalOpen, setDonationUnavailableModalOpen] =
    useState(false);

  const hasOwnRequests = ownRequests.length > 0;
  const hasDonorRequests = donorRequests.length > 0;

  const loadRequests = async () => {
    if (!user) {
      setOwnRequests([]);
      setDonorRequests([]);
      setRecipientNames({});
      setProfile(null);
      setDonorBloodType(null);
      setActiveDonationId(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const userSnap = await getDoc(doc(db, 'users', user.uid));

      if (!userSnap.exists()) {
        toast.error('Your user profile could not be found.');
        setOwnRequests([]);
        setDonorRequests([]);
        setLoading(false);
        return;
      }

      const userData = userSnap.data() as DonorEligibilityProfile;
      setProfile(userData);
      setActiveDonationId(
        typeof userData.activeDonationId === 'string' && userData.activeDonationId.length > 0
          ? userData.activeDonationId
          : null
      );

      const requestsRef = collection(db, 'bloodRequests');

      // IMPORTANT:
      // Always load the current user's own requests regardless of the
      // permanent profile role. A donor can also create a blood request.
      const ownSnapshot = await getDocs(
        query(requestsRef, where('recipientId', '==', user.uid))
      );

      const own = ownSnapshot.docs.map((requestDoc) => ({
        id: requestDoc.id,
        ...requestDoc.data(),
      })) as RequestWithScheduling[];

      own.sort((a, b) => getCreatedAtTime(b.createdAt) - getCreatedAtTime(a.createdAt));
      setOwnRequests(own);

      // Load compatible requests only when this profile can act as a donor.
      let compatible: RequestWithScheduling[] = [];
      setDonorBloodType(null);

      if (userData.role === 'donor' && isValidBloodType(userData.bloodType)) {
        setDonorBloodType(userData.bloodType);

        const compatibleBloodTypes = getCompatibleRecipients(userData.bloodType);
        const donorSnapshot = await getDocs(
          query(
            requestsRef,
            where('status', '==', 'open'),
            where('bloodType', 'in', compatibleBloodTypes)
          )
        );

        compatible = donorSnapshot.docs
          .map((requestDoc) => ({
            id: requestDoc.id,
            ...requestDoc.data(),
          }))
          .map((request) => request as RequestWithScheduling)
          .filter(
            (request) =>
              request.recipientId !== user.uid &&
              getRequestQuantity(request) > 0 &&
              !isRequestExpired(request)
          );

        compatible.sort((a, b) => {
          const urgencyRank: Record<string, number> = {
            critical: 4,
            high: 3,
            medium: 2,
            low: 1,
          };
          const urgencyDifference =
            (urgencyRank[b.urgency] ?? 0) - (urgencyRank[a.urgency] ?? 0);
          if (urgencyDifference !== 0) return urgencyDifference;
          return getCreatedAtTime(b.createdAt) - getCreatedAtTime(a.createdAt);
        });
      }

      setDonorRequests(compatible);

      // Fetch recipient names for donor-facing requests.
      const names: Record<string, string> = {};
      for (const request of compatible) {
        if (!request.recipientId || names[request.recipientId]) continue;

        try {
          const recipientSnap = await getDoc(doc(db, 'users', request.recipientId));
          names[request.recipientId] = recipientSnap.exists()
            ? ((recipientSnap.data() as UserProfile).name || 'Unknown User')
            : 'Unknown User';
        } catch {
          names[request.recipientId] = 'Unknown User';
        }
      }
      setRecipientNames(names);
    } catch (error) {
      console.error('Error fetching blood requests:', error);
      toast.error('Failed to load blood requests.');
      setOwnRequests([]);
      setDonorRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [user]);

  const handleOfferBlood = async (request: RequestWithScheduling) => {
    try {
      if (!user) {
        toast.error('Please sign in to offer blood.');
        return;
      }

      if (request.recipientId === user.uid) {
        toast.error('You cannot offer blood to your own request.');
        return;
      }

      if (offeringId) return;

      if (isRequestExpired(request)) {
        toast.error('This blood request has expired.');
        return;
      }

      // Check the same eligibility function used by the donation service.
      // If the donor is in the waiting period, NEVER call offerBloodDonation.
      let eligible = false;

      try {
        eligible = await isUserEligibleToDonate(user.uid);
      } catch {
        toast.error(
          'Unable to verify your donation eligibility. Please try again.'
        );
        return;
      }

      if (!eligible) {
        let nextEligibleDate = getNextEligibleDonationDate(profile);

        // If the profile does not contain the date, derive it from the
        // latest completed donation.
        if (!nextEligibleDate) {
          try {
            const donationSnapshot = await getDocs(
              query(
                collection(db, 'donations'),
                where('donorId', '==', user.uid)
              )
            );

            const completedDates = donationSnapshot.docs
              .map((donationDoc) => donationDoc.data())
              .filter((donation) => donation.status === 'completed')
              .map((donation) =>
                toValidDate(
                  donation.completedAt ??
                    donation.donationDate ??
                    donation.createdAt
                )
              )
              .filter((date): date is Date => Boolean(date))
              .sort((a, b) => b.getTime() - a.getTime());

            if (completedDates[0]) {
              nextEligibleDate = new Date(completedDates[0]);
              nextEligibleDate.setMonth(
                nextEligibleDate.getMonth() + 3
              );
            }
          } catch {
            // The eligibility result is already authoritative.
          }
        }

        setDonationUnavailableUntil(nextEligibleDate);
        setDonationUnavailableModalOpen(true);
        return;
      }

      if (activeDonationId) {
        toast.error(
          'You already have an active donation. Complete or cancel it before offering blood again.'
        );
        return;
      }

      setOfferingId(request.id);

      try {
        const result = await offerBloodDonation({
          donorId: user.uid,
          requestId: request.id,
          units: 1,
          date: new Date(),
        });

        setActiveDonationId(result.donationId);
        toast.success('Blood offer submitted successfully!');
        await loadRequests();
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : '';

        // Backend is authoritative. Convert its eligibility error into
        // the same normal popup instead of showing a red Next.js overlay.
        if (
          message
            .toLowerCase()
            .includes('currently unavailable for blood donation')
        ) {
          let nextEligibleDate = getNextEligibleDonationDate(profile);

          if (!nextEligibleDate) {
            try {
              const donationSnapshot = await getDocs(
                query(
                  collection(db, 'donations'),
                  where('donorId', '==', user.uid)
                )
              );

              const completedDates = donationSnapshot.docs
                .map((donationDoc) => donationDoc.data())
                .filter((donation) => donation.status === 'completed')
                .map((donation) =>
                  toValidDate(
                    donation.completedAt ??
                      donation.donationDate ??
                      donation.createdAt
                  )
                )
                .filter((date): date is Date => Boolean(date))
                .sort((a, b) => b.getTime() - a.getTime());

              if (completedDates[0]) {
                nextEligibleDate = new Date(completedDates[0]);
                nextEligibleDate.setMonth(
                  nextEligibleDate.getMonth() + 3
                );
              }
            } catch {
              // Keep the popup even if the historical date cannot be read.
            }
          }

          setDonationUnavailableUntil(nextEligibleDate);
          setDonationUnavailableModalOpen(true);
          return;
        }

        toast.error(
          message || 'Failed to offer blood. Please try again.'
        );
      } finally {
        setOfferingId(null);
      }
    } catch {
      setOfferingId(null);
      toast.error(
        'Something went wrong while processing your blood offer.'
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-foreground">Loading blood requests...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <Droplet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Please sign in</h3>
            <p className="text-foreground/60">You need to sign in to view blood requests.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Blood Requests</h1>
          <p className="text-foreground/60 mt-2">
            View your requests and find compatible blood requests you can help with.
          </p>
        </div>

        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href="/dashboard/requests/new">
            <Plus className="w-4 h-4 mr-2" />
            Create Request
          </Link>
        </Button>
      </div>

      {/* DONOR AVAILABILITY NOTICE */}
      {donorBloodType &&
        (() => {
          const nextEligibleDate =
            getNextEligibleDonationDate(profile);

          const currentlyUnavailable =
            donationUnavailableModalOpen ||
            Boolean(nextEligibleDate) &&
            nextEligibleDate!.getTime() > Date.now();

          if (!currentlyUnavailable && !activeDonationId) {
            return null;
          }

          return (
            <Card
              className={
                currentlyUnavailable
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                  : 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30'
              }
            >
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertCircle
                    className={
                      currentlyUnavailable
                        ? 'w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5'
                        : 'w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5'
                    }
                  />

                  <div className="flex-1">
                    {currentlyUnavailable ? (
                      <>
                        <p className="font-semibold text-amber-900 dark:text-amber-300">
                          You are currently unavailable for blood donation
                        </p>

                        <p className="text-sm text-amber-800 dark:text-amber-400 mt-1">
                          You recently donated blood and are in the required
                          waiting period.
                        </p>

                        <p className="text-sm text-amber-800 dark:text-amber-400 mt-1">
                          You can offer blood again on{' '}
                          <strong>
                            {formatDate(nextEligibleDate)}
                          </strong>
                          .
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-blue-900 dark:text-blue-300">
                          You have an active donation
                        </p>

                        <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                          Complete or cancel your current donation before
                          offering blood to another request.
                        </p>

                        <Link
                          href="/dashboard/donations"
                          className="inline-block mt-2 text-sm font-medium text-blue-800 dark:text-blue-300 underline"
                        >
                          View My Donations
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

      {/* ======================================================== */}
      {/* MY REQUESTS — ALWAYS SHOWN, REGARDLESS OF ROLE */}
      {/* ======================================================== */}
      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">My Blood Requests</h2>
          <p className="text-foreground/60 mt-1">
            Requests created by you. These remain visible even after they expire or are fulfilled.
          </p>
        </div>

        {!hasOwnRequests ? (
          <Card className="border-border">
            <CardContent className="pt-10 pb-10 text-center">
              <Droplet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No blood requests yet</h3>
              <p className="text-foreground/60 mb-6">
                Create a blood request when you need blood.
              </p>
              <Button asChild>
                <Link href="/dashboard/requests/new">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Request
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {ownRequests.map((request) => {
              const quantity = getRequestQuantity(request);
              const matchedCount = request.matchedDonors?.length ?? 0;
              const expired = isRequestExpired(request);
              const timeWindow = formatTimeWindow(request);

              return (
                <Card
                  key={request.id}
                  className="border-border overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <CardTitle className="text-lg">Your Blood Request</CardTitle>
                          <Badge className="bg-primary/20 text-primary border-primary/30">
                            {request.bloodType}
                          </Badge>
                        </div>
                        <CardDescription>{request.reason}</CardDescription>
                      </div>

                      <Badge
                        className={
                          expired
                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300'
                            : statusColors[request.status]
                        }
                      >
                        {expired
                          ? 'Expired'
                          : request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-3 text-foreground/70">
                        <Droplet className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>
                          <span className="font-medium text-foreground">{quantity}</span>{' '}
                          unit{quantity !== 1 ? 's' : ''} remaining
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-foreground/70">
                        <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>
                          Needed by{' '}
                          <span className="font-medium text-foreground">
                            {formatDate(request.requiredDate)}
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-foreground/70">
                        <Clock className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>
                          Time:{' '}
                          <span className="font-medium text-foreground">
                            {timeWindow || 'Not specified'}
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-foreground/70">
                        <User className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>
                          <span className="font-medium text-foreground">{matchedCount}</span>{' '}
                          donor{matchedCount !== 1 ? 's' : ''} matched
                        </span>
                      </div>
                    </div>

                    {expired && (
                      <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-3 text-sm text-orange-800 dark:text-orange-300">
                        This request has passed its required date. You can open it and edit the
                        required date if you still need blood.
                      </div>
                    )}

                    {!expired && request.status === 'open' && quantity > 0 && (
                      <div className="rounded-lg bg-muted/50 p-3 text-sm text-foreground/70">
                        {matchedCount > 0 ? (
                          <>
                            <span className="font-medium text-foreground">
                              {matchedCount} donor{matchedCount !== 1 ? 's' : ''} have offered to help.
                            </span>{' '}
                            {quantity} {quantity === 1 ? 'unit remains' : 'units remain'} to fulfill
                            this request.
                          </>
                        ) : (
                          <>Your request is open and waiting for compatible donors.</>
                        )}
                      </div>
                    )}

                    {request.status === 'matched' && (
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-300">
                        Your request currently has enough donor offers. Open the request details to
                        view donors and coordinate scheduling.
                      </div>
                    )}

                    <div className="pt-4 border-t border-border flex flex-col sm:flex-row gap-3">
                      <Button variant="outline" className="flex-1" asChild>
                        <Link href={`/dashboard/requests/${request.id}`}>
                          View Request Details
                        </Link>
                      </Button>

                      <Button variant="outline" className="flex-1" asChild>
                        <Link href={`/dashboard/requests/${request.id}/edit`}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Request
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ======================================================== */}
      {/* DONOR REQUESTS */}
      {/* ======================================================== */}
      {donorBloodType && (
        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Requests You Can Help With</h2>
            <p className="text-foreground/60 mt-1">
              Active compatible requests from other users for your blood type ({donorBloodType}).
            </p>
          </div>

          {!hasDonorRequests ? (
            <Card className="border-border">
              <CardContent className="pt-10 pb-10 text-center">
                <Droplet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No active compatible requests</h3>
                <p className="text-foreground/60">
                  There are currently no active blood requests matching your blood type.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {donorRequests.map((request) => {
                const quantity = getRequestQuantity(request);
                const matchedCount = request.matchedDonors?.length ?? 0;
                const timeWindow = formatTimeWindow(request);
                const isOffering = offeringId === request.id;

                const nextEligibleDate =
                  getNextEligibleDonationDate(profile);

                const donorUnavailable =
                  Boolean(nextEligibleDate) &&
                  nextEligibleDate!.getTime() > Date.now();

                return (
                  <Card
                    key={request.id}
                    className="border-border overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    <CardHeader>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <CardTitle className="text-lg">Blood Request</CardTitle>
                            <Badge className="bg-primary/20 text-primary border-primary/30">
                              {request.bloodType}
                            </Badge>
                          </div>
                          <CardDescription>
                            Request from {recipientNames[request.recipientId] || 'Unknown User'}
                          </CardDescription>
                        </div>

                        <Badge className={statusColors[request.status]}>
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-3 text-foreground/70">
                          <Droplet className="w-4 h-4 text-primary flex-shrink-0" />
                          <span>
                            <span className="font-medium text-foreground">{quantity}</span>{' '}
                            unit{quantity !== 1 ? 's' : ''} needed
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-foreground/70">
                          <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
                          <span>
                            Needed by{' '}
                            <span className="font-medium text-foreground">
                              {formatDate(request.requiredDate)}
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-foreground/70">
                          <Clock className="w-4 h-4 text-primary flex-shrink-0" />
                          <span>
                            Time:{' '}
                            <span className="font-medium text-foreground">
                              {timeWindow || 'Not specified'}
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-foreground/70">
                          <AlertCircle className="w-4 h-4 text-primary flex-shrink-0" />
                          <Badge className={urgencyColors[request.urgency]}>
                            {request.urgency.charAt(0).toUpperCase() + request.urgency.slice(1)} Priority
                          </Badge>
                        </div>
                      </div>

                      {matchedCount > 0 && (
                        <div className="text-sm text-foreground/70">
                          {matchedCount} donor{matchedCount !== 1 ? 's' : ''} already matched.
                        </div>
                      )}

                      <div className="pt-4 border-t border-border flex flex-col sm:flex-row gap-3">
                        <Button variant="outline" className="flex-1" asChild>
                          <Link href={`/dashboard/requests/${request.id}`}>
                            View Request Details
                          </Link>
                        </Button>

                        <Button
                          className={`flex-1 ${
                            donorUnavailable
                              ? '!bg-pink-100 !text-pink-400 !border-pink-200 hover:!bg-pink-100'
                              : 'bg-primary text-primary-foreground hover:bg-primary/90'
                          }`}
                          onClick={() => handleOfferBlood(request)}
                          disabled={
                            Boolean(offeringId) ||
                            quantity <= 0 ||
                            (Boolean(activeDonationId) && !donorUnavailable)
                          }
                        >
                          {isOffering
                            ? 'Offering...'
                            : donorUnavailable
                              ? 'Currently Unavailable'
                              : activeDonationId
                                ? 'Donation Already Active'
                                : 'Offer Blood'}
                        </Button>
                      </div>

                      {donorUnavailable ? (
                        <p className="text-xs text-muted-foreground">
                          You are currently in the donation waiting period.
                          Click <strong>Currently Unavailable</strong> to see
                          the date you become eligible again.
                        </p>
                      ) : activeDonationId ? (
                        <p className="text-xs text-muted-foreground">
                          Complete or cancel your current donation from{' '}
                          <Link
                            href="/dashboard/donations"
                            className="underline font-medium"
                          >
                            My Donations
                          </Link>{' '}
                          before offering again.
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* User may be a normal recipient with no donor profile, but they can still create requests. */}
      {!donorBloodType && !hasOwnRequests && profile && (
        <Card className="border-border">
          <CardContent className="py-8 text-center">
            <p className="text-foreground/60">
              You can create a blood request at any time. Your account role does not prevent you
              from requesting blood when you need it.
            </p>
          </CardContent>
        </Card>
      )}

      {donationUnavailableModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => {
            setDonationUnavailableModalOpen(false);
            setDonationUnavailableUntil(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="donation-unavailable-title"
            className="w-full max-w-md rounded-xl border bg-background p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-primary" />
              </div>

              <div className="flex-1">
                <h2
                  id="donation-unavailable-title"
                  className="text-lg font-semibold"
                >
                  You are currently unavailable for blood donation
                </h2>

                <p className="text-sm text-muted-foreground mt-2 leading-6">
                  You recently donated blood and are currently in the required
                  waiting period.
                </p>

                {donationUnavailableUntil ? (
                  <p className="text-sm text-muted-foreground mt-2 leading-6">
                    You will be eligible to donate again on{' '}
                    <strong className="text-foreground">
                      {formatDate(donationUnavailableUntil)}
                    </strong>
                    .
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2 leading-6">
                    You are still within the required waiting period.
                    Please check your donation history for your eligibility date.
                  </p>
                )}

                <p className="text-sm text-muted-foreground mt-2">
                  You can use the Offer Blood option again after this date.
                </p>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <Button
                type="button"
                onClick={() => {
            setDonationUnavailableModalOpen(false);
            setDonationUnavailableUntil(null);
          }}
              >
                Understood
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
