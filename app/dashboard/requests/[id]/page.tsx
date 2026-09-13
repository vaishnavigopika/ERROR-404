'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useToast } from '@/hooks/use-toast';

import {
  BloodRequest,
  DonationRecord,
  UserProfile,
} from '@/lib/types';

import { scheduleDonation } from '@/lib/services/donationService';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Droplet,
  Edit,
  Mail,
  MapPin,
  Phone,
  User,
  CheckCircle2,
  MessageCircle,
} from 'lucide-react';

interface RequestLocation {
  facilityName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

interface RequestExtras {
  unitsReceivedOutside?: number;
  requiredTimeStart?: string;
  requiredTimeEnd?: string;
  contactPhone?: string;
  location?: RequestLocation;
}

type RequestWithExtras = BloodRequest & RequestExtras;

function toDate(value: any): Date | null {
  if (!value) return null;

  try {
    if (
      typeof value === 'object' &&
      typeof value.toDate === 'function'
    ) {
      return value.toDate();
    }

    const d = new Date(value);

    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function formatDate(value: any) {
  const d = toDate(value);

  return d
    ? d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Not specified';
}

function formatTime(value?: string) {
  if (!value) return '';

  const [h, m] = value.split(':').map(Number);

  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return value;
  }

  const d = new Date();

  d.setHours(h, m, 0, 0);

  return d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function RequestDetailsPage() {
  const params = useParams<{ id: string }>();

  const requestId = params?.id;
  const router = useRouter();
  const { user } = useAuth();

  const { toast } = useToast();

  const [request, setRequest] =
    useState<RequestWithExtras | null>(null);

  const [recipient, setRecipient] =
    useState<UserProfile & Record<string, any> | null>(null);

  const [donations, setDonations] = useState<
    (DonationRecord & Record<string, any>)[]
  >([]);

  const [donorNames, setDonorNames] =
    useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);

  const [schedulingId, setSchedulingId] =
    useState<string | null>(null);

  const [scheduleTimes, setScheduleTimes] =
    useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!requestId) {
        if (active) setLoading(false);
        return;
      }

      try {
        // --------------------------------------------------
        // LOAD BLOOD REQUEST
        // --------------------------------------------------

        const requestSnap = await getDoc(
          doc(db, 'bloodRequests', requestId)
        );

        if (!requestSnap.exists()) {
          throw new Error('Blood request not found.');
        }

        const data = {
          id: requestSnap.id,
          ...requestSnap.data(),
        } as RequestWithExtras;

        if (!active) return;
        setRequest(data);

        // --------------------------------------------------
        // LOAD RECIPIENT CONTACT
        // --------------------------------------------------

        if (data.recipientId) {
          const recipientSnap = await getDoc(
            doc(db, 'users', data.recipientId)
          );

          if (active && recipientSnap.exists()) {
            setRecipient(
              recipientSnap.data() as UserProfile &
                Record<string, any>
            );
          }
        }

        // --------------------------------------------------
        // LOAD DONATIONS
        // --------------------------------------------------

        const donationSnap = await getDocs(
          query(
            collection(db, 'donations'),
            where('requestId', '==', requestId)
          )
        );

        const records = donationSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as (DonationRecord & Record<string, any>)[];

        records.sort(
          (a, b) =>
            (toDate(b.createdAt)?.getTime() ?? 0) -
            (toDate(a.createdAt)?.getTime() ?? 0)
        );

        if (!active) return;
        setDonations(records);

        // --------------------------------------------------
        // LOAD DONOR NAMES
        // --------------------------------------------------

        const names: Record<string, string> = {};

        for (const donation of records) {
          if (!donation.donorId) continue;

          const snap = await getDoc(
            doc(db, 'users', donation.donorId)
          );

          if (snap.exists()) {
            names[donation.donorId] =
              (snap.data() as any).name ||
              'BloodConnect Donor';
          }
        }

        if (active) setDonorNames(names);
      } catch (error: any) {
        console.error(
          'Failed to load request details:',
          error
        );

        if (active) {
          toast({
            title: 'Unable to Load Request',
            description:
              error?.message ||
              'Could not load request details.',
            variant: 'destructive',
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [requestId, toast]);

  // --------------------------------------------------
  // REQUEST INFORMATION
  // --------------------------------------------------

  const isOwner = Boolean(
    user?.uid &&
      request?.recipientId === user.uid
  );

  const bloodConnectReceived =
    request?.matchedDonors?.length ?? 0;

  const outsideReceived =
    request?.unitsReceivedOutside ?? 0;

  const totalRequested =
    request?.unitsNeeded ??
    request?.quantity ??
    0;

  const remaining = Math.max(
    0,
    totalRequested - bloodConnectReceived - outsideReceived
  );

  const offeredDonations = useMemo(
    () =>
      donations.filter(
        (d) => d.status === 'offered'
      ),
    [donations]
  );

  // --------------------------------------------------
  // HOSPITAL / BLOOD BANK LOCATION
  // --------------------------------------------------

  const facilityName =
    request?.location?.facilityName ||
    'Hospital / Blood Bank';

  const facilityAddress = [
    request?.location?.address,
    request?.location?.city,
    request?.location?.state,
    request?.location?.pincode,
  ]
    .filter(
      (value): value is string =>
        typeof value === 'string' &&
        value.trim().length > 0
    )
    .join(', ');

  // --------------------------------------------------
  // DONATION SCHEDULING
  // --------------------------------------------------

  const openDonationChat = (
    donation: DonationRecord & Record<string, any>
  ) => {
    if (!user || !request || request.recipientId !== user.uid) return;

    if (!donation.donorId) {
      toast({
        title: 'Messaging Unavailable',
        description: 'This donor does not have a valid donor ID.',
        variant: 'destructive',
      });
      return;
    }

    if (donation.status === 'cancelled') {
      toast({
        title: 'Messaging Unavailable',
        description: 'This donation offer has been cancelled.',
        variant: 'destructive',
      });
      return;
    }

    router.push(
      `/dashboard/messages?donationId=${encodeURIComponent(donation.id)}`
    );
  };

  const handleSchedule = async (
    donation: DonationRecord & Record<string, any>
  ) => {
    if (!user || !request || !isOwner) return;
    const time = scheduleTimes[donation.id];
    if (!request.requiredDate || !time) {
      toast({
        title: 'Schedule Required',
        description: 'Select the donation time before scheduling.',
        variant: 'destructive',
      });
      return;
    }

    if (!donation.donorId) {
      toast({
        title: 'Messaging Unavailable',
        description: 'This donor does not have a valid donor ID.',
        variant: 'destructive',
      });

      return;
    }

    if (donation.status === 'cancelled') {
      toast({
        title: 'Messaging Unavailable',
        description: 'This donation offer has been cancelled.',
        variant: 'destructive',
      });

      return;
    }

    // --------------------------------------------------
    // BUILD APPOINTMENT DATE
    // --------------------------------------------------

    const [year, month, day] =
      request.requiredDate.split('-').map(Number);

    const [hours, minutes] = time.split(':').map(Number);

    const scheduledDate = new Date(
      year,
      month - 1,
      day,
      hours,
      minutes,
      0,
      0
    );

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      Number.isNaN(scheduledDate.getTime())
    ) {
      toast({
        title: 'Invalid Appointment',
        description: 'Please choose a valid donation time.',
        variant: 'destructive',
      });
      return;
    }

    // --------------------------------------------------
    // CHECK DATE NORMALIZATION
    // --------------------------------------------------

    if (
      scheduledDate.getFullYear() !== year ||
      scheduledDate.getMonth() !== month - 1 ||
      scheduledDate.getDate() !== day ||
      scheduledDate.getHours() !== hours ||
      scheduledDate.getMinutes() !== minutes
    ) {
      toast({
        title: 'Invalid Appointment',
        description: 'The selected donation date or time is invalid.',
        variant: 'destructive',
      });
      return;
    }

    // --------------------------------------------------
    // CHECK REQUIRED TIME WINDOW
    // --------------------------------------------------

    if (
      request.requiredTimeStart &&
      time < request.requiredTimeStart
    ) {
      toast({
        title: 'Outside Required Window',
        description:
          `Choose a time at or after ${formatTime(
            request.requiredTimeStart
          )}.`,
        variant: 'destructive',
      });
      return;
    }

    if (
      request.requiredTimeEnd &&
      time > request.requiredTimeEnd
    ) {
      toast({
        title: 'Outside Required Window',
        description:
          `Choose a time at or before ${formatTime(
            request.requiredTimeEnd
          )}.`,
        variant: 'destructive',
      });
      return;
    }

    // --------------------------------------------------
    // CHECK PAST TIME
    // --------------------------------------------------

    if (scheduledDate.getTime() < Date.now()) {
      toast({
        title: 'Time Has Passed',
        description:
          'A donation appointment cannot be scheduled in the past.',
        variant: 'destructive',
      });
      return;
    }
      return;
    }

    setSchedulingId(donation.id);
    try {
      await scheduleDonation(donation.id, scheduledDate, user.uid);
      setDonations((prev) => prev.map((d) => d.id === donation.id ? { ...d, status: 'scheduled', donationDate: scheduledDate.toISOString() } : d));
      toast({ title: 'Donation Scheduled', description: 'The donor has been given the agreed donation date and time.' });
    } catch (error: any) {
      console.error('Schedule failed:', error);
      toast({ title: 'Scheduling Failed', description: error?.message || 'Could not schedule the donation.', variant: 'destructive' });
    } finally {
      setSchedulingId(null);
    }
  };

  // --------------------------------------------------
  // LOADING
  // --------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">

          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />

          <p>
            Loading request details...
          </p>

        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // REQUEST NOT FOUND
  // --------------------------------------------------

  if (!request) {
    return (
      <div className="p-8 text-center">

        <p className="mb-4">
          Request not found.
        </p>

        <Button asChild>
          <Link href="/dashboard/requests">
            Back to Requests
          </Link>
        </Button>

      </div>
    );
  }

  // --------------------------------------------------
  // RECIPIENT CONTACT
  // --------------------------------------------------

  const contactPhone =
    request.contactPhone ||
    recipient?.phone ||
    recipient?.mobile ||
    recipient?.contactNumber ||
    recipient?.phoneNumber;

  const contactEmail =
    recipient?.email ||
    recipient?.emailAddress ||
    'Not provided';

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">

      {/* HEADER */}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

        <div>

          <Link
            href="/dashboard/requests"
            className="inline-flex items-center gap-2 text-primary hover:underline mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Requests
          </Link>

          <h1 className="text-3xl font-bold">
            Blood Request Details
          </h1>

          <p className="text-muted-foreground mt-1">
            Connect with the recipient and coordinate
            the donation safely.
          </p>

        </div>

        {isOwner && (
          <Button asChild variant="outline">
            <Link
              href={`/dashboard/requests/${requestId}/edit`}
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Request
            </Link>
          </Button>
        )}

      </div>

      {/* REQUEST SUMMARY */}

      <Card>

        <CardHeader>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">

            <div>

              <CardTitle className="flex items-center gap-3">
                <Droplet className="w-5 h-5 text-primary" />

                {request.bloodType}
              </CardTitle>

              <CardDescription className="mt-2">
                {request.reason}
              </CardDescription>

            </div>

            <Badge>
              {request.status}
            </Badge>

          </div>

        </CardHeader>

        <CardContent className="space-y-5">

          {/* REQUEST COUNTS */}

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">

            <div className="rounded-lg border p-4">

              <p className="text-xs text-muted-foreground">
                Originally requested
              </p>

              <p className="text-2xl font-bold">
                {totalRequested}
              </p>

              <p className="text-xs">
                unit
                {totalRequested !== 1
                  ? 's'
                  : ''}
              </p>

            </div>

            <div className="rounded-lg border p-4">

              <p className="text-xs text-muted-foreground">
                Received through BloodConnect
              </p>

              <p className="text-2xl font-bold">
                {bloodConnectReceived}
              </p>

            </div>

            <div className="rounded-lg border p-4">

              <p className="text-xs text-muted-foreground">
                Received elsewhere
              </p>

              <p className="text-2xl font-bold">
                {outsideReceived}
              </p>

            </div>

            <div className="rounded-lg border p-4 bg-primary/5">

              <p className="text-xs text-muted-foreground">
                Still needed
              </p>

              <p className="text-2xl font-bold text-primary">
                {remaining}
              </p>

            </div>

          </div>

          {/* DATE / TIME */}

          <div className="grid sm:grid-cols-2 gap-4 text-sm">

            <div className="flex items-center gap-3">

              <Calendar className="w-4 h-4 text-primary" />

              <span>
                Needed on{' '}
                <strong>
                  {formatDate(
                    request.requiredDate
                  )}
                </strong>
              </span>

            </div>

            <div className="flex items-center gap-3">

              <Clock className="w-4 h-4 text-primary" />

              <span>
                Preferred time{' '}
                <strong>
                  {formatTime(
                    request.requiredTimeStart
                  )}{' '}
                  -{' '}
                  {formatTime(
                    request.requiredTimeEnd
                  )}
                </strong>
              </span>

            </div>

          </div>

        </CardContent>

      </Card>

      {/* RECIPIENT CONTACT */}

      <Card>

        <CardHeader>

          <CardTitle className="flex items-center gap-2">

            <User className="w-5 h-5 text-primary" />

            Recipient Contact

          </CardTitle>

          <CardDescription>
            Use the recipient's contact details to
            coordinate the donation. The donation
            location below is the hospital or blood bank
            specified in this blood request.
          </CardDescription>

        </CardHeader>

        <CardContent>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">

            {/* Recipient Name */}

            <div className="flex items-center gap-3">

              <User className="w-4 h-4 text-primary" />

              <span>
                <strong>
                  {recipient?.name ||
                    'Recipient'}
                </strong>
              </span>

            </div>

            {/* Recipient Phone */}

            <div className="flex items-center gap-3">

              <Phone className="w-4 h-4 text-primary" />

              <span>
                {contactPhone ||
                  'Phone not provided'}
              </span>

            </div>

            {/* Recipient Email */}

            <div className="flex items-center gap-3">

              <Mail className="w-4 h-4 text-primary" />

              <span>
                {contactEmail}
              </span>

            </div>

            {/* HOSPITAL / BLOOD BANK */}

            <div className="flex items-start gap-3">

              <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />

              <div>

                <p className="font-medium">
                  {facilityName}
                </p>

                {facilityAddress ? (
                  <p className="text-muted-foreground mt-1">
                    {facilityAddress}
                  </p>
                ) : (
                  <p className="text-muted-foreground mt-1">
                    Location not provided
                  </p>
                )}

              </div>

            </div>

          </div>

        </CardContent>

      </Card>

      {/* DONOR MATCHES */}

      <Card>

        <CardHeader>

          <CardTitle>
            Donor Matches ({donations.length})
          </CardTitle>

          <CardDescription>
            Each donor offer represents one unit.
            The recipient can schedule an offered
            donation.
          </CardDescription>

        </CardHeader>

        <CardContent className="space-y-4">

          {donations.length === 0 ? (

            <p className="text-sm text-muted-foreground">
              No donor has offered blood yet.
            </p>

          ) : (

            donations.map((donation) => (

              <div
                key={donation.id}
                className="rounded-lg border p-4 space-y-4"
              >

                {/* DONOR */}

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

                  <div>
                    <p className="font-semibold">
                      {donorNames[donation.donorId] ||
                        'BloodConnect Donor'}
                    </p>

                    <p className="text-sm text-muted-foreground">
                      1 unit • {donation.status}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {donation.status}
                    </Badge>

                    {isOwner && donation.status !== 'cancelled' && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openDonationChat(donation)}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Message Donor
                      </Button>
                    )}
                  </div>

                </div>

                {/* SCHEDULED */}

                {donation.status === 'scheduled' && (
                  <div className="text-sm flex items-center gap-2 text-blue-700 dark:text-blue-300">
                    <CheckCircle2 className="w-4 h-4" />
                    Scheduled for {formatDate(donation.donationDate)} at{' '}
                    {toDate(donation.donationDate)?.toLocaleTimeString(
                      'en-IN',
                      { hour: 'numeric', minute: '2-digit' }
                    )}
                  </div>
                )}

                {/* SCHEDULE DONOR */}

                {isOwner && donation.status === 'offered' && (
                  <div className="rounded-lg bg-muted/40 p-4 space-y-4">
                    <div>
                      <p className="text-sm font-semibold">
                        Schedule this donor
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        You choose the appointment. It must be on{' '}
                        <strong>{formatDate(request.requiredDate)}</strong>
                        {request.requiredTimeStart && request.requiredTimeEnd
                          ? ` between ${formatTime(request.requiredTimeStart)} and ${formatTime(request.requiredTimeEnd)}.`
                          : '.'}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                      <div className="space-y-2 flex-1">
                        <Label htmlFor={`time-${donation.id}`}>
                          Donation time
                        </Label>
                        <Input
                          id={`time-${donation.id}`}
                          type="time"
                          min={request.requiredTimeStart || undefined}
                          max={request.requiredTimeEnd || undefined}
                          value={
                            scheduleTimes[donation.id] ||
                            request.requiredTimeStart ||
                            ''
                          }
                          onChange={(e) =>
                            setScheduleTimes((prev) => ({
                              ...prev,
                              [donation.id]: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <Button
                        type="button"
                        onClick={() => handleSchedule(donation)}
                        disabled={schedulingId === donation.id}
                      >
                        {schedulingId === donation.id
                          ? 'Scheduling...'
                          : 'Schedule Donation'}
                      </Button>
                    </div>
                  </div>
                )}

              </div>

            ))
          )}

        </CardContent>

      </Card>

    </div>
  );
}
