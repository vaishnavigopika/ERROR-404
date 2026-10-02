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
import { useToast } from '@/hooks/use-toast';

import {
  BloodRequest,
  DonationRecord,
  UserProfile,
} from '@/lib/types';

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
  MessageCircle,
  CheckCircle2,
} from 'lucide-react';

type LocationData = {
  facilityName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

type RequestWithExtras = BloodRequest & {
  unitsReceivedOutside?: number;
  requiredTimeStart?: string;
  requiredTimeEnd?: string;

  // Hospital / Blood Bank location
  location?: LocationData | string | null;

  contactPhone?: string;
};

type DonationWithExtras = DonationRecord & {
  pendingConfirmation?: boolean;
  unitsCounted?: boolean;
};

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
  if (!value) return 'Not specified';

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

function formatLocation(
  location: LocationData | string | null | undefined
) {
  if (!location) {
    return 'Hospital / Blood Bank location not provided';
  }

  if (typeof location === 'string') {
    return location;
  }

  const parts = [
    location.facilityName,
    location.address,
    location.city,
    location.state,
    location.pincode,
  ].filter(Boolean);

  return parts.length
    ? parts.join(', ')
    : 'Hospital / Blood Bank location not provided';
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
    useState<(UserProfile & Record<string, any>) | null>(null);

  const [donations, setDonations] =
    useState<DonationWithExtras[]>([]);

  const [donorNames, setDonorNames] =
    useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!requestId) return;

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

        setRequest(data);

        // --------------------------------------------------
        // LOAD RECIPIENT
        // --------------------------------------------------

        if (data.recipientId) {
          const recipientSnap = await getDoc(
            doc(db, 'users', data.recipientId)
          );

          if (recipientSnap.exists()) {
            setRecipient(
              recipientSnap.data() as UserProfile &
                Record<string, any>
            );
          }
        }

        // --------------------------------------------------
        // LOAD DONATIONS / OFFERS
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
        })) as DonationWithExtras[];

        records.sort(
          (a, b) =>
            (toDate(b.createdAt)?.getTime() ?? 0) -
            (toDate(a.createdAt)?.getTime() ?? 0)
        );

        setDonations(records);

        // --------------------------------------------------
        // LOAD DONOR NAMES
        // --------------------------------------------------

        const names: Record<string, string> = {};

        for (const donation of records) {
          if (!donation.donorId) continue;

          try {
            const snap = await getDoc(
              doc(db, 'users', donation.donorId)
            );

            if (snap.exists()) {
              names[donation.donorId] =
                (snap.data() as any).name ||
                'BloodConnect Donor';
            }
          } catch {
            names[donation.donorId] =
              'BloodConnect Donor';
          }
        }

        setDonorNames(names);
      } catch (error: any) {
        console.error(
          'Failed to load request details:',
          error
        );

        toast({
          title: 'Unable to Load Request',
          description:
            error?.message ||
            'Could not load request details.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [requestId, toast]);

  // --------------------------------------------------
  // OWNER
  // --------------------------------------------------

  const isOwner = Boolean(
    user?.uid &&
      request?.recipientId === user.uid
  );

  // --------------------------------------------------
  // ACTIVE OFFERS
  //
  // These do NOT reduce units needed.
  // --------------------------------------------------

  const activeOffers = useMemo(
    () =>
      donations.filter(
        (d) =>
          d.status === 'offered' ||
          d.status === 'scheduled'
      ),
    [donations]
  );

  // --------------------------------------------------
  // COMPLETED DONATIONS
  //
  // Only these reduce the required units.
  // --------------------------------------------------

  const completedDonations = useMemo(
    () =>
      donations.filter(
        (d) => d.status === 'completed'
      ),
    [donations]
  );

  // --------------------------------------------------
  // ORIGINAL REQUESTED UNITS
  //
  // IMPORTANT:
  // ALWAYS use unitsNeeded first.
  //
  // Do NOT use request.quantity here because older
  // logic may have changed quantity when an offer
  // was created.
  // --------------------------------------------------

  const totalRequested =
    Number(request?.unitsNeeded ?? 0);

  // Fallback only for very old records that do not
  // contain unitsNeeded.
  const originalRequested =
    totalRequested > 0
      ? totalRequested
      : Number(request?.quantity ?? 0);

  // --------------------------------------------------
  // BLOOD RECEIVED OUTSIDE BLOODCONNECT
  // --------------------------------------------------

  const outsideReceived = Math.max(
    0,
    Number(request?.unitsReceivedOutside ?? 0)
  );

  // --------------------------------------------------
  // COMPLETED BLOODCONNECT DONATIONS
  //
  // Only completed donations are counted.
  // Offered/scheduled/cancelled donations are ignored.
  // --------------------------------------------------

  const receivedThroughBloodConnect =
    completedDonations.reduce(
      (sum, donation) =>
        sum +
        Number(
          donation.units ??
            donation.quantity ??
            1
        ),
      0
    );

  // --------------------------------------------------
  // STILL NEEDED
  //
  // IMPORTANT:
  //
  // original requested
  //       -
  // completed BloodConnect donations
  //       -
  // blood received elsewhere
  //
  // ACTIVE OFFERS ARE NOT SUBTRACTED.
  // --------------------------------------------------

  const remaining = Math.max(
    0,
    originalRequested -
      receivedThroughBloodConnect -
      outsideReceived
  );

  // --------------------------------------------------
  // OPEN MESSAGE CHAT
  // --------------------------------------------------

  const openDonationChat = (
    donation: DonationRecord
  ) => {
    if (
      !user ||
      !request ||
      request.recipientId !== user.uid
    ) {
      return;
    }

    if (!donation.donorId) return;

    router.push(
      `/dashboard/messages?donationId=${encodeURIComponent(
        donation.id
      )}`
    );
  };

  // --------------------------------------------------
  // LOADING
  // --------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />

          <p>Loading request details...</p>
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
  // CONTACT INFORMATION
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
            Coordinate the donation with the recipient
            and hospital / blood bank.
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

          {/* STATISTICS */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* ORIGINAL REQUEST */}
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">
                Originally requested
              </p>

              <p className="text-2xl font-bold">
                {originalRequested}
              </p>
            </div>

            {/* COMPLETED */}
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">
                Completed through BloodConnect
              </p>

              <p className="text-2xl font-bold">
                {receivedThroughBloodConnect}
              </p>
            </div>

            {/* ACTIVE OFFERS */}
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">
                Active offers
              </p>

              <p className="text-2xl font-bold text-blue-600">
                {activeOffers.length}
              </p>
            </div>

            {/* STILL NEEDED */}
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
                Donation date:{' '}
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
                Donation time:{' '}
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

      {/* HOSPITAL / BLOOD BANK */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />

            Hospital / Blood Bank
          </CardTitle>

          <CardDescription>
            This is the location where the blood
            donation is to take place.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <p className="font-medium">
            {formatLocation(request.location)}
          </p>
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
            Use these details to coordinate the donation.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">

            <div className="flex items-center gap-3">
              <User className="w-4 h-4 text-primary" />

              <strong>
                {recipient?.name || 'Recipient'}
              </strong>
            </div>

            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-primary" />

              {contactPhone ||
                'Phone not provided'}
            </div>

            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-primary" />

              {contactEmail}
            </div>

          </div>
        </CardContent>
      </Card>

      {/* BLOOD OFFERS */}
      <Card>
        <CardHeader>
          <CardTitle>
            Blood Offers ({activeOffers.length})
          </CardTitle>

          <CardDescription>
            Offers do not reduce the required units.
            A unit is counted only after the donor
            confirms that the donation actually happened.
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
                className="rounded-lg border p-4 space-y-3"
              >

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

                  <div>
                    <p className="font-semibold">
                      {donorNames[
                        donation.donorId
                      ] || 'BloodConnect Donor'}
                    </p>

                    <p className="text-sm text-muted-foreground">
                      {Number(
                        donation.units ??
                          donation.quantity ??
                          1
                      )}{' '}
                      unit
                      {Number(
                        donation.units ??
                          donation.quantity ??
                          1
                      ) !== 1
                        ? 's'
                        : ''}{' '}
                      • {donation.status}
                    </p>
                  </div>

                  <Badge variant="outline">
                    {donation.status}
                  </Badge>
                </div>

                {/* OFFERED */}
                {donation.status === 'offered' && (
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    Waiting for the donor to confirm
                    whether the donation happened.
                  </p>
                )}

                {/* SCHEDULED */}
                {donation.status === 'scheduled' && (
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Donation has been scheduled.
                    The unit will be counted only
                    after the donor confirms completion.
                  </p>
                )}

                {/* COMPLETED */}
                {donation.status === 'completed' && (
                  <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />

                    Donation completed and counted.
                  </p>
                )}

                {/* CANCELLED */}
                {donation.status === 'cancelled' && (
                  <p className="text-sm text-muted-foreground">
                    This blood offer was cancelled and
                    is not counted.
                  </p>
                )}

                {/* MESSAGE DONOR */}
                {isOwner &&
                  donation.status !== 'cancelled' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        openDonationChat(
                          donation
                        )
                      }
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />

                      Message Donor
                    </Button>
                  )}

              </div>
            ))
          )}

        </CardContent>
      </Card>

    </div>
  );
}