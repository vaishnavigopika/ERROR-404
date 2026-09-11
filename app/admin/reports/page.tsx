'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
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
  FileDown,
  Calendar,
  Users,
  Droplet,
  HeartPulse,
  ClipboardList,
  Loader2,
} from 'lucide-react';

import { db } from '@/lib/firebase';
import { BLOOD_TYPES } from '@/lib/bloodCompatibility';

type ReportType =
  | 'Activity Report'
  | 'User Analytics'
  | 'Blood Statistics'
  | 'Matching Performance';

type DateRange =
  | 'Last 7 days'
  | 'Last 30 days'
  | 'Last quarter'
  | 'Last year';

interface UserData {
  role?: string;
  createdAt?: any;
}

interface DonationData {
  bloodType?: string;
  units?: number;
  status?: string;
  offeredAt?: any;
  createdAt?: any;
}

interface BloodRequestData {
  bloodType?: string;
  unitsNeeded?: number;
  quantity?: number;
  matchedDonors?: string[];
  unitsReceivedOutside?: number;
  status?: string;
  createdAt?: any;
}

function toDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !isNaN(date.getTime())
      ? date
      : null;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);

    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function getStartDate(range: DateRange): Date {
  const now = new Date();

  if (range === 'Last 7 days') {
    now.setDate(now.getDate() - 7);
  }

  if (range === 'Last 30 days') {
    now.setDate(now.getDate() - 30);
  }

  if (range === 'Last quarter') {
    now.setMonth(now.getMonth() - 3);
  }

  if (range === 'Last year') {
    now.setFullYear(now.getFullYear() - 1);
  }

  return now;
}

