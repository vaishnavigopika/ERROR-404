'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
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

import {
  Calendar,
  CheckCircle2,
  Clock,
  Droplet,
  MapPin,
  XCircle,
  User,
  AlertCircle,
  MessageCircle,
} from 'lucide-react';

import Link from 'next/link';

import {
  cancelDonation,
  completeDonation,
  subscribeToUserDonations,
} from '@/lib/services/donationService';

import { toast } from 'sonner';

import {
  BloodType,
  BLOOD_TYPES,
} from '@/lib/bloodCompatibility';

import {
  DonationRecord,
  UserProfile,
} from '@/lib/types';


// ============================================================
// STATUS COLORS
// ============================================================

const statusColors = {
  offered:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',

  scheduled:
    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',

  completed:
    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',

  cancelled:
    'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
};


// ============================================================
// STATUS LABELS
// ============================================================

const statusLabels = {
  offered: 'Offered',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};


// ============================================================
// BLOOD TYPE VALIDATION
// ============================================================

function isValidBloodType(
  value: unknown
): value is BloodType {
  return (
    typeof value === 'string' &&
    BLOOD_TYPES.includes(
      value as BloodType
    )
  );
}


// ============================================================
// DATE HELPERS
// ============================================================

function toDate(
  value: unknown
): Date | null {

  if (!value) {
    return null;
  }

  try {

    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as any).toDate === 'function'
    ) {
      return (value as any).toDate();
    }

    const date =
      new Date(
        value as string | number | Date
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return null;
    }

    return date;

  } catch {
    return null;
  }
}


