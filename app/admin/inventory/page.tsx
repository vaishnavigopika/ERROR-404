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

import { Badge } from '@/components/ui/badge';

import {
  Droplet,
  AlertTriangle,
  Loader2,
  PackageCheck,
} from 'lucide-react';

import { db } from '@/lib/firebase';
import { BLOOD_TYPES } from '@/lib/bloodCompatibility';

interface DonationData {
  bloodType?: string;
  units?: number;
  status?: string;
}

type StockStatus =
  | 'critical'
  | 'low'
  | 'normal';

interface BloodInventory {
  type: string;
  units: number;
  status: StockStatus;
}

function getStockStatus(units: number): StockStatus {
  if (units <= 2) {
    return 'critical';
  }

  if (units <= 5) {
    return 'low';
  }

  return 'normal';
}

export default function AdminInventoryPage() {
  const [donations, setDonations] =
    useState<DonationData[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  useEffect(() => {
    async function loadInventory() {
      try {
        setLoading(true);
        setError('');

        const snapshot = await getDocs(
          collection(db, 'donations')
        );

        const donationData =
          snapshot.docs.map(doc => ({
            ...doc.data(),
          })) as DonationData[];

        setDonations(donationData);
      } catch (err) {
        console.error(
          'Failed to load blood inventory:',
          err
        );

        setError(
          'Unable to load blood donation data. Please check your Firebase connection.'
        );
      } finally {
        setLoading(false);
      }
    }

    loadInventory();
  }, []);

  const bloodInventory =
    useMemo<BloodInventory[]>(() => {
      return BLOOD_TYPES.map(type => {
        const units = donations
          .filter(
            donation =>
              donation.status === 'completed' &&
              donation.bloodType === type
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
          units,
          status: getStockStatus(units),
        };
      });
    }, [donations]);

  const totalCompletedUnits =
    bloodInventory.reduce(
      (total, item) =>
        total + item.units,
      0
    );

  const lowStockItems =
    bloodInventory.filter(
      item => item.status !== 'normal'
    );

  const criticalItems =
    bloodInventory.filter(
      item => item.status === 'critical'
    );

  function getStatusClass(
    status: StockStatus
  ) {
    if (status === 'critical') {
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
    }

    if (status === 'low') {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
    }

    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          Blood Inventory
        </h1>

        <p className="text-foreground/60 mt-2">
          View blood availability based on completed donations
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

      {/* Overall Summary */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground/60">
                  Completed Units
                </p>

                <p className="text-3xl font-bold text-foreground mt-1">
                  {loading
                    ? '—'
                    : totalCompletedUnits}
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
                  Low / Critical Types
                </p>

                <p className="text-3xl font-bold text-foreground mt-1">
                  {loading
                    ? '—'
                    : lowStockItems.length}
                </p>
              </div>

              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground/60">
                  Blood Types Tracked
                </p>

                <p className="text-3xl font-bold text-foreground mt-1">
                  {BLOOD_TYPES.length}
                </p>
              </div>

              <PackageCheck className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inventory Overview */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>
            Blood Type Overview
          </CardTitle>

          <CardDescription>
            Completed donation units recorded in the system
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              {bloodInventory.map(item => (
                <Card
                  key={item.type}
                  className="border-border"
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>{item.type}</span>

                      <Droplet className="w-4 h-4 text-primary fill-primary" />
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <div className="text-2xl font-bold text-foreground">
                      {item.units}
                    </div>

                    <p className="text-xs text-foreground/60 mt-1">
                      completed units
                    </p>

                    <Badge
                      className={`mt-2 text-xs ${getStatusClass(
                        item.status
                      )}`}
                    >
                      {item.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Low Stock Alert */}
      <Card className="border-destructive bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Blood Availability Alert
          </CardTitle>

          <CardDescription>
            Blood types with five or fewer completed donated units
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : lowStockItems.length === 0 ? (
            <div className="flex items-center gap-2 p-4 bg-background rounded border border-border">
              <PackageCheck className="w-5 h-5 text-green-600" />

              <p className="text-sm text-foreground">
                No blood types are currently in the low-availability range.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {lowStockItems.map(item => (
                <div
                  key={item.type}
                  className="flex items-center justify-between p-3 bg-background rounded border border-border"
                >
                  <div className="flex items-center gap-3">
                    <Droplet className="w-4 h-4 text-primary fill-primary" />

                    <span className="font-semibold text-foreground">
                      {item.type}
                    </span>

                    <span className="text-sm text-foreground/60">
                      {item.units} completed units
                    </span>
                  </div>

                  <Badge
                    className={getStatusClass(
                      item.status
                    )}
                  >
                    {item.status.toUpperCase()}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Critical Types */}
      {!loading &&
        criticalItems.length > 0 && (
          <Card className="border-red-300 bg-red-50 dark:bg-red-950/20">
            <CardHeader>
              <CardTitle className="text-red-700 dark:text-red-400">
                Critical Availability
              </CardTitle>

              <CardDescription>
                These blood types have two or fewer completed donated units recorded.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
                {criticalItems.map(item => (
                  <div
                    key={item.type}
                    className="p-4 bg-background rounded-lg border border-red-200 dark:border-red-900"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">
                        {item.type}
                      </span>

                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    </div>

                    <p className="text-2xl font-bold text-red-600 mt-2">
                      {item.units}
                    </p>

                    <p className="text-xs text-foreground/60">
                      completed units
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Explanation */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>
            Data Source
          </CardTitle>
        </CardHeader>

        <CardContent>
          <p className="text-sm text-foreground/70">
            The values shown above are calculated from completed
            donation records in Firestore. They are not hardcoded
            inventory values.
          </p>

          <p className="text-sm text-foreground/70 mt-2">
            A separate physical-stock inventory is not modified from
            this page because the current application does not have a
            confirmed inventory collection or stock-management
            operation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}