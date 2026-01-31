'use client';

import { useEffect, useState } from "react";
import { getStats } from "@/lib/services/stats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Heart, Users, Droplet, TrendingUp } from 'lucide-react';

export default function StatsPage() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    getStats().then(setStats);
  }, []);

  if (!stats) return <div className="p-8">Loading stats...</div>;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold">Statistics & Analytics</h1>
        <p className="text-muted-foreground mt-2">Live system analytics</p>
      </div>

      {/* KPI Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2"><Heart className="w-4" /> Total Donors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalDonors}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2"><Users className="w-4" /> Active Recipients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalRecipients}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2"><Droplet className="w-4" /> Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalRequests}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2"><TrendingUp className="w-4" /> Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.successRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Donation Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats.donationTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="donations" stroke="#ef4444" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blood Type Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={stats.bloodTypeData} dataKey="value" nameKey="name" label>
                  {stats.bloodTypeData.map((_: any, i: number) => (
                    <Cell key={i} fill={["#ef4444","#f97316","#eab308","#22c55e","#0ea5e9"][i % 5]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Requests vs Fulfilled</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.requestChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="requests" fill="#f97316" />
                <Bar dataKey="fulfilled" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