function formatDate(
  value: unknown
): string {

  const date =
    toDate(value);

  if (!date) {
    return 'Not specified';
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


function formatDateTime(
  value: unknown
): string {

  const date =
    toDate(value);

  if (!date) {
    return 'Not specified';
  }

  return date.toLocaleString(
    'en-IN',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }
  );
}


// ============================================================
// PAGE
// ============================================================

export default function DonationsPage() {

  const { user } =
    useAuth();

  const router = useRouter();


  const [donations, setDonations] =
    useState<DonationRecord[]>([]);


  const [donorProfile, setDonorProfile] =
    useState<UserProfile | null>(null);


  const [recipientNames, setRecipientNames] =
    useState<Record<string, string>>({});


  const [loading, setLoading] =
    useState(true);


  const [processingId, setProcessingId] =
    useState<string | null>(null);


  // ==========================================================
  // LOAD DONOR PROFILE
  // ==========================================================

  useEffect(() => {

    const loadProfile =
      async () => {

        if (!user) {
          return;
        }

        try {

          const userRef =
            doc(
              db,
              'users',
              user.uid
            );

          const userSnap =
            await getDoc(
              userRef
            );

          if (
            userSnap.exists()
          ) {

            const data =
              userSnap.data() as UserProfile;

            setDonorProfile(
              data
            );
          }

        } catch (error) {

          console.error(
            'Failed to load donor profile:',
            error
          );
        }
      };


    loadProfile();

  }, [user]);


  // ==========================================================
  // SUBSCRIBE TO DONATIONS
  // ==========================================================

  useEffect(() => {

    if (!user) {

      setDonations([]);
      setLoading(false);

      return;
    }


    setLoading(true);


    let unsubscribe:
      (() => void) | null = null;


    try {

      unsubscribe =
        subscribeToUserDonations(
          user.uid,
          (records) => {

            const sorted =
              [...records].sort(
                (a, b) => {

                  const aDate =
                    toDate(
                      a.createdAt
                    )?.getTime() ?? 0;

                  const bDate =
                    toDate(
                      b.createdAt
                    )?.getTime() ?? 0;

                  return (
                    bDate -
                    aDate
                  );
                }
              );

            setDonations(
              sorted
            );

            setLoading(false);
          }
        );

    } catch (error) {

      console.error(
        'Failed to subscribe to donations:',
        error
      );

      toast.error(
        'Failed to load your donations.'
      );

      setLoading(false);
    }


    return () => {

      if (unsubscribe) {
        unsubscribe();
      }
    };

  }, [user]);


  // ==========================================================
  // LOAD RECIPIENT NAMES
  // ==========================================================

  useEffect(() => {

    const loadRecipientNames =
      async () => {

        const names:
          Record<string, string> = {};


        for (
          const donation
          of donations
        ) {

          if (
            !donation.recipientId ||
            names[donation.recipientId]
          ) {
            continue;
          }


          try {

            const recipientRef =
              doc(
                db,
                'users',
                donation.recipientId
              );

            const recipientSnap =
              await getDoc(
                recipientRef
              );


            if (
              recipientSnap.exists()
            ) {

              const recipientData =
                recipientSnap.data() as UserProfile;

              names[
                donation.recipientId
              ] =
                recipientData.name ||
                'Unknown Recipient';

            } else {

              names[
                donation.recipientId
              ] =
                'Unknown Recipient';
            }

          } catch (error) {

            console.error(
              'Failed to load recipient:',
              error
            );

            names[
              donation.recipientId
            ] =
              'Unknown Recipient';
          }
        }


        setRecipientNames(
          names
        );
      };


    if (
      donations.length > 0
    ) {

      loadRecipientNames();
    }

  }, [donations]);


  // ==========================================================
  // SCHEDULING NOTE
  // ==========================================================

  // Donation scheduling is intentionally handled by the recipient/request owner.
  // The donor can view the request and its required date/time, but cannot choose
  // the appointment.


  // ==========================================================
  // OPEN DONATION CHAT
  // ==========================================================

  const openDonationChat = (donation: DonationRecord) => {

    if (!user) {
      toast.error('Please sign in again.');
      return;
    }

    if (!donation.recipientId) {
      toast.error('Recipient information is unavailable for this donation.');
      return;
    }

    if (donation.status === 'cancelled') {
      toast.error('Messaging is unavailable for a cancelled donation.');
      return;
    }

    router.push(`/dashboard/messages?donationId=${encodeURIComponent(donation.id)}`);
  };


  // ==========================================================
  // COMPLETE DONATION
  // ==========================================================

  const handleComplete =
    async (
      donation: DonationRecord
    ) => {

      if (!user) {
        return;
      }


      if (
        donation.status !==
        'scheduled'
      ) {

        toast.error(
          'Only scheduled donations can be completed.'
        );

        return;
      }


      const confirmed =
        window.confirm(
          'Have you completed this blood donation? This will mark the donation as completed and start your 3-month waiting period.'
        );


      if (!confirmed) {
        return;
      }


      setProcessingId(
        donation.id
      );


      try {

        await completeDonation(
          donation.id
        );


        toast.success(
          'Donation completed successfully! Thank you for saving a life.'
        );

      } catch (error: any) {

        console.error(
          'Complete donation failed:',
          error
        );

        toast.error(
          error?.message ||
          'Failed to complete donation.'
        );

      } finally {

        setProcessingId(
          null
        );
      }
    };


  // ==========================================================
  // CANCEL DONATION
  // ==========================================================

  const handleCancel =
    async (
      donation: DonationRecord
    ) => {

      if (!user) {
        return;
      }


      if (
        donation.status !== 'offered' &&
        donation.status !== 'scheduled'
      ) {

        toast.error(
          'This donation cannot be cancelled.'
        );

        return;
      }


      const confirmed =
        window.confirm(
          'Are you sure you want to cancel this donation offer?'
        );


      if (!confirmed) {
        return;
      }


      setProcessingId(
        donation.id
      );


      try {

        await cancelDonation(
          donation.id
        );


        toast.success(
          'Donation cancelled.'
        );

      } catch (error: any) {

        console.error(
          'Cancel donation failed:',
          error
        );

        toast.error(
          error?.message ||
          'Failed to cancel donation.'
        );

      } finally {

        setProcessingId(
          null
        );
      }
    };


  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {

    return (
      <div className="flex items-center justify-center h-screen">

        <div className="text-center">

          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />

          <p className="text-foreground">
            Loading your donations...
          </p>

        </div>

      </div>
    );
  }


  // ==========================================================
  // NOT LOGGED IN
  // ==========================================================

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
              Sign in to view your donation history.
            </p>

          </CardContent>

        </Card>

      </div>
    );
  }

  // ==========================================================
  // ACTIVE DONATIONS
  // ==========================================================

  const activeDonations = donations.filter(
    (donation) =>
      donation.status === 'offered' ||
      donation.status === 'scheduled'
  );

  // ==========================================================
  // MAIN PAGE
  // ==========================================================

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">

      {/* ================================================== */}
      {/* HEADER */}
      {/* ================================================== */}

      <div>

        <h1 className="text-3xl font-bold text-foreground">
          My Donations
        </h1>

        <p className="text-foreground/60 mt-2">
          Manage your blood donations and track their
          progress.
        </p>

      </div>
      
      {/* ================================================== */}
      {/* ACTIVE DONATION NOTICE */}
      {/* ================================================== */}

      {activeDonations.length > 0 && (

        <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">

          <CardContent className="py-5">

            <div className="flex items-start gap-3">

              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />

              <div>

                <p className="font-medium text-blue-900 dark:text-blue-300">
                  You have an active donation
                </p>

                <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                  You cannot offer blood to another request
                  until this donation is completed or
                  cancelled.
                </p>

              </div>

            </div>

          </CardContent>

        </Card>
      )}


      {/* ================================================== */}
      {/* NO DONATIONS */}
      {/* ================================================== */}

      {donations.length === 0 ? (

        <Card>

          <CardContent className="pt-12 pb-12 text-center">

            <Droplet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />

            <h3 className="text-lg font-semibold mb-2">
              No donations yet
            </h3>

            <p className="text-foreground/60 mb-6">
              When you offer blood to a request, your
              donation will appear here.
            </p>

            <Button
              asChild
            >

              <Link
                href="/dashboard/requests"
              >
                Find Blood Requests
              </Link>

            </Button>

          </CardContent>

        </Card>

      ) : (

        <div className="space-y-5">

          {donations.map(
            (donation) => {

              const isProcessing =
                processingId ===
                donation.id;


              const recipientName =
                donation.recipientId
                  ? recipientNames[
                      donation.recipientId
                    ] ||
                    'Loading...'
                  : 'Recipient';


              const bloodType =
                donation.bloodType &&
                isValidBloodType(
                  donation.bloodType
                )
                  ? donation.bloodType
                  : donorProfile?.bloodType ||
                    'Unknown';


              return (

                <Card
                  key={donation.id}
                  className="overflow-hidden border-border"
                >

                  {/* ====================================== */}
                  {/* CARD HEADER */}
                  {/* ====================================== */}

                  <CardHeader>

                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">

                      <div>

                        <div className="flex items-center gap-3 mb-2">

                          <CardTitle className="text-lg">
                            Blood Donation
                          </CardTitle>

                          <Badge
                            className={
                              statusColors[
                                donation.status
                              ]
                            }
                          >

                            {statusLabels[
                              donation.status
                            ]}

                          </Badge>

                        </div>

                        <CardDescription>
                          Donation to {recipientName}
                        </CardDescription>

                      </div>


                      <div className="flex items-center gap-2">

                        <Droplet className="w-5 h-5 text-primary" />

                        <span className="font-semibold">
                          {bloodType}
                        </span>

                      </div>

                    </div>

                  </CardHeader>


                  {/* ====================================== */}
                  {/* CARD CONTENT */}
                  {/* ====================================== */}

                  <CardContent className="space-y-5">

                    {/* DETAILS */}

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">

                      {/* UNITS */}

                      <div className="flex items-start gap-3">

                        <Droplet className="w-4 h-4 text-primary mt-1 flex-shrink-0" />

                        <div>

                          <p className="text-xs text-muted-foreground">
                            Units
                          </p>

                          <p className="text-sm font-medium">
                            {donation.units ??
                              donation.quantity ??
                              1}{' '}

                            {(donation.units ??
                              donation.quantity ??
                              1) === 1
                              ? 'unit'
                              : 'units'}
                          </p>

                        </div>

                      </div>


                      {/* OFFERED DATE */}

                      <div className="flex items-start gap-3">

                        <Clock className="w-4 h-4 text-primary mt-1 flex-shrink-0" />

                        <div>

                          <p className="text-xs text-muted-foreground">
                            Offered
                          </p>

                          <p className="text-sm font-medium">
                            {formatDateTime(
                              donation.offeredAt ??
                              donation.createdAt
                            )}
                          </p>

                        </div>

                      </div>


                      {/* DONATION DATE */}

                      <div className="flex items-start gap-3">

                        <Calendar className="w-4 h-4 text-primary mt-1 flex-shrink-0" />

                        <div>

                          <p className="text-xs text-muted-foreground">
                            {donation.status === 'scheduled'
                              ? 'Scheduled for'
                              : donation.status === 'completed'
                                ? 'Donated on'
                                : 'Schedule'}
                          </p>

                          <p className="text-sm font-medium">
                            {donation.status === 'offered'
                              ? 'Awaiting recipient'
                              : donation.donationDate
                                ? formatDate(donation.donationDate)
                                : 'Not scheduled'}
                          </p>

                        </div>

                      </div>


                      {/* LOCATION */}

                      <div className="flex items-start gap-3">

                        <MapPin className="w-4 h-4 text-primary mt-1 flex-shrink-0" />

                        <div>

                          <p className="text-xs text-muted-foreground">
                            Location
                          </p>

                          <p className="text-sm font-medium">

                            {donation.location ||
                              'Not specified'}

                          </p>

                        </div>

                      </div>

                    </div>


                    {/* ================================== */}
                    {/* STATUS EXPLANATION */}
                    {/* ================================== */}

                    {donation.status ===
                      'offered' && (

                      <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 p-4">

                        <div className="flex items-start gap-3">

                          <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />

                          <div>

                            <p className="font-medium text-yellow-900 dark:text-yellow-300">
                              Donation offer submitted
                            </p>

                            <p className="text-sm text-yellow-800 dark:text-yellow-400 mt-1">
                              Your blood offer has been sent.
                              The recipient will choose the donation date and time.
                            </p>

                          </div>

                        </div>

                      </div>
                    )}


                    {donation.status ===
                      'scheduled' && (

                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4">

                        <div className="flex items-start gap-3">

                          <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />

                          <div>

                            <p className="font-medium text-blue-900 dark:text-blue-300">
                              Donation scheduled
                            </p>

                            <p className="text-sm text-blue-800 dark:text-blue-400 mt-1">

                              Your donation is scheduled
                              for{' '}

                              <span className="font-semibold">
                                {formatDate(
                                  donation.donationDate
                                )}
                              </span>
                              .

                            </p>

                          </div>

                        </div>

                      </div>
                    )}


                    {donation.status ===
                      'completed' && (

                      <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4">

                        <div className="flex items-start gap-3">

                          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />

                          <div>

                            <p className="font-medium text-green-900 dark:text-green-300">
                              Donation completed
                            </p>

                            <p className="text-sm text-green-800 dark:text-green-400 mt-1">
                              Thank you for donating blood
                              and helping someone in need.
                            </p>

                          </div>

                        </div>

                      </div>
                    )}


                    {donation.status ===
                      'cancelled' && (

                      <div className="rounded-lg bg-gray-50 dark:bg-gray-950/30 p-4">

                        <div className="flex items-start gap-3">

                          <XCircle className="w-5 h-5 text-gray-600 dark:text-gray-400 mt-0.5 flex-shrink-0" />

                          <div>

                            <p className="font-medium text-gray-900 dark:text-gray-300">
                              Donation cancelled
                            </p>

                            <p className="text-sm text-gray-700 dark:text-gray-400 mt-1">
                              This donation offer is no
                              longer active.
                            </p>

                          </div>

                        </div>

                      </div>
                    )}


                    {/* ================================== */}
                    {/* ACTIONS */}
                    {/* ================================== */}

                    <div className="pt-4 border-t border-border flex flex-col sm:flex-row gap-3">

                      {/* MESSAGE RECIPIENT */}

                      {donation.recipientId &&
                        donation.status !== 'cancelled' && (

                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => openDonationChat(donation)}
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Message Recipient
                        </Button>
                      )}


                      {/* VIEW REQUEST */}

                      {donation.requestId && (

                        <Button
                          variant="outline"
                          className="flex-1"
                          asChild
                        >

                          <Link
                            href={`/dashboard/requests/${donation.requestId}`}
                          >

                            View Request

                          </Link>

                        </Button>
                      )}


                      {/* OFFERED → WAIT FOR RECIPIENT TO SCHEDULE */}

                      {donation.status ===
                        'offered' && (

                        <div className="flex-1 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300 flex items-center justify-center text-center">
                          Awaiting recipient to schedule
                        </div>
                      )}


                      {/* OFFERED → CANCEL */}

                      {donation.status ===
                        'offered' && (

                        <Button
                          variant="outline"
                          className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() =>
                            handleCancel(
                              donation
                            )
                          }
                          disabled={
                            isProcessing
                          }
                        >

                          <XCircle className="w-4 h-4 mr-2" />

                          Cancel

                        </Button>
                      )}


                      {/* SCHEDULED → COMPLETE */}

                      {donation.status ===
                        'scheduled' && (

                        <Button
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() =>
                            handleComplete(
                              donation
                            )
                          }
                          disabled={
                            isProcessing
                          }
                        >

                          <CheckCircle2 className="w-4 h-4 mr-2" />

                          {isProcessing
                            ? 'Completing...'
                            : 'Complete Donation'}

                        </Button>
                      )}


                      {/* SCHEDULED → CANCEL */}

                      {donation.status ===
                        'scheduled' && (

                        <Button
                          variant="outline"
                          className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() =>
                            handleCancel(
                              donation
                            )
                          }
                          disabled={
                            isProcessing
                          }
                        >

                          <XCircle className="w-4 h-4 mr-2" />

                          Cancel

                        </Button>
                      )}


                      {/* COMPLETED */}

                      {donation.status ===
                        'completed' && (

                        <div className="flex-1 flex items-center justify-center text-sm text-green-700 dark:text-green-400">

                          <CheckCircle2 className="w-4 h-4 mr-2" />

                          Donation successfully completed

                        </div>
                      )}


                      {/* CANCELLED */}

                      {donation.status ===
                        'cancelled' && (

                        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">

                          <XCircle className="w-4 h-4 mr-2" />

                          Donation is no longer active

                        </div>
                      )}

                    </div>

                  </CardContent>

                </Card>
              );
            }
          )}

        </div>
      )}

    </div>
  );
}