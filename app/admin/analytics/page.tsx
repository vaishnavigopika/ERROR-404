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

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import {
  Users,
  Droplet,
  ClipboardList,
  Clock,
  UserCheck,
  HeartPulse,
  Loader2,
} from 'lucide-react';

import { db } from '@/lib/firebase';

interface UserData {
  id: string;
  role?: string;
  createdAt?: any;
  updatedAt?: any;
}

interface DonationData {
  id: string;
  donorId?: string;
  requestId?: string;
  bloodType?: string;
  units?: number;
  status?: string;
  offeredAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

interface BloodRequestData {
  id: string;
  recipientId?: string;
  bloodType?: string;
  unitsNeeded?: number;
  quantity?: number;
  matchedDonors?: string[];
  status?: string;
  createdAt?: any;
  updatedAt?: any;
}

function toDate(value: any): Date | null {
  if (!value) return null;

  try {
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    if (typeof value?.toDate === 'function') {
      const date = value.toDate();
      return isNaN(date.getTime()) ? null : date;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number'
    ) {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }

    return null;
  } catch {
    return null;
  }
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, '0')}`;
}

function getMonthLabel(date: Date) {
  return date.toLocaleString('en-US', {
    month: 'short',
  });
}

function getLastSixMonths() {
  const months: {
    key: string;
    label: string;
    date: Date;
  }[] = [];

  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth() - i,
      1
    );

    months.push({
      key: getMonthKey(date),
      label: getMonthLabel(date),
      date,
    });
  }

  return months;
}

function getLastSevenDays() {
  const days: {
    key: string;
    label: string;
    date: Date;
  }[] = [];

  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);

    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);

    days.push({
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleString('en-US', {
        weekday: 'short',
      }),
      date,
    });
  }

  return days;
}

export default function AdminAnalyticsPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [donations, setDonations] = useState<
    DonationData[]
  >([]);
  const [requests, setRequests] = useState<
    BloodRequestData[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ============================================================
  // LOAD USERS
  // ============================================================

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      snapshot => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as UserData[];

        setUsers(data);
        setLoading(false);
      },
      err => {
        console.error(
          'Error loading users:',
          err
        );

        setError(
          'Unable to load analytics data from Firebase.'
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // ============================================================
  // LOAD DONATIONS
  // ============================================================

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'donations'),
      snapshot => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as DonationData[];

        setDonations(data);
      },
      err => {
        console.error(
          'Error loading donations:',
          err
        );

        setError(
          'Unable to load donation analytics.'
        );
      }
    );

    return () => unsubscribe();
  }, []);

  // ============================================================
  // LOAD BLOOD REQUESTS
  // ============================================================

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'bloodRequests'),
      snapshot => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as BloodRequestData[];

        setRequests(data);
      },
      err => {
        console.error(
          'Error loading blood requests:',
          err
        );

        setError(
          'Unable to load blood request analytics.'
        );
      }
    );

    return () => unsubscribe();
  }, []);

  // ============================================================
  // MONTHLY GROWTH
  // ============================================================

  const monthlyData = useMemo(() => {
    const months = getLastSixMonths();

    return months.map(month => {
      const donors = users.filter(user => {
        const date =
          toDate(user.createdAt);

        return (
          user.role === 'donor' &&
          date &&
          getMonthKey(date) === month.key
        );
      }).length;

      const recipients = users.filter(user => {
        const date =
          toDate(user.createdAt);

        return (
          user.role === 'recipient' &&
          date &&
          getMonthKey(date) === month.key
        );
      }).length;

      const monthlyDonations =
        donations.filter(donation => {
          const date =
            toDate(donation.createdAt) ||
            toDate(donation.offeredAt);

          return (
            date &&
            getMonthKey(date) === month.key
          );
        });

      const donationUnits =
        monthlyDonations.reduce(
          (total, donation) =>
            total +
            (typeof donation.units === 'number'
              ? donation.units
              : 1),
          0
        );

      const monthlyRequests =
        requests.filter(request => {
          const date =
            toDate(request.createdAt);

          return (
            date &&
            getMonthKey(date) === month.key
          );
        }).length;

      return {
        month: month.label,
        donors,
        recipients,
        donations: donationUnits,
        requests: monthlyRequests,
      };
    });
  }, [users, donations, requests]);

  // ============================================================
  // DAILY ACTIVITY - LAST 7 DAYS
  // ============================================================

  const dailyActivityData = useMemo(() => {
    const days = getLastSevenDays();

    return days.map(day => {
      const userActivity = users.filter(
        user => {
          const date =
            toDate(user.updatedAt) ||
            toDate(user.createdAt);

          return (
            date &&
            date.toISOString().slice(0, 10) ===
              day.key
          );
        }
      ).length;

      const donationActivity =
        donations.filter(donation => {
          const date =
            toDate(donation.updatedAt) ||
            toDate(donation.createdAt) ||
            toDate(donation.offeredAt);

          return (
            date &&
            date.toISOString().slice(0, 10) ===
              day.key
          );
        }).length;

      const requestActivity =
        requests.filter(request => {
          const date =
            toDate(request.updatedAt) ||
            toDate(request.createdAt);

          return (
            date &&
            date.toISOString().slice(0, 10) ===
              day.key
          );
        }).length;

      return {
        day: day.label,
        activity:
          userActivity +
          donationActivity +
          requestActivity,
      };
    });
  }, [users, donations, requests]);

  // ============================================================
  // MATCHING SUCCESS RATE - LAST 6 MONTHS
  // ============================================================

  const matchingRateData = useMemo(() => {
    const months = getLastSixMonths();

    return months.map(month => {
      const monthlyRequests =
        requests.filter(request => {
          const date =
            toDate(request.createdAt);

          return (
            date &&
            getMonthKey(date) === month.key
          );
        });

      const fulfilledRequests =
        monthlyRequests.filter(request => {
          const remaining =
            typeof request.quantity === 'number'
              ? request.quantity
              : request.unitsNeeded || 0;

          return (
            remaining <= 0 ||
            request.status === 'matched'
          );
        });

      const matchRate =
        monthlyRequests.length > 0
          ? Number(
              (
                (fulfilledRequests.length /
                  monthlyRequests.length) *
                100
              ).toFixed(1)
            )
          : 0;

      return {
        month: month.label,
        matchRate,
      };
    });
  }, [requests]);

  // ============================================================
  // TOTALS
  // ============================================================

  const totalUsers = users.length;

  const totalDonors = users.filter(
    user => user.role === 'donor'
  ).length;

  const totalRecipients = users.filter(
    user => user.role === 'recipient'
  ).length;

  const totalDonations = donations.reduce(
    (total, donation) =>
      total +
      (typeof donation.units === 'number'
        ? donation.units
        : 1),
    0
  );

  const completedDonations =
    donations.filter(
      donation =>
        donation.status === 'completed'
    );

  const completedUnits =
    completedDonations.reduce(
      (total, donation) =>
        total +
        (typeof donation.units === 'number'
          ? donation.units
          : 1),
      0
    );

  const totalRequests = requests.length;

  const fulfilledRequests =
    requests.filter(request => {
      const remaining =
        typeof request.quantity === 'number'
          ? request.quantity
          : request.unitsNeeded || 0;

      return (
        remaining <= 0 ||
        request.status === 'matched'
      );
    }).length;

  const overallMatchRate =
    totalRequests > 0
      ? (
          (fulfilledRequests /
            totalRequests) *
          100
        ).toFixed(1)
      : '0.0';

  // ============================================================
  // RESPONSE TIME
  //
  // Uses request creation time -> first donation offer
  // linked to that request.
  // ============================================================

  const averageResponseTime = useMemo(() => {
    const responseTimes: number[] = [];

    requests.forEach(request => {
      const requestDate =
        toDate(request.createdAt);

      if (!requestDate) return;

      const relatedDonations =
        donations.filter(
          donation =>
            donation.requestId ===
              request.id &&
            toDate(
              donation.offeredAt
            )
        );

      if (relatedDonations.length === 0) {
        return;
      }

      const firstDonation =
        relatedDonations
          .map(donation =>
            toDate(
              donation.offeredAt
            )
          )
          .filter(
            (date): date is Date =>
              date !== null
          )
          .sort(
            (a, b) =>
              a.getTime() -
              b.getTime()
          )[0];

      if (!firstDonation) return;

      const difference =
        firstDonation.getTime() -
        requestDate.getTime();

      if (difference >= 0) {
        responseTimes.push(
          difference / (1000 * 60 * 60)
        );
      }
    });

    if (responseTimes.length === 0) {
      return null;
    }

    const average =
      responseTimes.reduce(
        (sum, value) =>
          sum + value,
        0
      ) / responseTimes.length;

    return average;
  }, [requests, donations]);

  // ============================================================
  // ACTIVE USERS - LAST 30 DAYS
  //
  // Based on users with updatedAt/createdAt activity
  // within the last 30 days.
  // ============================================================

  const activeUsers30Days = useMemo(() => {
    const cutoff = new Date();

    cutoff.setDate(
      cutoff.getDate() - 30
    );

    return users.filter(user => {
      const date =
        toDate(user.updatedAt) ||
        toDate(user.createdAt);

      return date && date >= cutoff;
    }).length;
  }, [users]);

  // ============================================================
  // DONATIONS PER ACTIVE DONOR - LAST 30 DAYS
  // ============================================================

  const donationsPerActiveDonor =
    useMemo(() => {
      const cutoff = new Date();

      cutoff.setDate(
        cutoff.getDate() - 30
      );

      const recentDonations =
        donations.filter(donation => {
          const date =
            toDate(donation.createdAt) ||
            toDate(donation.offeredAt);

          return (
            date &&
            date >= cutoff
          );
        });

      const activeDonorIds =
        new Set(
          recentDonations
            .map(
              donation =>
                donation.donorId
            )
            .filter(Boolean)
        );

      if (
        activeDonorIds.size === 0
      ) {
        return null;
      }

      const totalUnits =
        recentDonations.reduce(
          (total, donation) =>
            total +
            (typeof donation.units ===
            'number'
              ? donation.units
              : 1),
          0
        );

      return (
        totalUnits /
        activeDonorIds.size
      );
    }, [donations]);

  // ============================================================
  // STATUS HELPERS
  // ============================================================

  const formatResponseTime = () => {
    if (
      averageResponseTime === null
    ) {
      return 'N/A';
    }

    if (
      averageResponseTime < 1
    ) {
      return `${Math.round(
        averageResponseTime * 60
      )} min`;
    }

    return `${averageResponseTime.toFixed(
      1
    )} hrs`;
  };

  const formatDonationsPerDonor = () => {
    if (
      donationsPerActiveDonor === null
    ) {
      return 'N/A';
    }

    return donationsPerActiveDonor.toFixed(
      1
    );
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          Analytics
        </h1>

        <p className="text-foreground/60 mt-2">
          Platform performance and user metrics
        </p>
      </div>

      {/* ====================================================== */}
      {/* ERROR */}
      {/* ====================================================== */}

      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              {error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ====================================================== */}
      {/* OVERVIEW CARDS */}
      {/* ====================================================== */}

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">

        <Card className="border-border">
          <CardContent className="pt-6">

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground/60">
                  Total Users
                </p>

                <p className="text-3xl font-bold text-foreground mt-1">
                  {loading
                    ? '—'
                    : totalUsers}
                </p>
              </div>

              <Users className="w-8 h-8 text-primary" />
            </div>

          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground/60">
                  Total Donations
                </p>

                <p className="text-3xl font-bold text-foreground mt-1">
                  {loading
                    ? '—'
                    : totalDonations}
                </p>
              </div>

              <Droplet className="w-8 h-8 text-primary fill-primary" />
            </div>

          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground/60">
                  Blood Requests
                </p>

                <p className="text-3xl font-bold text-foreground mt-1">
                  {loading
                    ? '—'
                    : totalRequests}
                </p>
              </div>

              <ClipboardList className="w-8 h-8 text-primary" />
            </div>

          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground/60">
                  Matching Success
                </p>

                <p className="text-3xl font-bold text-foreground mt-1">
                  {loading
                    ? '—'
                    : `${overallMatchRate}%`}
                </p>
              </div>

              <HeartPulse className="w-8 h-8 text-primary" />
            </div>

          </CardContent>
        </Card>

      </div>

      {/* ====================================================== */}
      {/* MONTHLY GROWTH */}
      {/* ====================================================== */}

      <Card className="border-border">

        <CardHeader>
          <CardTitle>
            Monthly Growth
          </CardTitle>

          <CardDescription>
            Actual users, donations, and requests recorded over the last six months
          </CardDescription>
        </CardHeader>

        <CardContent>

          {loading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={300}
            >
              <BarChart
                data={monthlyData}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                />

                <XAxis
                  dataKey="month"
                />

                <YAxis />

                <Tooltip />

                <Legend />

                <Bar
                  dataKey="donors"
                  name="New Donors"
                  fill="#ef4444"
                />

                <Bar
                  dataKey="recipients"
                  name="New Recipients"
                  fill="#0ea5e9"
                />

                <Bar
                  dataKey="donations"
                  name="Donated Units"
                  fill="#22c55e"
                />

                <Bar
                  dataKey="requests"
                  name="Blood Requests"
                  fill="#a855f7"
                />

              </BarChart>
            </ResponsiveContainer>
          )}

        </CardContent>

      </Card>

      {/* ====================================================== */}
      {/* DAILY ACTIVITY + MATCHING */}
      {/* ====================================================== */}

      <div className="grid lg:grid-cols-2 gap-6">

        {/* Daily Activity */}
        <Card className="border-border">

          <CardHeader>
            <CardTitle>
              Daily Activity
            </CardTitle>

            <CardDescription>
              Actual platform activity recorded during the last 7 days
            </CardDescription>
          </CardHeader>

          <CardContent>

            {loading ? (
              <div className="flex items-center justify-center h-[250px]">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={250}
              >
                <AreaChart
                  data={
                    dailyActivityData
                  }
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="day"
                  />

                  <YAxis />

                  <Tooltip />

                  <Area
                    type="monotone"
                    dataKey="activity"
                    name="Activity"
                    fill="#ef4444"
                    stroke="#ef4444"
                  />

                </AreaChart>
              </ResponsiveContainer>
            )}

          </CardContent>

        </Card>

        {/* Matching Rate */}
        <Card className="border-border">

          <CardHeader>
            <CardTitle>
              Matching Success Rate
            </CardTitle>

            <CardDescription>
              Percentage of blood requests fulfilled by matching
            </CardDescription>
          </CardHeader>

          <CardContent>

            {loading ? (
              <div className="flex items-center justify-center h-[250px]">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={250}
              >
                <LineChart
                  data={
                    matchingRateData
                  }
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="month"
                  />

                  <YAxis
                    domain={[0, 100]}
                  />

                  <Tooltip
                    formatter={(
                      value
                    ) =>
                      [
                        `${value}%`,
                        'Match Rate',
                      ]
                    }
                  />

                  <Line
                    type="monotone"
                    dataKey="matchRate"
                    name="Match Rate"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{
                      fill: '#22c55e',
                    }}
                  />

                </LineChart>
              </ResponsiveContainer>
            )}

          </CardContent>

        </Card>

      </div>

      {/* ====================================================== */}
      {/* KEY INSIGHTS */}
      {/* ====================================================== */}

      <div className="grid md:grid-cols-3 gap-6">

        {/* Response Time */}
        <Card className="border-border">

          <CardHeader>

            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Avg. Response Time
            </CardTitle>

            <CardDescription>
              Average time from request creation to the first donor offer
            </CardDescription>

          </CardHeader>

          <CardContent>

            <div className="text-3xl font-bold text-foreground">
              {loading
                ? '—'
                : formatResponseTime()}
            </div>

            <p className="text-xs text-foreground/60 mt-2">
              Calculated from linked request and donation timestamps
            </p>

          </CardContent>

        </Card>

        {/* Active Users */}
        <Card className="border-border">

          <CardHeader>

            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              Active Users
            </CardTitle>

            <CardDescription>
              Users with activity recorded in the last 30 days
            </CardDescription>

          </CardHeader>

          <CardContent>

            <div className="text-3xl font-bold text-foreground">
              {loading
                ? '—'
                : activeUsers30Days}
            </div>

            <p className="text-xs text-foreground/60 mt-2">
              Based on available user timestamps
            </p>

          </CardContent>

        </Card>

        {/* Donations Per Active Donor */}
        <Card className="border-border">

          <CardHeader>

            <CardTitle className="text-base flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-primary" />
              Donations / Active Donor
            </CardTitle>

            <CardDescription>
              Average donated units per donor active in the last 30 days
            </CardDescription>

          </CardHeader>

          <CardContent>

            <div className="text-3xl font-bold text-foreground">
              {loading
                ? '—'
                : formatDonationsPerDonor()}
            </div>

            <p className="text-xs text-foreground/60 mt-2">
              Calculated from actual donation records
            </p>

          </CardContent>

        </Card>

      </div>

      {/* ====================================================== */}
      {/* DATA SUMMARY */}
      {/* ====================================================== */}

      <Card className="border-border">

        <CardHeader>
          <CardTitle>
            Current Platform Statistics
          </CardTitle>

          <CardDescription>
            Live totals from the Firestore collections
          </CardDescription>
        </CardHeader>

        <CardContent>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            <div className="p-4 border border-border rounded-lg">
              <p className="text-xs text-foreground/60">
                Donors
              </p>

              <p className="text-2xl font-bold text-foreground mt-1">
                {loading
                  ? '—'
                  : totalDonors}
              </p>
            </div>

            <div className="p-4 border border-border rounded-lg">
              <p className="text-xs text-foreground/60">
                Recipients
              </p>

              <p className="text-2xl font-bold text-foreground mt-1">
                {loading
                  ? '—'
                  : totalRecipients}
              </p>
            </div>

            <div className="p-4 border border-border rounded-lg">
              <p className="text-xs text-foreground/60">
                Completed Donation Units
              </p>

              <p className="text-2xl font-bold text-foreground mt-1">
                {loading
                  ? '—'
                  : completedUnits}
              </p>
            </div>

            <div className="p-4 border border-border rounded-lg">
              <p className="text-xs text-foreground/60">
                Fulfilled Requests
              </p>

              <p className="text-2xl font-bold text-foreground mt-1">
                {loading
                  ? '—'
                  : fulfilledRequests}
              </p>
            </div>

          </div>

        </CardContent>

      </Card>

    </div>
  );
}