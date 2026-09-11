'use client';

import { useEffect, useMemo, useState } from 'react';

import { db } from '@/lib/firebase';

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

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

import {
  Users,
  Droplet,
  Heart,
  TrendingUp,
  AlertCircle,
  Loader2,
} from 'lucide-react';

import Link from 'next/link';

interface UserData {
  id: string;
  role?: string;
  name?: string;
  bloodType?: string;
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
  completedAt?: any;
}

interface BloodRequestData {
  id: string;
  recipientId?: string;
  bloodType?: string;
  unitsNeeded?: number;
  quantity?: number;
  matchedDonors?: string[];
  unitsReceivedOutside?: number;
  urgency?: string;
  status?: string;
  createdAt?: any;
  updatedAt?: any;
}

const BLOOD_TYPES = [
  'O-',
  'O+',
  'A-',
  'A+',
  'B-',
  'B+',
  'AB-',
  'AB+',
];

const CHART_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#0ea5e9',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
];

function toDate(value: any): Date | null {
  if (!value) return null;

  try {
    if (value instanceof Date) {
      return isNaN(value.getTime())
        ? null
        : value;
    }

    if (
      typeof value?.toDate === 'function'
    ) {
      const date = value.toDate();

      return isNaN(date.getTime())
        ? null
        : date;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number'
    ) {
      const date = new Date(value);

      return isNaN(date.getTime())
        ? null
        : date;
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

function getLastSixMonths() {
  const months: {
    key: string;
    label: string;
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
      label: date.toLocaleString(
        'en-US',
        {
          month: 'short',
        }
      ),
    });
  }

  return months;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<
    UserData[]
  >([]);

  const [donations, setDonations] =
    useState<DonationData[]>([]);

  const [requests, setRequests] =
    useState<BloodRequestData[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  // ============================================================
  // LOAD USERS
  // ============================================================

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      snapshot => {
        const data =
          snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as UserData[];

        setUsers(data);
        setLoading(false);
      },
      error => {
        console.error(
          'Error loading users:',
          error
        );

        setError(
          'Unable to load dashboard data.'
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
        const data =
          snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as DonationData[];

        setDonations(data);
      },
      error => {
        console.error(
          'Error loading donations:',
          error
        );

        setError(
          'Unable to load donation data.'
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
        const data =
          snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as BloodRequestData[];

        setRequests(data);
      },
      error => {
        console.error(
          'Error loading blood requests:',
          error
        );

        setError(
          'Unable to load blood request data.'
        );
      }
    );

    return () => unsubscribe();
  }, []);

  // ============================================================
  // BASIC COUNTS
  // ============================================================

  const totalDonors = users.filter(
    user => user.role === 'donor'
  ).length;

  const totalRecipients = users.filter(
    user => user.role === 'recipient'
  ).length;

  const completedDonations =
    donations.filter(
      donation =>
        donation.status === 'completed'
    );

  const completedDonationUnits =
    completedDonations.reduce(
      (total, donation) =>
        total +
        (typeof donation.units ===
        'number'
          ? donation.units
          : 1),
      0
    );

  const openRequests = requests.filter(
    request =>
      request.status === 'open' &&
      (typeof request.quantity !==
        'number' ||
        request.quantity > 0)
  ).length;

  const fulfilledRequests =
    requests.filter(request => {
      const remaining =
        typeof request.quantity ===
        'number'
          ? request.quantity
          : Math.max(
              0,
              (request.unitsNeeded ||
                0) -
                (Array.isArray(
                  request.matchedDonors
                )
                  ? request
                      .matchedDonors.length
                  : 0) -
                (request
                  .unitsReceivedOutside ||
                  0)
            );

      return (
        remaining <= 0 ||
        request.status === 'matched'
      );
    }).length;

  const successRate =
    requests.length > 0
      ? (fulfilledRequests /
          requests.length) *
        100
      : 0;

  // ============================================================
  // MONTHLY DONATION + REQUEST TREND
  // ============================================================

  const donationTrendData = useMemo(() => {
    const months =
      getLastSixMonths();

    return months.map(month => {
      const monthlyDonations =
        donations.filter(donation => {
          const date =
            toDate(
              donation.completedAt
            ) ||
            toDate(
              donation.createdAt
            ) ||
            toDate(
              donation.offeredAt
            );

          return (
            date &&
            getMonthKey(date) ===
              month.key
          );
        });

      const monthlyRequests =
        requests.filter(request => {
          const date =
            toDate(
              request.createdAt
            );

          return (
            date &&
            getMonthKey(date) ===
              month.key
          );
        });

      const donationUnits =
        monthlyDonations.reduce(
          (total, donation) =>
            total +
            (typeof donation.units ===
            'number'
              ? donation.units
              : 1),
          0
        );

      return {
        month: month.label,
        donations: donationUnits,
        requests:
          monthlyRequests.length,
      };
    });
  }, [donations, requests]);

  // ============================================================
  // BLOOD TYPE DISTRIBUTION
  // ============================================================

  const bloodTypeDistribution =
    useMemo(() => {
      const completedByType =
        BLOOD_TYPES.map(type => {
          const units =
            completedDonations
              .filter(
                donation =>
                  donation.bloodType ===
                  type
              )
              .reduce(
                (total, donation) =>
                  total +
                  (typeof donation.units ===
                  'number'
                    ? donation.units
                    : 1),
                0
              );

          return {
            name: type,
            units,
          };
        });

      const totalUnits =
        completedByType.reduce(
          (total, item) =>
            total + item.units,
          0
        );

      return completedByType.map(
        (item, index) => ({
          ...item,
          value:
            totalUnits > 0
              ? Number(
                  (
                    (item.units /
                      totalUnits) *
                    100
                  ).toFixed(1)
                )
              : 0,
          fill:
            CHART_COLORS[index],
        })
      );
    }, [completedDonations]);

  // ============================================================
  // RECENT REQUESTS
  // ============================================================

  const recentRequests =
    useMemo(() => {
      return [...requests]
        .sort((a, b) => {
          const aDate =
            toDate(a.createdAt)
              ?.getTime() || 0;

          const bDate =
            toDate(b.createdAt)
              ?.getTime() || 0;

          return bDate - aDate;
        })
        .slice(0, 5);
    }, [requests]);

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">

          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />

          <p className="text-foreground">
            Loading admin dashboard...
          </p>

        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div className="space-y-2">

        <h1 className="text-3xl font-bold text-foreground">
          Admin Dashboard
        </h1>

        <p className="text-foreground/60">
          System overview and live analytics
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
      {/* KEY METRICS */}
      {/* ====================================================== */}

      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">

        {/* Donors */}
        <Card className="border-border">

          <CardHeader className="pb-3">

            <CardTitle className="text-sm font-medium flex items-center gap-2">

              <Heart className="w-4 h-4 text-primary" />

              Total Donors

            </CardTitle>

          </CardHeader>

          <CardContent>

            <div className="text-3xl font-bold text-foreground">
              {totalDonors}
            </div>

            <p className="text-xs text-foreground/60 mt-2">
              Registered donor accounts
            </p>

          </CardContent>

        </Card>

        {/* Recipients */}
        <Card className="border-border">

          <CardHeader className="pb-3">

            <CardTitle className="text-sm font-medium flex items-center gap-2">

              <Users className="w-4 h-4 text-primary" />

              Total Recipients

            </CardTitle>

          </CardHeader>

          <CardContent>

            <div className="text-3xl font-bold text-foreground">
              {totalRecipients}
            </div>

            <p className="text-xs text-foreground/60 mt-2">
              Registered recipient accounts
            </p>

          </CardContent>

        </Card>

        {/* Donations */}
        <Card className="border-border">

          <CardHeader className="pb-3">

            <CardTitle className="text-sm font-medium flex items-center gap-2">

              <Droplet className="w-4 h-4 text-primary" />

              Completed Donations

            </CardTitle>

          </CardHeader>

          <CardContent>

            <div className="text-3xl font-bold text-foreground">
              {completedDonationUnits}
            </div>

            <p className="text-xs text-foreground/60 mt-2">
              Successfully completed units
            </p>

          </CardContent>

        </Card>

        {/* Requests */}
        <Card className="border-border">

          <CardHeader className="pb-3">

            <CardTitle className="text-sm font-medium flex items-center gap-2">

              <AlertCircle className="w-4 h-4 text-primary" />

              Blood Requests

            </CardTitle>

          </CardHeader>

          <CardContent>

            <div className="text-3xl font-bold text-foreground">
              {requests.length}
            </div>

            <p className="text-xs text-foreground/60 mt-2">
              {openRequests} currently open
            </p>

          </CardContent>

        </Card>

        {/* Success Rate */}
        <Card className="border-border">

          <CardHeader className="pb-3">

            <CardTitle className="text-sm font-medium flex items-center gap-2">

              <TrendingUp className="w-4 h-4 text-primary" />

              Success Rate

            </CardTitle>

          </CardHeader>

          <CardContent>

            <div className="text-3xl font-bold text-foreground">
              {successRate.toFixed(1)}%
            </div>

            <p className="text-xs text-foreground/60 mt-2">
              Fulfilled blood requests
            </p>

          </CardContent>

        </Card>

      </div>

      {/* ====================================================== */}
      {/* CHARTS */}
      {/* ====================================================== */}

      <div className="grid lg:grid-cols-2 gap-6">

        {/* Donation & Request Trends */}
        <Card className="border-border">

          <CardHeader>

            <CardTitle>
              Donation & Request Trends
            </CardTitle>

            <CardDescription>
              Actual monthly activity for the last six months
            </CardDescription>

          </CardHeader>

          <CardContent>

            <ResponsiveContainer
              width="100%"
              height={300}
            >

              <BarChart
                data={donationTrendData}
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
                  dataKey="donations"
                  name="Completed Donations"
                  fill="#ef4444"
                />

                <Bar
                  dataKey="requests"
                  name="Blood Requests"
                  fill="#0ea5e9"
                />

              </BarChart>

            </ResponsiveContainer>

          </CardContent>

        </Card>

        {/* Blood Type Distribution */}
        <Card className="border-border">

          <CardHeader>

            <CardTitle>
              Blood Type Distribution
            </CardTitle>

            <CardDescription>
              Distribution of completed donated units by blood type
            </CardDescription>

          </CardHeader>

          <CardContent className="flex justify-center">

            {bloodTypeDistribution.every(
              item => item.units === 0
            ) ? (

              <div className="h-[300px] flex items-center justify-center text-center">

                <div>

                  <Droplet className="w-10 h-10 text-foreground/30 mx-auto mb-3" />

                  <p className="text-sm text-foreground/60">
                    No completed donations yet.
                  </p>

                </div>

              </div>

            ) : (

              <ResponsiveContainer
                width="100%"
                height={300}
              >

                <PieChart>

                  <Pie
                    data={
                      bloodTypeDistribution
                    }
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({
                      name,
                      value,
                    }) =>
                      `${name}: ${value}%`
                    }
                    outerRadius={100}
                    dataKey="value"
                  >

                    {bloodTypeDistribution.map(
                      (
                        entry,
                        index
                      ) => (

                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.fill
                          }
                        />

                      )
                    )}

                  </Pie>

                  <Tooltip
                    formatter={(
                      value,
                      _name,
                      item
                    ) => [
                      `${value}%`,
                      `${item.payload.name} (${item.payload.units} units)`,
                    ]}
                  />

                </PieChart>

              </ResponsiveContainer>

            )}

          </CardContent>

        </Card>

      </div>

      {/* ====================================================== */}
      {/* RECENT REQUESTS */}
      {/* ====================================================== */}

      <Card className="border-border">

        <CardHeader>

          <CardTitle>
            Recent Blood Requests
          </CardTitle>

          <CardDescription>
            Latest requests recorded in the system
          </CardDescription>

        </CardHeader>

        <CardContent>

          {recentRequests.length === 0 ? (

            <div className="text-center py-8">

              <Droplet className="w-8 h-8 text-foreground/30 mx-auto mb-2" />

              <p className="text-sm text-foreground/60">
                No blood requests have been created yet.
              </p>

            </div>

          ) : (

            <div className="space-y-3">

              {recentRequests.map(
                request => {

                  const status =
                    request.status ||
                    'open';

                  const matchedCount =
                    Array.isArray(
                      request.matchedDonors
                    )
                      ? request
                          .matchedDonors
                          .length
                      : 0;

                  return (

                    <div
                      key={request.id}
                      className="flex items-center justify-between gap-4 p-4 border border-border rounded-lg"
                    >

                      <div className="flex items-center gap-4">

                        <Badge className="bg-primary/20 text-primary border-primary/30">
                          {request.bloodType ||
                            'N/A'}
                        </Badge>

                        <div>

                          <p className="font-semibold text-foreground">
                            {request.unitsNeeded ||
                              request.quantity ||
                              0}{' '}
                            {(request.unitsNeeded ||
                              request.quantity ||
                              0) ===
                            1
                              ? 'unit'
                              : 'units'}{' '}
                            required
                          </p>

                          <p className="text-xs text-foreground/60 mt-1 font-mono">
                            #{request.id}
                          </p>

                        </div>

                      </div>

                      <div className="flex items-center gap-3">

                        <Badge variant="outline">
                          {matchedCount}{' '}
                          matched
                        </Badge>

                        <Badge>
                          {status}
                        </Badge>

                      </div>

                    </div>

                  );
                }
              )}

            </div>

          )}

        </CardContent>

      </Card>

      {/* ====================================================== */}
      {/* QUICK ACTIONS */}
      {/* ====================================================== */}

      <div className="grid md:grid-cols-3 gap-6">

        {/* Users */}
        <Card className="border-border">

          <CardHeader>

            <CardTitle className="text-base">
              Manage Users
            </CardTitle>

            <CardDescription>
              View and manage all users
            </CardDescription>

          </CardHeader>

          <CardContent>

            <Link href="/admin/users">

              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                Go to Users
              </Button>

            </Link>

          </CardContent>

        </Card>

        {/* Requests */}
        <Card className="border-border">

          <CardHeader>

            <CardTitle className="text-base">
              Blood Requests
            </CardTitle>

            <CardDescription>
              Monitor recipient blood requests
            </CardDescription>

          </CardHeader>

          <CardContent>

            <Link href="/admin/requests">

              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                View Requests
              </Button>

            </Link>

          </CardContent>

        </Card>

        {/* Reports */}
        <Card className="border-border">

          <CardHeader>

            <CardTitle className="text-base">
              Reports
            </CardTitle>

            <CardDescription>
              Generate reports from live system data
            </CardDescription>

          </CardHeader>

          <CardContent>

            <Link href="/admin/reports">

              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                View Reports
              </Button>

            </Link>

          </CardContent>

        </Card>

      </div>

    </div>
  );
}