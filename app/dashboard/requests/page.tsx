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

type RequestWithScheduling = BloodRequest & {
  requiredTimeStart?: string;
  requiredTimeEnd?: string;
  location?: {
    facilityName?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
};

import {
  Droplet,
  Calendar,
  AlertCircle,
  Plus,
  Clock,
  Edit,
  List,
  Heart,
  MapPin,
} from 'lucide-react';

import { offerBloodDonation } from '@/lib/services/donationService';
import { isUserEligibleToDonate } from '@/lib/services/userService';
import { toast } from 'sonner';

import {
  getCompatibleRecipients,
  BloodType,
  BLOOD_TYPES,
} from '@/lib/bloodCompatibility';

const urgencyColors: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  medium:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  high:
    'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  critical:
    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

const statusColors: Record<string, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  matched:
    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  completed:
    'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
  cancelled:
    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

type DonorEligibilityProfile = UserProfile & {
  nextEligibleDonationDate?: string | Date | null;
  nextDonationDate?: string | Date | null;
  eligibleFrom?: string | Date | null;
  lastDonationDate?: string | Date | null;
};

function isValidBloodType(value: unknown): value is BloodType {
  return (
    typeof value === 'string' &&
    BLOOD_TYPES.includes(value as BloodType)
  );
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

    if (Number.isNaN(date.getTime())) {
      return 'Invalid date';
    }

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

  const nextEligibleDate = new Date(lastDonationDate);

  nextEligibleDate.setMonth(
    nextEligibleDate.getMonth() + 3
  );

  return nextEligibleDate;
}

function getRequestQuantity(
  request: RequestWithScheduling
): number {
  return Math.max(
    0,
    request.quantity ?? request.unitsNeeded ?? 0
  );
}

function isRequestExpired(
  request: RequestWithScheduling
): boolean {
  if (!request.requiredDate) return false;

  const requiredDate = new Date(
    `${request.requiredDate}T23:59:59`
  );

  if (Number.isNaN(requiredDate.getTime())) {
    return false;
  }

  return requiredDate.getTime() < Date.now();
}

function formatTimeWindow(
  request: RequestWithScheduling
): string | null {
  if (
    !request.requiredTimeStart &&
    !request.requiredTimeEnd
  ) {
    return null;
  }

  if (
    request.requiredTimeStart &&
    request.requiredTimeEnd
  ) {
    return `${request.requiredTimeStart} – ${request.requiredTimeEnd}`;
  }

  return (
    request.requiredTimeStart ||
    request.requiredTimeEnd ||
    null
  );
}

function getRequestLocation(request: RequestWithScheduling): string {
  const location = request.location;

  if (!location || typeof location !== 'object') {
    return 'Hospital / Blood Bank location not provided';
  }

  const parts = [
    location.facilityName,
    location.address,
    location.city,
    location.state,
    location.pincode,
  ].filter(Boolean);

  return parts.length > 0
    ? parts.join(', ')
    : 'Hospital / Blood Bank location not provided';
}

function getCreatedAtTime(value: any): number {
  try {
    if (value?.toDate) {
      return value.toDate().getTime();
    }

    const time = new Date(value).getTime();

    return Number.isNaN(time) ? 0 : time;
  } catch {
    return 0;
  }
}

export default function RequestsPage() {
  const { user } = useAuth();

  const [ownRequests, setOwnRequests] = useState<
    RequestWithScheduling[]
  >([]);

  const [donorRequests, setDonorRequests] = useState<
    RequestWithScheduling[]
  >([]);

  const [allRequests, setAllRequests] = useState<
    RequestWithScheduling[]
  >([]);

  const [recipientNames, setRecipientNames] = useState<
    Record<string, string>
  >({});

  const [loading, setLoading] = useState(true);

  const [offeringId, setOfferingId] = useState<string | null>(
    null
  );

  const [donorBloodType, setDonorBloodType] =
    useState<BloodType | null>(null);

  const [activeDonationId, setActiveDonationId] =
    useState<string | null>(null);

  const [profile, setProfile] =
    useState<DonorEligibilityProfile | null>(null);

  const [
    donationUnavailableUntil,
    setDonationUnavailableUntil,
  ] = useState<Date | null>(null);

  const [
    donationUnavailableModalOpen,
    setDonationUnavailableModalOpen,
  ] = useState(false);

  /* -------------------------------------------------------
     MAIN TABS
  ------------------------------------------------------- */

  const [activeTab, setActiveTab] = useState<
    'my' | 'help' | 'all'
  >('my');

  /* -------------------------------------------------------
     MY REQUEST SUB-TABS
  ------------------------------------------------------- */

  const [myRequestTab, setMyRequestTab] = useState<
    'active' | 'expired' | 'fulfilled'
  >('active');

  /* -------------------------------------------------------
     LOAD REQUESTS
  ------------------------------------------------------- */

  const loadRequests = async () => {
    if (!user) {
      setOwnRequests([]);
      setDonorRequests([]);
      setAllRequests([]);
      setRecipientNames({});
      setProfile(null);
      setDonorBloodType(null);
      setActiveDonationId(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      /* ---------------------------------------------
         LOAD USER PROFILE
      --------------------------------------------- */

      const userSnap = await getDoc(
        doc(db, 'users', user.uid)
      );

      if (!userSnap.exists()) {
        toast.error(
          'Your user profile could not be found.'
        );

        setOwnRequests([]);
        setDonorRequests([]);
        setAllRequests([]);
        setLoading(false);
        return;
      }

      const userData =
        userSnap.data() as DonorEligibilityProfile;

      setProfile(userData);

      setActiveDonationId(
        typeof userData.activeDonationId === 'string' &&
          userData.activeDonationId.length > 0
          ? userData.activeDonationId
          : null
      );

      const requestsRef = collection(
        db,
        'bloodRequests'
      );

      /* ---------------------------------------------
         MY REQUESTS
      --------------------------------------------- */

      const ownSnapshot = await getDocs(
        query(
          requestsRef,
          where('recipientId', '==', user.uid)
        )
      );

      const own = ownSnapshot.docs.map(
        (requestDoc) => ({
          id: requestDoc.id,
          ...requestDoc.data(),
        })
      ) as RequestWithScheduling[];

      own.sort(
        (a, b) =>
          getCreatedAtTime(b.createdAt) -
          getCreatedAtTime(a.createdAt)
      );

      setOwnRequests(own);

      /* ---------------------------------------------
         ALL OPEN REQUESTS
      --------------------------------------------- */

      const allSnapshot = await getDocs(
        query(
          requestsRef,
          where('status', '==', 'open')
        )
      );

      const allOpenRequests = allSnapshot.docs
        .map((requestDoc) => ({
          id: requestDoc.id,
          ...requestDoc.data(),
        }))
        .map(
          (request) =>
            request as RequestWithScheduling
        )
        .filter(
          (request) =>
            getRequestQuantity(request) > 0 &&
            !isRequestExpired(request)
        );

      allOpenRequests.sort((a, b) => {
        const urgencyRank: Record<string, number> = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
        };

        const urgencyDifference =
          (urgencyRank[b.urgency] ?? 0) -
          (urgencyRank[a.urgency] ?? 0);

        if (urgencyDifference !== 0) {
          return urgencyDifference;
        }

        return (
          getCreatedAtTime(b.createdAt) -
          getCreatedAtTime(a.createdAt)
        );
      });

      setAllRequests(allOpenRequests);

      /* ---------------------------------------------
         COMPATIBLE DONOR REQUESTS
      --------------------------------------------- */

      let compatible: RequestWithScheduling[] = [];

      setDonorBloodType(null);

      if (
        userData.role === 'donor' &&
        isValidBloodType(userData.bloodType)
      ) {
        setDonorBloodType(userData.bloodType);

        const compatibleBloodTypes =
          getCompatibleRecipients(
            userData.bloodType
          );

        const donorSnapshot = await getDocs(
          query(
            requestsRef,
            where('status', '==', 'open'),
            where(
              'bloodType',
              'in',
              compatibleBloodTypes
            )
          )
        );

        compatible = donorSnapshot.docs
          .map((requestDoc) => ({
            id: requestDoc.id,
            ...requestDoc.data(),
          }))
          .map(
            (request) =>
              request as RequestWithScheduling
          )
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
            (urgencyRank[b.urgency] ?? 0) -
            (urgencyRank[a.urgency] ?? 0);

          if (urgencyDifference !== 0) {
            return urgencyDifference;
          }

          return (
            getCreatedAtTime(b.createdAt) -
            getCreatedAtTime(a.createdAt)
          );
        });
      }

      setDonorRequests(compatible);

      /* ---------------------------------------------
         LOAD RECIPIENT NAMES
      --------------------------------------------- */

      const names: Record<string, string> = {};

      const requestsForNames = [
        ...compatible,
        ...allOpenRequests,
      ];

      for (const request of requestsForNames) {
        if (
          !request.recipientId ||
          names[request.recipientId]
        ) {
          continue;
        }

        try {
          const recipientSnap = await getDoc(
            doc(
              db,
              'users',
              request.recipientId
            )
          );

          names[request.recipientId] =
            recipientSnap.exists()
              ? (
                  recipientSnap.data() as UserProfile
                ).name || 'Unknown User'
              : 'Unknown User';
        } catch {
          names[request.recipientId] =
            'Unknown User';
        }
      }

      setRecipientNames(names);
    } catch (error) {
      console.error(
        'Error fetching blood requests:',
        error
      );

      toast.error(
        'Failed to load blood requests.'
      );

      setOwnRequests([]);
      setDonorRequests([]);
      setAllRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [user]);

  /* -------------------------------------------------------
     CLASSIFY MY REQUESTS
  ------------------------------------------------------- */

  const activeOwnRequests = useMemo(
    () =>
      ownRequests.filter((request) => {
        const quantity =
          getRequestQuantity(request);

        return (
          !isRequestExpired(request) &&
          quantity > 0 &&
          request.status === 'open'
        );
      }),
    [ownRequests]
  );

  const expiredOwnRequests = useMemo(
    () =>
      ownRequests.filter((request) => {
        const quantity =
          getRequestQuantity(request);

        return (
          isRequestExpired(request) &&
          quantity > 0 &&
          request.status !== 'cancelled'
        );
      }),
    [ownRequests]
  );

  const fulfilledOwnRequests = useMemo(
    () =>
      ownRequests.filter((request) => {
        const quantity =
          getRequestQuantity(request);

        return (
          quantity <= 0 ||
          request.status === 'matched' ||
          request.status === 'completed'
        );
      }),
    [ownRequests]
  );

  const displayedOwnRequests =
    myRequestTab === 'active'
      ? activeOwnRequests
      : myRequestTab === 'expired'
        ? expiredOwnRequests
        : fulfilledOwnRequests;

  /* -------------------------------------------------------
     OFFER BLOOD
  ------------------------------------------------------- */

  const handleOfferBlood = async (
    request: RequestWithScheduling
  ) => {
    try {
      if (!user) {
        toast.error(
          'Please sign in to offer blood.'
        );
        return;
      }

      if (request.recipientId === user.uid) {
        toast.error(
          'You cannot offer blood to your own request.'
        );
        return;
      }

      if (offeringId) return;

      if (isRequestExpired(request)) {
        toast.error(
          'This blood request has expired.'
        );
        return;
      }

      let eligible = false;

      try {
        eligible =
          await isUserEligibleToDonate(
            user.uid
          );
      } catch {
        toast.error(
          'Unable to verify your donation eligibility. Please try again.'
        );
        return;
      }

      if (!eligible) {
        let nextEligibleDate =
          getNextEligibleDonationDate(profile);

        if (!nextEligibleDate) {
          try {
            const donationSnapshot =
              await getDocs(
                query(
                  collection(db, 'donations'),
                  where(
                    'donorId',
                    '==',
                    user.uid
                  )
                )
              );

            const completedDates =
              donationSnapshot.docs
                .map(
                  (donationDoc) =>
                    donationDoc.data()
                )
                .filter(
                  (donation) =>
                    donation.status ===
                    'completed'
                )
                .map((donation) =>
                  toValidDate(
                    donation.completedAt ??
                      donation.donationDate ??
                      donation.createdAt
                  )
                )
                .filter(
                  (
                    date
                  ): date is Date =>
                    Boolean(date)
                )
                .sort(
                  (a, b) =>
                    b.getTime() -
                    a.getTime()
                );

            if (completedDates[0]) {
              nextEligibleDate =
                new Date(
                  completedDates[0]
                );

              nextEligibleDate.setMonth(
                nextEligibleDate.getMonth() +
                  3
              );
            }
          } catch {
            // Eligibility result remains authoritative.
          }
        }

        setDonationUnavailableUntil(
          nextEligibleDate
        );

        setDonationUnavailableModalOpen(
          true
        );

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
        const result =
          await offerBloodDonation({
            donorId: user.uid,
            requestId: request.id,
            units: 1,
            date: new Date(),
          });

        setActiveDonationId(
          result.donationId
        );

        toast.success(
          'Blood offer submitted successfully!'
        );

        await loadRequests();
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : '';

        if (
          message
            .toLowerCase()
            .includes(
              'currently unavailable for blood donation'
            )
        ) {
          let nextEligibleDate =
            getNextEligibleDonationDate(
              profile
            );

          if (!nextEligibleDate) {
            try {
              const donationSnapshot =
                await getDocs(
                  query(
                    collection(
                      db,
                      'donations'
                    ),
                    where(
                      'donorId',
                      '==',
                      user.uid
                    )
                  )
                );

              const completedDates =
                donationSnapshot.docs
                  .map(
                    (donationDoc) =>
                      donationDoc.data()
                  )
                  .filter(
                    (donation) =>
                      donation.status ===
                      'completed'
                  )
                  .map((donation) =>
                    toValidDate(
                      donation.completedAt ??
                        donation.donationDate ??
                        donation.createdAt
                    )
                  )
                  .filter(
                    (
                      date
                    ): date is Date =>
                      Boolean(date)
                  )
                  .sort(
                    (a, b) =>
                      b.getTime() -
                      a.getTime()
                  );

              if (completedDates[0]) {
                nextEligibleDate =
                  new Date(
                    completedDates[0]
                  );

                nextEligibleDate.setMonth(
                  nextEligibleDate.getMonth() +
                    3
                );
              }
            } catch {
              // Keep the popup.
            }
          }

          setDonationUnavailableUntil(
            nextEligibleDate
          );

          setDonationUnavailableModalOpen(
            true
          );

          return;
        }

        toast.error(
          message ||
            'Failed to offer blood. Please try again.'
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

  /* -------------------------------------------------------
     LOADING
  ------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />

          <p className="text-foreground">
            Loading blood requests...
          </p>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------
     NOT SIGNED IN
  ------------------------------------------------------- */

  if (!user) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <Droplet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />

            <h3 className="text-lg font-semibold mb-2">
              Please sign in
            </h3>

            <p className="text-foreground/60">
              You need to sign in to view blood
              requests.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* -------------------------------------------------------
     REQUEST CARD FOR MY REQUESTS
  ------------------------------------------------------- */

  const renderOwnRequest = (
    request: RequestWithScheduling
  ) => {
    const quantity =
      getRequestQuantity(request);

    const expired =
      isRequestExpired(request);

    const timeWindow =
      formatTimeWindow(request);

    const matchedCount =
      request.matchedDonors?.length ?? 0;

    const fulfilled =
      quantity <= 0 ||
      request.status === 'matched' ||
      request.status === 'completed';

    return (
      <Card
        key={request.id}
        className="border-border overflow-hidden hover:shadow-lg transition-shadow"
      >
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <CardTitle className="text-lg">
                  Your Blood Request
                </CardTitle>

                <Badge className="bg-primary/20 text-primary border-primary/30">
                  {request.bloodType}
                </Badge>
              </div>

              <CardDescription>
                {request.reason}
              </CardDescription>
            </div>

            <Badge
              className={
                fulfilled
                  ? statusColors.matched
                  : expired
                    ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300'
                    : statusColors[
                        request.status
                      ] ||
                      statusColors.open
              }
            >
              {fulfilled
                ? 'Fulfilled'
                : expired
                  ? 'Expired'
                  : request.status
                      .charAt(0)
                      .toUpperCase() +
                    request.status.slice(1)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-3 text-foreground/70">
              <Droplet className="w-4 h-4 text-primary flex-shrink-0" />

              <span>
                <span className="font-medium text-foreground">
                  {quantity}
                </span>{' '}
                unit
                {quantity !== 1
                  ? 's'
                  : ''}{' '}
                remaining
              </span>
            </div>

            <div className="flex items-center gap-3 text-foreground/70">
              <Calendar className="w-4 h-4 text-primary flex-shrink-0" />

              <span>
                Needed by{' '}
                <span className="font-medium text-foreground">
                  {formatDate(
                    request.requiredDate
                  )}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-3 text-foreground/70">
              <Clock className="w-4 h-4 text-primary flex-shrink-0" />

              <span>
                Time:{' '}
                <span className="font-medium text-foreground">
                  {timeWindow ||
                    'Not specified'}
                </span>
              </span>
            </div>

            <div className="flex items-start gap-3 text-foreground/70">
              <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />

              <span>
                <span className="font-medium text-foreground">
                  Donation Location:
                </span>{' '}
                {getRequestLocation(request)}
              </span>
            </div>
          </div>

          {expired && !fulfilled && (
            <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-3 text-sm text-orange-800 dark:text-orange-300">
              This request has passed its
              required date. You can edit the
              request and update the required
              date if you still need blood.
            </div>
          )}

          {!expired &&
            request.status ===
              'open' &&
            quantity > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm text-foreground/70">
                {matchedCount > 0 ? (
                  <>
                    <span className="font-medium text-foreground">
                      {matchedCount}{' '}
                      donor
                      {matchedCount !==
                      1
                        ? 's'
                        : ''}{' '}
                      have offered to
                      help.
                    </span>{' '}
                    {quantity}{' '}
                    {quantity === 1
                      ? 'unit remains'
                      : 'units remain'}{' '}
                    to fulfill this
                    request.
                  </>
                ) : (
                  <>
                    Your request is open
                    and waiting for
                    compatible donors.
                  </>
                )}
              </div>
            )}

          {fulfilled && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-300">
              This request has been
              fulfilled. Open the request
              details to view the donation
              information.
            </div>
          )}

          <div className="pt-4 border-t border-border flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              className="flex-1"
              asChild
            >
              <Link
                href={`/dashboard/requests/${request.id}`}
              >
                View Request Details
              </Link>
            </Button>

            {!fulfilled && (
              <Button
                variant="outline"
                className="flex-1"
                asChild
              >
                <Link
                  href={`/dashboard/requests/${request.id}/edit`}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Request
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  /* -------------------------------------------------------
     REQUEST CARD FOR DONOR / ALL REQUESTS
  ------------------------------------------------------- */

  const renderAvailableRequest = (
    request: RequestWithScheduling,
    showCompatibility = false
  ) => {
    const quantity =
      getRequestQuantity(request);

    const matchedCount =
      request.matchedDonors?.length ?? 0;

    const timeWindow =
      formatTimeWindow(request);

    const isOffering =
      offeringId === request.id;

    const nextEligibleDate =
      getNextEligibleDonationDate(profile);

    const donorUnavailable =
      Boolean(nextEligibleDate) &&
      nextEligibleDate!.getTime() >
        Date.now();

    const compatible =
      donorBloodType &&
      isValidBloodType(request.bloodType)
        ? getCompatibleRecipients(
            donorBloodType
          ).includes(
            request.bloodType
          )
        : false;

    return (
      <Card
        key={request.id}
        className="border-border overflow-hidden hover:shadow-lg transition-shadow"
      >
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <CardTitle className="text-lg">
                  Blood Request
                </CardTitle>

                <Badge className="bg-primary/20 text-primary border-primary/30">
                  {request.bloodType}
                </Badge>

                {showCompatibility &&
                  compatible && (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                      Compatible
                    </Badge>
                  )}
              </div>

              <CardDescription>
                Request from{' '}
                {recipientNames[
                  request.recipientId
                ] ||
                  'Unknown User'}
              </CardDescription>
            </div>

            <Badge
              className={
                urgencyColors[
                  request.urgency
                ] ||
                urgencyColors.medium
              }
            >
              {request.urgency
                ? request.urgency
                    .charAt(0)
                    .toUpperCase() +
                  request.urgency.slice(
                    1
                  )
                : 'Normal'}{' '}
              Priority
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-3 text-foreground/70">
              <Droplet className="w-4 h-4 text-primary flex-shrink-0" />

              <span>
                <span className="font-medium text-foreground">
                  {quantity}
                </span>{' '}
                unit
                {quantity !== 1
                  ? 's'
                  : ''}{' '}
                needed
              </span>
            </div>

            <div className="flex items-center gap-3 text-foreground/70">
              <Calendar className="w-4 h-4 text-primary flex-shrink-0" />

              <span>
                Needed by{' '}
                <span className="font-medium text-foreground">
                  {formatDate(
                    request.requiredDate
                  )}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-3 text-foreground/70">
              <Clock className="w-4 h-4 text-primary flex-shrink-0" />

              <span>
                Time:{' '}
                <span className="font-medium text-foreground">
                  {timeWindow ||
                    'Not specified'}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-3 text-foreground/70">
              <AlertCircle className="w-4 h-4 text-primary flex-shrink-0" />

              <Badge
                className={
                  urgencyColors[
                    request.urgency
                  ] ||
                  urgencyColors.medium
                }
              >
                {request.urgency
                  ? request.urgency
                      .charAt(0)
                      .toUpperCase() +
                    request.urgency.slice(
                      1
                    )
                  : 'Normal'}{' '}
                Priority
              </Badge>
            </div>
          </div>

          {matchedCount > 0 && (
            <div className="text-sm text-foreground/70">
              {matchedCount} donor
              {matchedCount !== 1
                ? 's'
                : ''}{' '}
              already matched.
            </div>
          )}

          <div className="pt-4 border-t border-border flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              className="flex-1"
              asChild
            >
              <Link
                href={`/dashboard/requests/${request.id}`}
              >
                View Request Details
              </Link>
            </Button>

            {donorBloodType &&
              request.recipientId !==
                user.uid &&
              compatible && (
                <Button
                  className={`flex-1 ${
                    donorUnavailable
                      ? '!bg-pink-100 !text-pink-400 !border-pink-200 hover:!bg-pink-100'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                  onClick={() =>
                    handleOfferBlood(
                      request
                    )
                  }
                  disabled={
                    Boolean(
                      offeringId
                    ) ||
                    quantity <= 0 ||
                    (Boolean(
                      activeDonationId
                    ) &&
                      !donorUnavailable)
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
              )}

            {donorBloodType &&
              !compatible && (
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled
                >
                  Not Compatible
                </Button>
              )}
          </div>

          {donorUnavailable &&
            compatible && (
              <p className="text-xs text-muted-foreground">
                You are currently in the
                donation waiting period.
                Click{' '}
                <strong>
                  Currently Unavailable
                </strong>{' '}
                to see the date you become
                eligible again.
              </p>
            )}

          {activeDonationId &&
            compatible &&
            !donorUnavailable && (
              <p className="text-xs text-muted-foreground">
                Complete or cancel your
                current donation from{' '}
                <Link
                  href="/dashboard/donations"
                  className="underline font-medium"
                >
                  My Donations
                </Link>{' '}
                before offering again.
              </p>
            )}
        </CardContent>
      </Card>
    );
  };

  /* -------------------------------------------------------
     PAGE
  ------------------------------------------------------- */

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">

      {/* HEADER */}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Blood Requests
          </h1>

          <p className="text-foreground/60 mt-2">
            Manage your requests and find
            blood requests you can help with.
          </p>
        </div>

        <Button
          asChild
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
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
            getNextEligibleDonationDate(
              profile
            );

          const currentlyUnavailable =
            donationUnavailableModalOpen ||
            (Boolean(nextEligibleDate) &&
              nextEligibleDate!.getTime() >
                Date.now());

          if (
            !currentlyUnavailable &&
            !activeDonationId
          ) {
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
                          You are currently
                          unavailable for blood
                          donation
                        </p>

                        <p className="text-sm text-amber-800 dark:text-amber-400 mt-1">
                          You recently donated
                          blood and are in the
                          required waiting period.
                        </p>

                        <p className="text-sm text-amber-800 dark:text-amber-400 mt-1">
                          You can offer blood
                          again on{' '}
                          <strong>
                            {formatDate(
                              nextEligibleDate
                            )}
                          </strong>
                          .
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-blue-900 dark:text-blue-300">
                          You have an active
                          donation
                        </p>

                        <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                          Complete or cancel your
                          current donation before
                          offering blood to another
                          request.
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

      {/* =====================================================
          MAIN THREE TABS
      ===================================================== */}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* MY REQUESTS */}

        <button
          type="button"
          onClick={() => setActiveTab('my')}
          className={`rounded-xl border p-5 text-left transition-all ${
            activeTab === 'my'
              ? 'border-primary bg-primary/10 shadow-sm'
              : 'border-border bg-background hover:bg-muted/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                activeTab === 'my'
                  ? 'bg-primary/15'
                  : 'bg-muted'
              }`}
            >
              <Droplet
                className={`w-5 h-5 ${
                  activeTab === 'my'
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}
              />
            </div>

            <div>
              <p className="font-semibold">
                My Requests
              </p>

              <p className="text-sm text-muted-foreground">
                Requests created by you
              </p>
            </div>
          </div>
        </button>

        {/* REQUESTS I CAN HELP WITH */}

        <button
          type="button"
          onClick={() =>
            setActiveTab('help')
          }
          className={`rounded-xl border p-5 text-left transition-all ${
            activeTab === 'help'
              ? 'border-primary bg-primary/10 shadow-sm'
              : 'border-border bg-background hover:bg-muted/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                activeTab === 'help'
                  ? 'bg-primary/15'
                  : 'bg-muted'
              }`}
            >
              <Heart
                className={`w-5 h-5 ${
                  activeTab === 'help'
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}
              />
            </div>

            <div>
              <p className="font-semibold">
                Requests I Can Help With
              </p>

              <p className="text-sm text-muted-foreground">
                Compatible requests for you
              </p>
            </div>
          </div>
        </button>

        {/* ALL REQUESTS */}

        <button
          type="button"
          onClick={() =>
            setActiveTab('all')
          }
          className={`rounded-xl border p-5 text-left transition-all ${
            activeTab === 'all'
              ? 'border-primary bg-primary/10 shadow-sm'
              : 'border-border bg-background hover:bg-muted/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                activeTab === 'all'
                  ? 'bg-primary/15'
                  : 'bg-muted'
              }`}
            >
              <List
                className={`w-5 h-5 ${
                  activeTab === 'all'
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}
              />
            </div>

            <div>
              <p className="font-semibold">
                All Requests
              </p>

              <p className="text-sm text-muted-foreground">
                Browse active blood requests
              </p>
            </div>
          </div>
        </button>

      </div>

      {/* =====================================================
          MY REQUESTS
      ===================================================== */}

      {activeTab === 'my' && (
        <section className="space-y-5">

          <div>
            <h2 className="text-2xl font-semibold">
              My Requests
            </h2>

            <p className="text-foreground/60 mt-1">
              Manage blood requests created by
              you.
            </p>
          </div>

          {/* SUB TABS */}

          <div className="flex flex-wrap gap-2 border-b border-border pb-3">

            <button
              type="button"
              onClick={() =>
                setMyRequestTab('active')
              }
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                myRequestTab === 'active'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground/70 hover:bg-muted/80'
              }`}
            >
              Active
              <span className="ml-2 opacity-70">
                {activeOwnRequests.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setMyRequestTab('expired')
              }
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                myRequestTab === 'expired'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground/70 hover:bg-muted/80'
              }`}
            >
              Expired
              <span className="ml-2 opacity-70">
                {expiredOwnRequests.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setMyRequestTab('fulfilled')
              }
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                myRequestTab === 'fulfilled'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground/70 hover:bg-muted/80'
              }`}
            >
              Fulfilled
              <span className="ml-2 opacity-70">
                {fulfilledOwnRequests.length}
              </span>
            </button>

          </div>

          {/* REQUEST LIST */}

          {displayedOwnRequests.length === 0 ? (
            <Card>
              <CardContent className="pt-10 pb-10 text-center">

                <Droplet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />

                <h3 className="text-lg font-semibold mb-2">
                  {myRequestTab === 'active'
                    ? 'No active requests'
                    : myRequestTab ===
                        'expired'
                      ? 'No expired requests'
                      : 'No fulfilled requests'}
                </h3>

                <p className="text-foreground/60 mb-6">
                  {myRequestTab === 'active'
                    ? 'You do not currently have any active blood requests.'
                    : myRequestTab ===
                        'expired'
                      ? 'You do not have any expired blood requests.'
                      : 'You do not have any fulfilled blood requests yet.'}
                </p>

                {myRequestTab ===
                  'active' && (
                  <Button asChild>
                    <Link href="/dashboard/requests/new">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Request
                    </Link>
                  </Button>
                )}

              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {displayedOwnRequests.map(
                renderOwnRequest
              )}
            </div>
          )}

        </section>
      )}

      {/* =====================================================
          REQUESTS I CAN HELP WITH
      ===================================================== */}

      {activeTab === 'help' && (
        <section className="space-y-5">

          <div>
            <h2 className="text-2xl font-semibold">
              Requests I Can Help With
            </h2>

            <p className="text-foreground/60 mt-1">
              Active blood requests compatible
              with your blood type
              {donorBloodType
                ? ` (${donorBloodType})`
                : ''}.
            </p>
          </div>

          {!donorBloodType ? (
            <Card>
              <CardContent className="pt-10 pb-10 text-center">

                <Heart className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />

                <h3 className="text-lg font-semibold mb-2">
                  Donor profile required
                </h3>

                <p className="text-foreground/60">
                  Your account is not currently
                  configured as a donor, so
                  compatible donation requests
                  cannot be shown.
                </p>

              </CardContent>
            </Card>
          ) : donorRequests.length === 0 ? (
            <Card>
              <CardContent className="pt-10 pb-10 text-center">

                <Droplet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />

                <h3 className="text-lg font-semibold mb-2">
                  No compatible requests
                </h3>

                <p className="text-foreground/60">
                  There are currently no active
                  blood requests matching your
                  blood type.
                </p>

              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {donorRequests.map(
                (request) =>
                  renderAvailableRequest(
                    request,
                    true
                  )
              )}
            </div>
          )}

        </section>
      )}

      {/* =====================================================
          ALL REQUESTS
      ===================================================== */}

      {activeTab === 'all' && (
        <section className="space-y-5">

          <div>
            <h2 className="text-2xl font-semibold">
              All Active Requests
            </h2>

            <p className="text-foreground/60 mt-1">
              Browse all currently active blood
              requests.
            </p>
          </div>

          {allRequests.length === 0 ? (
            <Card>
              <CardContent className="pt-10 pb-10 text-center">

                <List className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />

                <h3 className="text-lg font-semibold mb-2">
                  No active requests
                </h3>

                <p className="text-foreground/60">
                  There are currently no active
                  blood requests.
                </p>

              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {allRequests
                .filter(
                  (request) =>
                    request.recipientId !==
                    user.uid
                )
                .map((request) =>
                  renderAvailableRequest(
                    request,
                    true
                  )
                )}
            </div>
          )}

        </section>
      )}

      {/* =====================================================
          DONATION UNAVAILABLE MODAL
      ===================================================== */}

      {donationUnavailableModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => {
            setDonationUnavailableModalOpen(
              false
            );
            setDonationUnavailableUntil(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="donation-unavailable-title"
            className="w-full max-w-md rounded-xl border bg-background p-6 shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
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
                  You are currently
                  unavailable for blood
                  donation
                </h2>

                <p className="text-sm text-muted-foreground mt-2 leading-6">
                  You recently donated blood
                  and are currently in the
                  required waiting period.
                </p>

                {donationUnavailableUntil ? (
                  <p className="text-sm text-muted-foreground mt-2 leading-6">
                    You will be eligible to
                    donate again on{' '}
                    <strong className="text-foreground">
                      {formatDate(
                        donationUnavailableUntil
                      )}
                    </strong>
                    .
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2 leading-6">
                    You are still within the
                    required waiting period.
                    Please check your donation
                    history for your eligibility
                    date.
                  </p>
                )}

                <p className="text-sm text-muted-foreground mt-2">
                  You can use the Offer Blood
                  option again after this date.
                </p>

              </div>
            </div>

            <div className="flex justify-end mt-6">
              <Button
                type="button"
                onClick={() => {
                  setDonationUnavailableModalOpen(
                    false
                  );
                  setDonationUnavailableUntil(
                    null
                  );
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