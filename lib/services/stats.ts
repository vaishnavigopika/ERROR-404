import { db } from "@/lib/firebase"
import { collection, getDocs } from "firebase/firestore"

export async function getStats() {
  const usersSnap = await getDocs(collection(db, "users"))
  const requestsSnap = await getDocs(collection(db, "bloodRequests"))

  const users = usersSnap.docs.map(d => d.data())
  const requests = requestsSnap.docs.map(d => d.data())

  const donors = users.filter(u => u.role === "donor")
  const recipients = users.filter(u => u.role === "recipient")

  // Blood type distribution
  const bloodMap: any = {}
  donors.forEach(d => {
    bloodMap[d.bloodType] = (bloodMap[d.bloodType] || 0) + 1
  })

  const bloodTypeData = Object.keys(bloodMap).map(type => ({
    name: type,
    value: bloodMap[type]
  }))

  // Monthly donation trend (based on requests)
  const monthMap: any = {}
  requests.forEach(r => {
  if (!r.createdAt || !r.createdAt.seconds) return;

  const month = new Date(r.createdAt.seconds * 1000)
    .toLocaleString("en-US", { month: "short" });

  monthMap[month] = (monthMap[month] || 0) + 1;
 });


  const donationTrendData = Object.keys(monthMap).map(m => ({
    month: m,
    donations: monthMap[m]
  }))

  // Requests vs fulfilled
  const requestChartData = donationTrendData.map(item => ({
    month: item.month,
    requests: item.donations,
    fulfilled: Math.floor(item.donations * 0.7) // demo logic
  }))

  const totalFulfilled = requestChartData.reduce(
    (sum, i) => sum + i.fulfilled,
    0
  )

  return {
    totalDonors: donors.length,
    totalRecipients: recipients.length,
    totalRequests: requests.length,
    successRate:
      requests.length === 0
        ? 0
        : Math.round((totalFulfilled / requests.length) * 100),
    bloodTypeData,
    donationTrendData,
    requestChartData
  }
}
