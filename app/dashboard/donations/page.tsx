'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

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
  AlertCircle,
  MessageCircle,
} from 'lucide-react';

import {
  cancelDonation,
  completeDonation,
  subscribeToUserDonations,
} from '@/lib/services/donationService';
import { toast } from 'sonner';
import { BloodType, BLOOD_TYPES } from '@/lib/bloodCompatibility';
import { DonationRecord, UserProfile } from '@/lib/types';

type HospitalLocation = {
  facilityName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

type DonationWithSchedule = Omit<DonationRecord, 'location'> & {
  requiredDate?: string | null;
  requiredTimeStart?: string | null;
  requiredTimeEnd?: string | null;
  location?: HospitalLocation | string | null;
  pendingConfirmation?: boolean;
};

const statusColors: Record<string, string> = {
  offered: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
};

const statusLabels: Record<string, string> = {
  offered: 'Offered',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  try {
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as any).toDate === 'function') {
      return (value as any).toDate();
    }
    const d = new Date(value as string | number | Date);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function formatDate(value: unknown): string {
  const d = toDate(value);
  return d
    ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Not specified';
}

function formatDateTime(value: unknown): string {
  const d = toDate(value);
  return d
    ? d.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not specified';
}

function formatTime(value?: string | null): string {
  if (!value) return 'Not specified';
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function formatLocation(location: DonationWithSchedule['location']): string {
  if (!location) return 'Not specified';
  if (typeof location === 'string') return location;

  const parts = [
    location.facilityName,
    location.address,
    location.city,
    location.state,
    location.pincode,
  ].filter(Boolean);

  return parts.length ? parts.join(', ') : 'Not specified';
}

function getDonationStart(donation: DonationWithSchedule): Date | null {
  if (!donation.requiredDate) return null;

  const [year, month, day] = donation.requiredDate.split('-').map(Number);
  if (!year || !month || !day) return null;

  const start = new Date(year, month - 1, day);

  if (donation.requiredTimeStart) {
    const [hours, minutes] = donation.requiredTimeStart.split(':').map(Number);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      start.setHours(hours, minutes, 0, 0);
    }
  } else {
    start.setHours(0, 0, 0, 0);
  }

  return start;
}

function isConfirmationAvailable(donation: DonationWithSchedule): boolean {
  if (donation.status !== 'offered' && donation.status !== 'scheduled') return false;
  const start = getDonationStart(donation);
  if (!start) return true;
  return Date.now() >= start.getTime();
}

export default function DonationsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [donations, setDonations] = useState<DonationWithSchedule[]>([]);
  const [donorProfile, setDonorProfile] = useState<UserProfile | null>(null);
  const [recipientNames, setRecipientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setDonorProfile(null);
      return;
    }

    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (snap.exists()) setDonorProfile(snap.data() as UserProfile);
      })
      .catch((error) => console.error('Failed to load donor profile:', error));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setDonations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToUserDonations(
      user.uid,
      (records) => {
        const sorted = [...records].sort(
          (a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0)
        );
        setDonations(sorted as DonationWithSchedule[]);
        setLoading(false);
      },
      (error) => {
        console.error('Donations real-time error:', error);
        toast.error('Failed to load your donations.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const loadNames = async () => {
      const names: Record<string, string> = {};
      for (const donation of donations) {
        if (!donation.recipientId || names[donation.recipientId]) continue;
        try {
          const snap = await getDoc(doc(db, 'users', donation.recipientId));
          names[donation.recipientId] = snap.exists()
            ? ((snap.data() as UserProfile).name || 'Unknown Recipient')
            : 'Unknown Recipient';
        } catch {
          names[donation.recipientId] = 'Unknown Recipient';
        }
      }
      setRecipientNames(names);
    };

    if (donations.length) loadNames();
  }, [donations]);

  const activeDonations = useMemo(
    () => donations.filter((d) => d.status === 'offered' || d.status === 'scheduled'),
    [donations]
  );

  const handleComplete = async (donation: DonationWithSchedule) => {
    if (!user) return;

    if (!isConfirmationAvailable(donation)) {
      const start = getDonationStart(donation);
      toast.error(
        start
          ? `Confirmation is available from ${formatDateTime(start)}.`
          : 'Confirmation is not available yet.'
      );
      return;
    }

    const confirmed = window.confirm(
      'Have you actually completed this blood donation? Choose OK only if the blood was donated.'
    );
    if (!confirmed) return;

    setProcessingId(donation.id);
    try {
      await completeDonation(donation.id);
      toast.success('Donation confirmed. The request unit has now been counted and your 3-month waiting period has started.');
    } catch (error: any) {
      console.error('Complete donation failed:', error);
      toast.error(error?.message || 'Failed to confirm donation.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (donation: DonationWithSchedule) => {
    if (!user) return;
    if (donation.status !== 'offered' && donation.status !== 'scheduled') {
      toast.error('This donation cannot be cancelled.');
      return;
    }

    if (!window.confirm('Are you sure you want to cancel your blood offer?')) return;

    setProcessingId(donation.id);
    try {
      await cancelDonation(donation.id);
      toast.success('Blood offer cancelled. You are available to donate again.');
    } catch (error: any) {
      console.error('Cancel donation failed:', error);
      toast.error(error?.message || 'Failed to cancel the offer.');
    } finally {
      setProcessingId(null);
    }
  };

  const openChat = (donation: DonationWithSchedule) => {
    if (!donation.recipientId) {
      toast.error('Recipient information is unavailable.');
      return;
    }
    router.push(`/dashboard/messages?donationId=${encodeURIComponent(donation.id)}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>Loading your donations...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <Droplet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Please sign in</h3>
            <p className="text-muted-foreground mt-2">Sign in to view your donation history.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">My Donations</h1>
        <p className="text-muted-foreground mt-2">
          Track your blood offers, donation confirmation and donation history.
        </p>
      </div>

      {activeDonations.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30">
          <CardContent className="py-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium">You have an active blood offer</p>
                <p className="text-sm text-muted-foreground mt-1">
                  You remain unavailable for another donation until this offer is cancelled or confirmed as completed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {donations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Droplet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">No donations yet</h3>
            <p className="text-muted-foreground mt-2 mb-6">When you offer blood, it will appear here.</p>
            <Button asChild><Link href="/dashboard/requests">Find Blood Requests</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {donations.map((donation) => {
            const recipientName = donation.recipientId
              ? recipientNames[donation.recipientId] || 'Loading...'
              : 'Recipient';
            const bloodType =
              donation.bloodType && BLOOD_TYPES.includes(donation.bloodType as BloodType)
                ? donation.bloodType
                : donorProfile?.bloodType || 'Unknown';
            const canConfirm = isConfirmationAvailable(donation);
            const start = getDonationStart(donation);
            const location = formatLocation(donation.location);
            const isProcessing = processingId === donation.id;

            return (
              <Card key={donation.id} className="overflow-hidden">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-lg">Blood Donation</CardTitle>
                        <Badge className={statusColors[donation.status] || ''}>
                          {statusLabels[donation.status] || donation.status}
                        </Badge>
                      </div>
                      <CardDescription>Donation to {recipientName}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Droplet className="w-5 h-5 text-primary" />
                      <span className="font-semibold">{bloodType}</span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Units</p>
                      <p className="font-medium">{donation.units ?? donation.quantity ?? 1} unit</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Offer made</p>
                      <p className="font-medium">{formatDateTime(donation.offeredAt ?? donation.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Donation window</p>
                      <p className="font-medium">{formatDate(donation.requiredDate)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(donation.requiredTimeStart)} - {formatTime(donation.requiredTimeEnd)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Hospital / Blood Bank</p>
                      <p className="font-medium">{location}</p>
                    </div>
                  </div>

                  {donation.status === 'offered' && (
                    <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 p-4">
                      <p className="font-medium">Donation confirmation pending</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your offer does not reduce the receiver's required units. Only confirming that the donation actually happened will count the unit.
                      </p>
                      {start && !canConfirm && (
                        <p className="text-sm mt-2 font-medium">
                          Confirmation becomes available on {formatDateTime(start)}.
                        </p>
                      )}
                      {canConfirm && (
                        <p className="text-sm mt-2 font-medium text-green-700 dark:text-green-400">
                          You can confirm the donation now. The button remains available after the requested time window as well.
                        </p>
                      )}
                    </div>
                  )}

                  {donation.status === 'scheduled' && (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4">
                      <p className="font-medium">Donation window confirmed</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Attend the hospital/blood bank during the receiver's requested time window.
                      </p>
                    </div>
                  )}

                  {donation.status === 'completed' && (
                    <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4 flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                      <div>
                        <p className="font-medium">Donation completed</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Completed on {formatDateTime(donation.donationDate)}. Your 3-month waiting period has started.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t flex flex-col sm:flex-row gap-3">
                    {donation.recipientId && donation.status !== 'cancelled' && (
                      <Button variant="outline" className="flex-1" onClick={() => openChat(donation)}>
                        <MessageCircle className="w-4 h-4 mr-2" /> Message Recipient
                      </Button>
                    )}

                    {donation.requestId && (
                      <Button variant="outline" className="flex-1" asChild>
                        <Link href={`/dashboard/requests/${donation.requestId}`}>View Request</Link>
                      </Button>
                    )}

                    {(donation.status === 'offered' || donation.status === 'scheduled') && (
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleComplete(donation)}
                        disabled={isProcessing || !canConfirm}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        {isProcessing ? 'Confirming...' : canConfirm ? 'Confirm Donation Done' : 'Available at Donation Time'}
                      </Button>
                    )}

                    {(donation.status === 'offered' || donation.status === 'scheduled') && (
                      <Button
                        variant="outline"
                        className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleCancel(donation)}
                        disabled={isProcessing}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancel Offer
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
