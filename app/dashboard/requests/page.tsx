'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
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
import {
  Droplet,
  Calendar,
  AlertCircle,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { offerBloodDonation } from '@/lib/services/donationService';
import { toast } from 'sonner';
import {
  getCompatibleRecipients,
  BloodType,
  BLOOD_TYPES,
} from '@/lib/bloodCompatibility';

const urgencyColors = {
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  medium:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  high:
    'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  critical:
    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

const statusColors = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  matched:
    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  completed:
    'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
  cancelled:
    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

function isValidBloodType(value: unknown): value is BloodType {
  return (
    typeof value === 'string' &&
    BLOOD_TYPES.includes(value as BloodType)
  );
}

export default function RequestsPage() {
  const { user } = useAuth();

  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [recipientNames, setRecipientNames] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [donorBloodType, setDonorBloodType] =
    useState<BloodType | null>(null);

  useEffect(() => {
    const fetchRequests = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // --------------------------------------------
        // 1. Get the logged-in user's profile
        // --------------------------------------------

        const donorRef = doc(db, 'users', user.uid);
        const donorSnap = await getDoc(donorRef);

        if (!donorSnap.exists()) {
          toast.error('Your user profile could not be found.');
          setLoading(false);
          return;
        }

        const donorData = donorSnap.data() as UserProfile;

        // --------------------------------------------
        // 2. Make sure this is a donor
        // --------------------------------------------

        if (donorData.role !== 'donor') {
          toast.error(
            'Only donors can view blood donation requests.'
          );
          setRequests([]);
          setLoading(false);
          return;
        }

        // --------------------------------------------
        // 3. Validate donor blood type
        // --------------------------------------------

        if (!isValidBloodType(donorData.bloodType)) {
          toast.error(
            'Your profile has an invalid or missing blood type.'
          );
          setRequests([]);
          setLoading(false);
          return;
        }

        setDonorBloodType(donorData.bloodType);

        // --------------------------------------------
        // 4. Find blood types this donor can donate to
        // --------------------------------------------

        const compatibleBloodTypes =
          getCompatibleRecipients(donorData.bloodType);

        // --------------------------------------------
        // 5. Fetch ONLY compatible open requests
        // --------------------------------------------

        const requestsRef = collection(
          db,
          'bloodRequests'
        );

        const requestsQuery = query(
          requestsRef,
          where('status', '==', 'open'),
          where(
            'bloodType',
            'in',
            compatibleBloodTypes
          )
        );

        const querySnapshot = await getDocs(
          requestsQuery
        );

        const allRequests = querySnapshot.docs.map(
          (requestDoc) => ({
            id: requestDoc.id,
            ...requestDoc.data(),
          })
        ) as BloodRequest[];

        setRequests(allRequests);

        // --------------------------------------------
        // 6. Fetch recipient names
        // --------------------------------------------

        const names: Record<string, string> = {};

        for (const request of allRequests) {
          const recipientId = request.recipientId;

          if (
            recipientId &&
            !names[recipientId]
          ) {
            try {
              const recipientRef = doc(
                db,
                'users',
                recipientId
              );

              const recipientSnap = await getDoc(
                recipientRef
              );

              if (recipientSnap.exists()) {
                const recipientData =
                  recipientSnap.data() as UserProfile;

                names[recipientId] =
                  recipientData.name ||
                  'Unknown User';
              } else {
                names[recipientId] =
                  'Unknown User';
              }
            } catch (error) {
              console.error(
                `Error fetching recipient ${recipientId}:`,
                error
              );

              names[recipientId] =
                'Unknown User';
            }
          }
        }

        setRecipientNames(names);
      } catch (error) {
        console.error(
          'Error fetching compatible requests:',
          error
        );

        toast.error(
          'Failed to load blood requests.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, [user]);

  const handleOfferBlood = async (
    request: BloodRequest
  ) => {
    if (!user) {
      toast.error(
        'Please sign in to offer blood.'
      );
      return;
    }

    if (offeringId) return;

    setOfferingId(request.id);

    try {
      await offerBloodDonation({
        donorId: user.uid,
        requestId: request.id,
        units: 1,
        date: new Date(),
      });

      toast.success(
        'Blood offer submitted successfully!'
      );

      // --------------------------------------------
      // Update the request locally
      // --------------------------------------------

      setRequests((prev) =>
        prev
          .map((r) => {
            if (r.id !== request.id) {
              return r;
            }

            const currentQuantity =
              r.quantity ??
              r.unitsNeeded ??
              1;

            const newQuantity =
              Math.max(0, currentQuantity - 1);

            return {
              ...r,
              quantity: newQuantity,
              status:
                newQuantity <= 0
                  ? ('matched' as const)
                  : ('open' as const),
            };
          })
          // Remove completely fulfilled requests
          .filter(
            (r) =>
              r.status !== 'matched'
          )
      );
    } catch (err: any) {
      console.error(
        'Offer failed:',
        err
      );

      toast.error(
        err?.message ||
          'Failed to offer blood. Please try again.'
      );
    } finally {
      setOfferingId(null);
    }
  };

  // --------------------------------------------
  // Loading
  // --------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-foreground">
            Loading compatible requests...
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------
  // Non-donor / invalid profile
  // --------------------------------------------

  if (!donorBloodType) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <Card className="border-border">
          <CardContent className="pt-12 pb-12 text-center">
            <Droplet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />

            <h3 className="text-lg font-semibold text-foreground mb-2">
              Blood requests unavailable
            </h3>

            <p className="text-foreground/60">
              A valid donor profile and blood type
              are required to view donation requests.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --------------------------------------------
  // Main page
  // --------------------------------------------

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Blood Requests
          </h1>

          <p className="text-foreground/60 mt-2">
            {requests.length}{' '}
            compatible request
            {requests.length !== 1 ? 's' : ''}{' '}
            available for your blood type ({donorBloodType})
          </p>
        </div>

        <Link href="/dashboard/requests/new">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            Create Request
          </Button>
        </Link>
      </div>

      {/* No requests */}
      {requests.length === 0 ? (
        <Card className="border-border">
          <CardContent className="pt-12 text-center">
            <Droplet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />

            <h3 className="text-lg font-semibold text-foreground mb-2">
              No compatible requests
            </h3>

            <p className="text-foreground/60 mb-4">
              There are currently no open blood
              requests that match your blood type.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">

          {requests.map((request) => (
            <Card
              key={request.id}
              className="border-border overflow-hidden hover:shadow-lg transition-shadow"
            >

              {/* Request header */}
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">

                  <div className="flex-1">

                    <div className="flex items-center gap-3 mb-2">

                      <CardTitle className="text-lg">
                        {recipientNames[
                          request.recipientId
                        ] || 'Loading...'}
                      </CardTitle>

                      <Badge className="bg-primary/20 text-primary border-primary/30">
                        {request.bloodType}
                      </Badge>

                    </div>

                    <CardDescription>
                      {request.reason}
                    </CardDescription>

                  </div>

                  <div className="text-right">
                    <Badge
                      className={
                        urgencyColors[
                          request.urgency
                        ]
                      }
                    >
                      {request.urgency
                        .charAt(0)
                        .toUpperCase() +
                        request.urgency.slice(1)}{' '}
                      Priority
                    </Badge>
                  </div>

                </div>
              </CardHeader>

              {/* Request details */}
              <CardContent className="space-y-4">

                <div className="grid md:grid-cols-2 gap-4 text-sm">

                  {/* Quantity */}
                  <div className="flex items-center gap-3 text-foreground/70">
                    <Droplet className="w-4 h-4 text-primary flex-shrink-0" />

                    <span>
                      {request.quantity ??
                        request.unitsNeeded ??
                        '?'}{' '}
                      unit
                      {(request.quantity ??
                        request.unitsNeeded ??
                        1) !== 1
                        ? 's'
                        : ''}{' '}
                      needed
                    </span>
                  </div>

                  {/* Required date */}
                  <div className="flex items-center gap-3 text-foreground/70">
                    <Calendar className="w-4 h-4 text-primary flex-shrink-0" />

                    <span>
                      Needed by{' '}
                      {new Date(
                        request.requiredDate
                      ).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-3 text-foreground/70">
                    <AlertCircle className="w-4 h-4 text-primary flex-shrink-0" />

                    <Badge
                      className={
                        statusColors[
                          request.status
                        ]
                      }
                    >
                      {request.status
                        .charAt(0)
                        .toUpperCase() +
                        request.status.slice(1)}
                    </Badge>
                  </div>

                  {/* Matched donors */}
                  {request.matchedDonors?.length > 0 && (
                    <div className="flex items-center gap-3 text-foreground/70">
                      <User className="w-4 h-4 text-primary flex-shrink-0" />

                      <span>
                        {request.matchedDonors.length}{' '}
                        donor
                        {request.matchedDonors.length !==
                        1
                          ? 's'
                          : ''}{' '}
                        matched
                      </span>
                    </div>
                  )}

                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-border flex gap-3 sm:gap-4">

                  <Button
                    variant="outline"
                    className="flex-1"
                    size="sm"
                    asChild
                  >
                    <Link
                      href={`/dashboard/requests/${request.id}`}
                    >
                      View Details
                    </Link>
                  </Button>

                  {request.status === 'open' && (
                    <Button
                      className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      size="sm"
                      onClick={() =>
                        handleOfferBlood(request)
                      }
                      disabled={
                        offeringId === request.id ||
                        (request.quantity ??
                          request.unitsNeeded ??
                          0) <= 0
                      }
                    >
                      {offeringId === request.id
                        ? 'Offering...'
                        : 'Offer Blood'}
                    </Button>
                  )}

                </div>

              </CardContent>
            </Card>
          ))}

        </div>
      )}
    </div>
  );
}