function escapeCsv(value: any): string {
  const stringValue = String(value ?? '');

  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function downloadCsv(
  filename: string,
  rows: Array<Array<string | number>>
) {
  const csv = rows
    .map(row => row.map(escapeCsv).join(','))
    .join('\n');

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export default function AdminReportsPage() {
  const [reportType, setReportType] =
    useState<ReportType>('Activity Report');

  const [dateRange, setDateRange] =
    useState<DateRange>('Last 30 days');

  const [users, setUsers] = useState<UserData[]>([]);
  const [donations, setDonations] = useState<DonationData[]>([]);
  const [requests, setRequests] = useState<BloodRequestData[]>([]);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadReportData() {
      try {
        setLoading(true);
        setError('');

        const [
          usersSnapshot,
          donationsSnapshot,
          requestsSnapshot,
        ] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'donations')),
          getDocs(collection(db, 'bloodRequests')),
        ]);

        setUsers(
          usersSnapshot.docs.map(doc => ({
            ...doc.data(),
          }))
        );

        setDonations(
          donationsSnapshot.docs.map(doc => ({
            ...doc.data(),
          }))
        );

        setRequests(
          requestsSnapshot.docs.map(doc => ({
            ...doc.data(),
          }))
        );
      } catch (err) {
        console.error('Failed to load report data:', err);
        setError(
          'Unable to load report data. Please check your Firebase connection.'
        );
      } finally {
        setLoading(false);
      }
    }

    loadReportData();
  }, []);

  const filteredDonations = useMemo(() => {
    const startDate = getStartDate(dateRange);

    return donations.filter(donation => {
      const date =
        toDate(donation.offeredAt) ||
        toDate(donation.createdAt);

      if (!date) return false;

      return date >= startDate;
    });
  }, [donations, dateRange]);

  const filteredRequests = useMemo(() => {
    const startDate = getStartDate(dateRange);

    return requests.filter(request => {
      const date = toDate(request.createdAt);

      if (!date) return false;

      return date >= startDate;
    });
  }, [requests, dateRange]);

  const completedDonations = filteredDonations.filter(
    donation => donation.status === 'completed'
  );

  const completedDonationUnits = completedDonations.reduce(
    (total, donation) =>
      total +
      (typeof donation.units === 'number'
        ? donation.units
        : 1),
    0
  );

  const totalDonations = filteredDonations.length;

  const totalUsers = users.length;

  const donors = users.filter(
    user => user.role === 'donor'
  ).length;

  const recipients = users.filter(
    user => user.role === 'recipient'
  ).length;

  const admins = users.filter(
    user => user.role === 'admin'
  ).length;

  const fulfilledRequests = filteredRequests.filter(
    request => {
      const remaining =
        typeof request.quantity === 'number'
          ? request.quantity
          : Math.max(
              0,
              (request.unitsNeeded || 0) -
                (Array.isArray(request.matchedDonors)
                  ? request.matchedDonors.length
                  : 0) -
                (request.unitsReceivedOutside || 0)
            );

      return (
        remaining <= 0 ||
        request.status === 'matched'
      );
    }
  ).length;

  const openRequests = filteredRequests.filter(
    request =>
      request.status === 'open' &&
      (typeof request.quantity !== 'number' ||
        request.quantity > 0)
  ).length;

  const fulfillmentRate =
    filteredRequests.length > 0
      ? (
          (fulfilledRequests /
            filteredRequests.length) *
          100
        ).toFixed(1)
      : '0.0';

  const bloodTypeStats = BLOOD_TYPES.map(type => {
    const count = completedDonations
      .filter(
        donation => donation.bloodType === type
      )
      .reduce(
        (total, donation) =>
          total +
          (typeof donation.units === 'number'
            ? donation.units
            : 1),
        0
      );

    return {
      type,
      units: count,
    };
  });

  async function generateReport() {
    try {
      setGenerating(true);

      const dateLabel = new Date()
        .toISOString()
        .slice(0, 10);

      if (reportType === 'Activity Report') {
        downloadCsv(
          `activity-report-${dateLabel}.csv`,
          [
            ['Activity Report'],
            ['Date Range', dateRange],
            [],
            ['Metric', 'Value'],
            ['Total Users', totalUsers],
            ['Total Donors', donors],
            ['Total Recipients', recipients],
            ['Total Donations', totalDonations],
            ['Completed Donations', completedDonations.length],
            ['Completed Donation Units', completedDonationUnits],
            ['Total Blood Requests', filteredRequests.length],
            ['Open Requests', openRequests],
            ['Fulfilled Requests', fulfilledRequests],
            ['Fulfillment Rate', `${fulfillmentRate}%`],
          ]
        );
      }

      if (reportType === 'User Analytics') {
        downloadCsv(
          `user-analytics-${dateLabel}.csv`,
          [
            ['User Analytics Report'],
            ['Date Range', dateRange],
            [],
            ['Role', 'Count'],
            ['Total Users', totalUsers],
            ['Donors', donors],
            ['Recipients', recipients],
            ['Admins', admins],
          ]
        );
      }

      if (reportType === 'Blood Statistics') {
        downloadCsv(
          `blood-statistics-${dateLabel}.csv`,
          [
            ['Blood Donation Statistics'],
            ['Date Range', dateRange],
            [],
            ['Blood Type', 'Completed Units'],
            ...bloodTypeStats.map(item => [
              item.type,
              item.units,
            ]),
            [],
            ['Total Completed Units', completedDonationUnits],
          ]
        );
      }

      if (reportType === 'Matching Performance') {
        downloadCsv(
          `matching-performance-${dateLabel}.csv`,
          [
            ['Matching Performance Report'],
            ['Date Range', dateRange],
            [],
            ['Metric', 'Value'],
            ['Total Requests', filteredRequests.length],
            ['Open Requests', openRequests],
            ['Fulfilled Requests', fulfilledRequests],
            [
              'Fulfillment Rate',
              `${fulfillmentRate}%`,
            ],
          ]
        );
      }
    } catch (err) {
      console.error('Report generation failed:', err);
      setError('Failed to generate the report.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          Reports
        </h1>

        <p className="text-foreground/60 mt-2">
          Generate reports using live system data
        </p>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              {error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Generate Report */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>
            Generate New Report
          </CardTitle>

          <CardDescription>
            Create a report using the current Firestore data
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Report Type
              </label>

              <select
                value={reportType}
                onChange={event =>
                  setReportType(
                    event.target.value as ReportType
                  )
                }
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
              >
                <option>Activity Report</option>
                <option>User Analytics</option>
                <option>Blood Statistics</option>
                <option>Matching Performance</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Date Range
              </label>

              <select
                value={dateRange}
                onChange={event =>
                  setDateRange(
                    event.target.value as DateRange
                  )
                }
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
              >
                <option>Last 7 days</option>
                <option>Last 30 days</option>
                <option>Last quarter</option>
                <option>Last year</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Format
              </label>

              <select
                disabled
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground opacity-70"
              >
                <option>CSV</option>
              </select>
            </div>
          </div>

          <Button
            onClick={generateReport}
            disabled={loading || generating}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4 mr-2" />
            )}

            {generating
              ? 'Generating...'
              : 'Generate Report'}
          </Button>
        </CardContent>
      </Card>

      {/* Live Statistics */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="pt-6">
            <Users className="w-5 h-5 text-primary mb-3" />

            <p className="text-sm text-foreground/60">
              Total Users
            </p>

            <p className="text-2xl font-bold text-foreground">
              {loading ? '—' : totalUsers}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <Droplet className="w-5 h-5 text-primary mb-3" />

            <p className="text-sm text-foreground/60">
              Completed Donations
            </p>

            <p className="text-2xl font-bold text-foreground">
              {loading
                ? '—'
                : completedDonationUnits}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <ClipboardList className="w-5 h-5 text-primary mb-3" />

            <p className="text-sm text-foreground/60">
              Blood Requests
            </p>

            <p className="text-2xl font-bold text-foreground">
              {loading
                ? '—'
                : filteredRequests.length}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <HeartPulse className="w-5 h-5 text-primary mb-3" />

            <p className="text-sm text-foreground/60">
              Fulfillment Rate
            </p>

            <p className="text-2xl font-bold text-foreground">
              {loading
                ? '—'
                : `${fulfillmentRate}%`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Report */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>
            Current Report Data
          </CardTitle>

          <CardDescription>
            Live values that will be included in the generated report
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <span className="text-foreground">
                  Report Type
                </span>

                <Badge variant="outline">
                  {reportType}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <span className="flex items-center gap-2 text-foreground">
                  <Calendar className="w-4 h-4" />
                  Date Range
                </span>

                <span className="font-semibold text-foreground">
                  {dateRange}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <span className="text-foreground">
                  Donations in Range
                </span>

                <span className="font-semibold text-foreground">
                  {totalDonations}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <span className="text-foreground">
                  Completed Donation Units
                </span>

                <span className="font-semibold text-foreground">
                  {completedDonationUnits}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <span className="text-foreground">
                  Blood Requests
                </span>

                <span className="font-semibold text-foreground">
                  {filteredRequests.length}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <span className="text-foreground">
                  Fulfilled Requests
                </span>

                <span className="font-semibold text-foreground">
                  {fulfilledRequests}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blood Statistics */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>
            Completed Donations by Blood Type
          </CardTitle>

          <CardDescription>
            Based only on completed donation records in the selected period
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {bloodTypeStats.map(item => (
              <div
                key={item.type}
                className="p-4 border border-border rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    {item.type}
                  </span>

                  <Droplet className="w-4 h-4 text-primary fill-primary" />
                </div>

                <p className="text-2xl font-bold text-foreground mt-2">
                  {loading ? '—' : item.units}
                </p>

                <p className="text-xs text-foreground/60">
                  completed units
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}