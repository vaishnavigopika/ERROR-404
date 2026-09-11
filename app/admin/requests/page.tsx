'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  collection,
  onSnapshot,
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

import {
  Search,
  Eye,
  X,
  Loader2,
  User,
  Droplet,
  Calendar,
  Clock,
  Users,
  FileText,
} from 'lucide-react';

import { db } from '@/lib/firebase';

interface BloodRequest {
  id: string;
  recipientId?: string;
  bloodType?: string;
  unitsNeeded?: number;
  quantity?: number;
  urgency?: string;
  status?: string;
  matchedDonors?: string[];
  unitsReceivedOutside?: number;
  reason?: string;
  requiredDate?: string;
  requiredTimeStart?: string;
  requiredTimeEnd?: string;
  createdAt?: any;
  updatedAt?: any;
}

interface UserData {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  bloodType?: string;
}

type RequestCategory = 'active' | 'completed' | 'expired';

const urgencyColors: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  medium:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  high:
    'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
  critical:
    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
};

const statusColors: Record<string, string> = {
  open:
    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  matched:
    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  completed:
    'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100',
  expired:
    'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
  cancelled:
    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
};

function parseDate(value: any): Date | null {
  if (!value) return null;

  try {
    if (typeof value?.toDate === 'function') {
      const date = value.toDate();

      return isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(value);

    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function formatDate(value: any) {
  const date = parseDate(value);

  if (!date) {
    return 'Not specified';
  }

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/*
 * Determines whether the request's required date has passed.
 */
function isRequestExpired(request: BloodRequest) {
  if (!request.requiredDate) {
    return false;
  }

  const requiredDate = parseDate(request.requiredDate);

  if (!requiredDate) {
    return false;
  }

  const today = new Date();

  /*
   * Compare dates only, not the current time.
   * This means a request remains active throughout
   * its required date.
   */
  today.setHours(0, 0, 0, 0);
  requiredDate.setHours(0, 0, 0, 0);

  return requiredDate < today;
}

/*
 * Returns the actual status to display.
 */
function getDisplayStatus(request: BloodRequest) {
  const storedStatus = (request.status || '').toLowerCase();

  // Completed always stays completed.
  if (storedStatus === 'completed') {
    return 'completed';
  }

  // Cancelled stays cancelled.
  if (storedStatus === 'cancelled') {
    return 'cancelled';
  }

  // Required date has passed.
  if (isRequestExpired(request)) {
    return 'expired';
  }

  // Existing status.
  if (storedStatus === 'matched') {
    return 'matched';
  }

  if (storedStatus === 'open') {
    return 'open';
  }

  /*
   * Fallback for old documents that don't have status.
   */
  const remaining =
    typeof request.quantity === 'number'
      ? request.quantity
      : request.unitsNeeded || 0;

  return remaining <= 0 ? 'matched' : 'open';
}

/*
 * Categorize a request into one of the three tabs.
 */
function getRequestCategory(
  request: BloodRequest
): RequestCategory | null {
  const status = getDisplayStatus(request);

  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'expired') {
    return 'expired';
  }

  if (status === 'open' || status === 'matched') {
    return 'active';
  }

  return null;
}

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);

  const [search, setSearch] = useState('');

  const [activeTab, setActiveTab] =
    useState<RequestCategory>('active');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedRequest, setSelectedRequest] =
    useState<BloodRequest | null>(null);

  // ============================================================
  // LOAD USERS
  // ============================================================

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      snapshot => {
        const loadedUsers: UserData[] =
          snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as UserData[];

        setUsers(loadedUsers);
      },
      error => {
        console.error('Failed to load users:', error);

        setError(
          'Unable to load user information from Firebase.'
        );
      }
    );

    return () => unsubscribe();
  }, []);

  // ============================================================
  // LOAD BLOOD REQUESTS
  // ============================================================

  useEffect(() => {
    setLoading(true);
    setError('');

    const unsubscribe = onSnapshot(
      collection(db, 'bloodRequests'),
      snapshot => {
        const loadedRequests: BloodRequest[] =
          snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as BloodRequest[];

        // Newest first.
        loadedRequests.sort((a, b) => {
          const aDate =
            parseDate(a.createdAt)?.getTime() || 0;

          const bDate =
            parseDate(b.createdAt)?.getTime() || 0;

          return bDate - aDate;
        });

        setRequests(loadedRequests);
        setLoading(false);
      },
      error => {
        console.error(
          'Failed to load blood requests:',
          error
        );

        setError(
          'Unable to load blood requests. Please check your Firebase connection and Firestore permissions.'
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // ============================================================
  // RECIPIENT LOOKUP
  // ============================================================

  function getRecipient(recipientId?: string) {
    if (!recipientId) {
      return undefined;
    }

    return users.find(
      user => user.id === recipientId
    );
  }

  // ============================================================
  // REQUEST COUNTS
  // ============================================================

  const activeRequests = requests.filter(
    request =>
      getRequestCategory(request) === 'active'
  );

  const completedRequests = requests.filter(
    request =>
      getRequestCategory(request) === 'completed'
  );

  const expiredRequests = requests.filter(
    request =>
      getRequestCategory(request) === 'expired'
  );

  // ============================================================
  // SEARCH + TAB FILTER
  // ============================================================

  const filteredRequests = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    const categoryRequests = requests.filter(
      request =>
        getRequestCategory(request) === activeTab
    );

    if (!query) {
      return categoryRequests;
    }

    return categoryRequests.filter(request => {
      const recipient =
        users.find(
          user => user.id === request.recipientId
        );

      const recipientName =
        recipient?.name || '';

      const recipientEmail =
        recipient?.email || '';

      const recipientPhone =
        recipient?.phone || '';

      return (
        request.id
          .toLowerCase()
          .includes(query) ||
        (request.bloodType || '')
          .toLowerCase()
          .includes(query) ||
        (request.urgency || '')
          .toLowerCase()
          .includes(query) ||
        (request.status || '')
          .toLowerCase()
          .includes(query) ||
        recipientName
          .toLowerCase()
          .includes(query) ||
        recipientEmail
          .toLowerCase()
          .includes(query) ||
        recipientPhone
          .toLowerCase()
          .includes(query)
      );
    });
  }, [
    requests,
    users,
    search,
    activeTab,
  ]);

  // ============================================================
  // TAB CONFIGURATION
  // ============================================================

  const tabs = [
    {
      id: 'active' as RequestCategory,
      label: 'Active Requests',
      count: activeRequests.length,
    },
    {
      id: 'completed' as RequestCategory,
      label: 'Completed Requests',
      count: completedRequests.length,
    },
    {
      id: 'expired' as RequestCategory,
      label: 'Expired Requests',
      count: expiredRequests.length,
    },
  ];

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">

      {/* HEADER */}
      <div className="space-y-4">

        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Blood Requests
          </h1>

          <p className="text-foreground/60 mt-2">
            Monitor and manage blood requests
          </p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />

          <Input
            value={search}
            onChange={event =>
              setSearch(event.target.value)
            }
            placeholder="Search by name, blood type, or request..."
            className="border-border pl-9"
          />
        </div>

      </div>

      {/* ERROR */}
      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              {error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* SUMMARY */}
      <div className="grid md:grid-cols-3 gap-4">

        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-sm text-foreground/60">
              Total Requests
            </p>

            <p className="text-3xl font-bold text-foreground mt-1">
              {loading ? '—' : requests.length}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-sm text-foreground/60">
              Active Requests
            </p>

            <p className="text-3xl font-bold text-green-600 mt-1">
              {loading ? '—' : activeRequests.length}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-sm text-foreground/60">
              Completed Requests
            </p>

            <p className="text-3xl font-bold text-blue-600 mt-1">
              {loading ? '—' : completedRequests.length}
            </p>
          </CardContent>
        </Card>

      </div>

      {/* ====================================================== */}
      {/* REQUEST TABS */}
      {/* ====================================================== */}

      <div className="flex flex-wrap gap-3">

        {tabs.map(tab => (
          <Button
            key={tab.id}
            type="button"
            variant={
              activeTab === tab.id
                ? 'default'
                : 'outline'
            }
            onClick={() =>
              setActiveTab(tab.id)
            }
            className={
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'border-border'
            }
          >
            {tab.label}

            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-background/70">
              {tab.count}
            </span>
          </Button>
        ))}

      </div>

      {/* ====================================================== */}
      {/* REQUESTS TABLE */}
      {/* ====================================================== */}

      <Card className="border-border overflow-hidden">

        <CardHeader>

          <CardTitle>
            {activeTab === 'active' &&
              'Active Blood Requests'}

            {activeTab === 'completed' &&
              'Completed Blood Requests'}

            {activeTab === 'expired' &&
              'Expired Blood Requests'}
          </CardTitle>

          <CardDescription>
            {loading
              ? 'Loading requests...'
              : `${filteredRequests.length} request${
                  filteredRequests.length === 1
                    ? ''
                    : 's'
                } found`}
          </CardDescription>

        </CardHeader>

        <CardContent>

          {loading ? (
            <div className="flex items-center justify-center py-16">

              <div className="text-center">

                <Loader2 className="w-7 h-7 animate-spin text-primary mx-auto" />

                <p className="text-sm text-foreground/60 mt-3">
                  Loading blood requests...
                </p>

              </div>

            </div>
          ) : filteredRequests.length === 0 ? (

            <div className="text-center py-16">

              <Droplet className="w-10 h-10 text-foreground/30 mx-auto mb-3" />

              <h3 className="font-semibold text-foreground">
                {search
                  ? 'No matching requests'
                  : `No ${activeTab} requests`}
              </h3>

              <p className="text-sm text-foreground/60 mt-1">
                {search
                  ? 'Try a different search term.'
                  : activeTab === 'active'
                  ? 'There are currently no active blood requests.'
                  : activeTab === 'completed'
                  ? 'Completed requests will appear here.'
                  : 'Expired requests will appear here.'}
              </p>

            </div>

          ) : (

            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead>

                  <tr className="border-b border-border">

                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Recipient
                    </th>

                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Blood Type
                    </th>

                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Quantity
                    </th>

                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Urgency
                    </th>

                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Status
                    </th>

                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Required Date
                    </th>

                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Matched Donors
                    </th>

                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Actions
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {filteredRequests.map(request => {

                    const recipient =
                      getRecipient(
                        request.recipientId
                      );

                    const matchedDonors =
                      Array.isArray(
                        request.matchedDonors
                      )
                        ? request.matchedDonors
                        : [];

                    const status =
                      getDisplayStatus(request);

                    const remainingUnits =
                      typeof request.quantity ===
                      'number'
                        ? request.quantity
                        : request.unitsNeeded || 0;

                    return (
                      <tr
                        key={request.id}
                        className="border-b border-border hover:bg-secondary/5 transition-colors"
                      >

                        {/* RECIPIENT NAME */}
                        <td className="py-3 px-4">

                          <div className="flex items-center gap-2">

                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="w-4 h-4 text-primary" />
                            </div>

                            <div>

                              <p className="font-semibold text-foreground">
                                {recipient?.name ||
                                  'Unknown User'}
                              </p>

                              {recipient?.email && (
                                <p className="text-xs text-foreground/50">
                                  {recipient.email}
                                </p>
                              )}

                            </div>

                          </div>

                        </td>

                        {/* BLOOD TYPE */}
                        <td className="py-3 px-4">

                          <Badge className="bg-primary/20 text-primary border-primary/30">
                            {request.bloodType ||
                              'N/A'}
                          </Badge>

                        </td>

                        {/* QUANTITY */}
                        <td className="py-3 px-4 text-foreground">

                          {remainingUnits}{' '}

                          {remainingUnits === 1
                            ? 'unit'
                            : 'units'}

                        </td>

                        {/* URGENCY */}
                        <td className="py-3 px-4">

                          <Badge
                            className={
                              urgencyColors[
                                request.urgency ||
                                  'low'
                              ] ||
                              'bg-gray-100 text-gray-800 dark:bg-gray-900'
                            }
                          >
                            {request.urgency ||
                              'N/A'}
                          </Badge>

                        </td>

                        {/* STATUS */}
                        <td className="py-3 px-4">

                          <Badge
                            className={
                              statusColors[
                                status
                              ] ||
                              'bg-gray-100 text-gray-800 dark:bg-gray-900'
                            }
                          >
                            {status}
                          </Badge>

                        </td>

                        {/* REQUIRED DATE */}
                        <td className="py-3 px-4 text-foreground">

                          {formatDate(
                            request.requiredDate
                          )}

                        </td>

                        {/* MATCHED DONORS */}
                        <td className="py-3 px-4 text-foreground">

                          {matchedDonors.length}

                        </td>

                        {/* VIEW */}
                        <td className="py-3 px-4">

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setSelectedRequest(
                                request
                              )
                            }
                            className="text-primary hover:bg-primary/10"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>

                        </td>

                      </tr>
                    );
                  })}

                </tbody>

              </table>

            </div>
          )}

        </CardContent>

      </Card>

      {/* ====================================================== */}
      {/* REQUEST DETAILS MODAL */}
      {/* ====================================================== */}

      {selectedRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() =>
            setSelectedRequest(null)
          }
        >

          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-background rounded-xl shadow-xl border border-border"
            onClick={event =>
              event.stopPropagation()
            }
          >

            {/* MODAL HEADER */}

            <div className="flex items-start justify-between p-6 border-b border-border">

              <div>

                <div className="flex items-center gap-3">

                  <h2 className="text-xl font-bold text-foreground">
                    Blood Request
                  </h2>

                  <Badge className="bg-primary/20 text-primary border-primary/30">
                    {selectedRequest.bloodType ||
                      'N/A'}
                  </Badge>

                  <Badge
                    className={
                      statusColors[
                        getDisplayStatus(
                          selectedRequest
                        )
                      ] || ''
                    }
                  >
                    {getDisplayStatus(
                      selectedRequest
                    )}
                  </Badge>

                </div>

                <p className="text-xs text-foreground/50 font-mono mt-1">
                  Request ID: #{selectedRequest.id}
                </p>

              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  setSelectedRequest(null)
                }
              >
                <X className="w-5 h-5" />
              </Button>

            </div>

            {/* MODAL BODY */}

            <div className="p-6 space-y-6">

              {/* RECIPIENT */}

              <Card className="border-border">

                <CardHeader className="pb-3">

                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    Recipient
                  </CardTitle>

                </CardHeader>

                <CardContent>

                  {(() => {

                    const recipient =
                      getRecipient(
                        selectedRequest.recipientId
                      );

                    if (!recipient) {

                      return (
                        <div>

                          <p className="text-sm text-foreground">
                            Recipient profile not found
                          </p>

                          {selectedRequest.recipientId && (
                            <p className="text-xs text-foreground/50 font-mono mt-1">
                              ID: {selectedRequest.recipientId}
                            </p>
                          )}

                        </div>
                      );

                    }

                    return (
                      <div className="grid md:grid-cols-2 gap-4">

                        <div>

                          <p className="text-xs text-foreground/50">
                            Name
                          </p>

                          <p className="font-semibold text-foreground mt-1">
                            {recipient.name ||
                              'Not provided'}
                          </p>

                        </div>

                        <div>

                          <p className="text-xs text-foreground/50">
                            Email
                          </p>

                          <p className="font-semibold text-foreground mt-1 break-all">
                            {recipient.email ||
                              'Not provided'}
                          </p>

                        </div>

                        <div>

                          <p className="text-xs text-foreground/50">
                            Phone
                          </p>

                          <p className="font-semibold text-foreground mt-1">
                            {recipient.phone ||
                              'Not provided'}
                          </p>

                        </div>

                        <div>

                          <p className="text-xs text-foreground/50">
                            User ID
                          </p>

                          <p className="font-mono text-xs text-foreground mt-1 break-all">
                            {recipient.id}
                          </p>

                        </div>

                      </div>
                    );

                  })()}

                </CardContent>

              </Card>

              {/* REQUEST INFORMATION */}

              <Card className="border-border">

                <CardHeader className="pb-3">

                  <CardTitle className="text-base flex items-center gap-2">
                    <Droplet className="w-4 h-4 text-primary" />
                    Request Information
                  </CardTitle>

                </CardHeader>

                <CardContent>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

                    <div>

                      <p className="text-xs text-foreground/50">
                        Blood Type
                      </p>

                      <p className="font-semibold text-foreground mt-1">
                        {selectedRequest.bloodType ||
                          'N/A'}
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-foreground/50">
                        Units Requested
                      </p>

                      <p className="font-semibold text-foreground mt-1">
                        {selectedRequest.unitsNeeded ||
                          0}
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-foreground/50">
                        Units Remaining
                      </p>

                      <p className="font-semibold text-foreground mt-1">
                        {typeof selectedRequest.quantity ===
                        'number'
                          ? selectedRequest.quantity
                          : selectedRequest.unitsNeeded ||
                            0}
                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-foreground/50">
                        Received Outside App
                      </p>

                      <p className="font-semibold text-foreground mt-1">
                        {selectedRequest.unitsReceivedOutside ||
                          0}
                      </p>

                    </div>

                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-5">

                    <div>

                      <p className="text-xs text-foreground/50">
                        Urgency
                      </p>

                      <Badge
                        className={`mt-1 ${
                          urgencyColors[
                            selectedRequest.urgency ||
                              'low'
                          ] || ''
                        }`}
                      >
                        {selectedRequest.urgency ||
                          'N/A'}
                      </Badge>

                    </div>

                    <div>

                      <p className="text-xs text-foreground/50">
                        Status
                      </p>

                      <Badge
                        className={`mt-1 ${
                          statusColors[
                            getDisplayStatus(
                              selectedRequest
                            )
                          ] || ''
                        }`}
                      >
                        {getDisplayStatus(
                          selectedRequest
                        )}
                      </Badge>

                    </div>

                    <div>

                      <p className="text-xs text-foreground/50">
                        Matched Donors
                      </p>

                      <p className="font-semibold text-foreground mt-1">
                        {Array.isArray(
                          selectedRequest.matchedDonors
                        )
                          ? selectedRequest
                              .matchedDonors.length
                          : 0}
                      </p>

                    </div>

                  </div>

                </CardContent>

              </Card>

              {/* REQUIRED SCHEDULE */}

              <Card className="border-border">

                <CardHeader className="pb-3">

                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    Required Schedule
                  </CardTitle>

                </CardHeader>

                <CardContent>

                  <div className="grid md:grid-cols-3 gap-4">

                    <div className="flex items-start gap-3">

                      <Calendar className="w-4 h-4 text-foreground/50 mt-1" />

                      <div>

                        <p className="text-xs text-foreground/50">
                          Required Date
                        </p>

                        <p className="font-semibold text-foreground mt-1">
                          {formatDate(
                            selectedRequest.requiredDate
                          )}
                        </p>

                      </div>

                    </div>

                    <div className="flex items-start gap-3">

                      <Clock className="w-4 h-4 text-foreground/50 mt-1" />

                      <div>

                        <p className="text-xs text-foreground/50">
                          Start Time
                        </p>

                        <p className="font-semibold text-foreground mt-1">
                          {selectedRequest.requiredTimeStart ||
                            'Not specified'}
                        </p>

                      </div>

                    </div>

                    <div className="flex items-start gap-3">

                      <Clock className="w-4 h-4 text-foreground/50 mt-1" />

                      <div>

                        <p className="text-xs text-foreground/50">
                          End Time
                        </p>

                        <p className="font-semibold text-foreground mt-1">
                          {selectedRequest.requiredTimeEnd ||
                            'Not specified'}
                        </p>

                      </div>

                    </div>

                  </div>

                </CardContent>

              </Card>

              {/* REASON */}

              <Card className="border-border">

                <CardHeader className="pb-3">

                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    Reason
                  </CardTitle>

                </CardHeader>

                <CardContent>

                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                    {selectedRequest.reason ||
                      'No reason provided.'}
                  </p>

                </CardContent>

              </Card>

              {/* MATCHED DONORS */}

              <Card className="border-border">

                <CardHeader className="pb-3">

                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Matched Donors
                  </CardTitle>

                  <CardDescription>
                    Donors currently recorded as matched to this request
                  </CardDescription>

                </CardHeader>

                <CardContent>

                  {!Array.isArray(
                    selectedRequest.matchedDonors
                  ) ||
                  selectedRequest.matchedDonors
                    .length === 0 ? (

                    <p className="text-sm text-foreground/50">
                      No donors have been matched to this request yet.
                    </p>

                  ) : (

                    <div className="space-y-2">

                      {selectedRequest.matchedDonors.map(
                        donorId => {

                          const donor =
                            users.find(
                              user =>
                                user.id ===
                                donorId
                            );

                          return (
                            <div
                              key={donorId}
                              className="flex items-center justify-between p-3 border border-border rounded-lg"
                            >

                              <div>

                                <p className="font-semibold text-foreground">
                                  {donor?.name ||
                                    'Donor'}
                                </p>

                                <p className="text-xs text-foreground/50 font-mono mt-1">
                                  {donorId}
                                </p>

                              </div>

                              <div className="text-right">

                                {donor?.bloodType && (
                                  <Badge variant="outline">
                                    {donor.bloodType}
                                  </Badge>
                                )}

                                {donor?.email && (
                                  <p className="text-xs text-foreground/50 mt-1">
                                    {donor.email}
                                  </p>
                                )}

                              </div>

                            </div>
                          );

                        }
                      )}

                    </div>
                  )}

                </CardContent>

              </Card>

            </div>

            {/* MODAL FOOTER */}

            <div className="flex justify-end p-6 border-t border-border">

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setSelectedRequest(null)
                }
              >
                Close
              </Button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}